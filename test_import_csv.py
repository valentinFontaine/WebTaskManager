#!/usr/bin/env python3
"""
Contrat de test pour l'import CSV en masse (fonction pure).

Module NON ECRIT a la date de ce fichier : `import_csv.py` n'existe pas.
Ce fichier doit donc echouer a la COLLECTION (ImportError sur `import
import_csv`), pas a l'execution -- c'est le seul rouge attendu avant
implementation. Voir aussi test_import_routes.py pour les routes (404
attendu avant implementation).

CONTRAT DU MODULE `import_csv.py` (a ecrire) :

    NAMESPACE : uuid.UUID
        Namespace fixe, utilise pour deriver l'identite des taches.

    analyser(texte_csv: str, taches_existantes: list[dict]) -> objet avec :
        .taches   : list[dict]   -- objets prets pour `task import`, jamais
                                    de cle "ref".
        .erreurs  : list[dict]   -- {"ligne": int, "colonne": str, "message": str}
                                    ligne = numero de ligne PHYSIQUE du fichier
                                    (en-tete = 1).
        .aretes   : list[dict]   -- {"de": uuid_predecesseur, "vers": uuid_dependant}
                                    meme convention que `construire_graphe`
                                    dans main_fastapi.py.

Identite (mesuree comme verite, voir le prompt d'origine) :
    uuid = uuid5(NAMESPACE, f"{projet}/{ref}")          si ref present
    uuid = uuid5(NAMESPACE, f"{projet}/{description}")  sinon

Forme de estTime choisie : ISO-8601 (PT..., P...). Justification : le
planificateur voisin (TaskWarriorPlanner/planif/duree.py, fonction
parse_duree) n'accepte que deux formes -- l'ISO-8601 complet, ou UN nombre
suivi d'UNE unite (`2h`, `30min`, ...). Il rejette explicitement `1h30`
(unites combinees), tout comme Taskwarrior lui-meme (AGENTS.md SS5). Seule la
forme ISO-8601 sait exprimer une duree a unites combinees en un seul token
(`1h30` -> `PT1H30M`) : c'est donc la forme de sortie retenue, pour que le
planificateur relise correctement toute duree acceptee ici en entree.

Fusion avec l'existant -- regle generale et exception `scheduled` :
Pour toute colonne presente dans l'en-tete, une cellule vide vaut "champ
omis" et efface le champ existant ; une cellule renseignee le remplace.
Exception : `scheduled` n'est pas un contenu du fichier mais un etat du
planning (pose par le planificateur ou par +fige). Dans une colonne
`scheduled` presente, une cellule VIDE ne l'efface JAMAIS -- le `scheduled`
existant est conserve ; une cellule renseignee le remplace comme les autres
champs. Raison : le modele de fichier porte une colonne `scheduled` le plus
souvent vide ; sans cette exception, chaque reimport effacerait le planning,
y compris celui des taches +fige.

Ce fichier ne teste PAS les routes HTTP (voir test_import_routes.py) ni
l'integration reelle avec le binaire `task` (test d'integration a la fin de
ce meme fichier, skip si `task` est absent).
"""

import copy
import csv
import io
import shutil
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone

import pytest

import import_csv  # doit echouer ici, module absent avant implementation
from import_csv import analyser


# --- Aides de construction ---------------------------------------------------

HEADER = "ref;description;projet;tags;estTime;due;scheduled;priorite;depend_de"

EXEMPLE_CSV = (
    "ref;description;projet;tags;estTime;due;scheduled;priorite;depend_de\n"
    "devis;Demander 3 devis;NPD.Orion.achats;pro;2h;;;M;\n"
    "attente;Reponse fournisseurs;NPD.Orion.achats;externe;10j;;;;devis\n"
    "choix;Choisir le fournisseur;NPD.Orion.achats;pro;1h;;;;attente\n"
    "cde;Passer la commande;NPD.Orion.commandes;pro;1h;30/10/2026;;H;choix\n"
    "plan;Plan de montage;NPD.Orion;pro;4h;;;;devis, choix\n"
)


def _uuid_pour(projet, ref_ou_description):
    """Calcule l'uuid attendu avec la meme formule que le module."""
    return str(uuid.uuid5(import_csv.NAMESPACE, f"{projet}/{ref_ou_description}"))


def _tache_existante(uuid_str, description, **champs):
    """Construit un enregistrement d'export Taskwarrior minimal + extensions."""
    base = {"uuid": uuid_str, "description": description, "status": "pending"}
    base.update(champs)
    return base


def _utc_attendu(local_naif):
    """Meme conversion que `task add due:AAAA-MM-JJ` : minuit local -> UTC.

    `datetime.astimezone()` sur un naif le suppose deja en heure locale
    systeme (doc Python) -- c'est la conversion attendue ici.
    """
    return local_naif.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _par_description(taches, description):
    trouvees = [t for t in taches if t.get("description") == description]
    assert len(trouvees) == 1, f"description {description!r} non trouvee ou dupliquee"
    return trouvees[0]


def _messages(erreurs):
    return [e["message"].lower() for e in erreurs]


# --- 1. Exemple complet de la proposition ------------------------------------

class TestExempleComplet:
    def test_zero_erreur(self):
        resultat = analyser(EXEMPLE_CSV, [])
        assert resultat.erreurs == []

    def test_cinq_taches_produites(self):
        resultat = analyser(EXEMPLE_CSV, [])
        assert len(resultat.taches) == 5

    def test_ref_jamais_dans_les_objets_produits(self):
        resultat = analyser(EXEMPLE_CSV, [])
        for tache in resultat.taches:
            assert "ref" not in tache

    def test_aretes_attendues(self):
        resultat = analyser(EXEMPLE_CSV, [])
        u_devis = _uuid_pour("NPD.Orion.achats", "devis")
        u_attente = _uuid_pour("NPD.Orion.achats", "attente")
        u_choix = _uuid_pour("NPD.Orion.achats", "choix")
        u_cde = _uuid_pour("NPD.Orion.commandes", "cde")
        u_plan = _uuid_pour("NPD.Orion", "plan")

        attendues = {
            (u_devis, u_attente),
            (u_attente, u_choix),
            (u_choix, u_cde),
            (u_devis, u_plan),
            (u_choix, u_plan),
        }
        obtenues = {(a["de"], a["vers"]) for a in resultat.aretes}
        assert obtenues == attendues

    def test_due_de_cde_convertie_en_utc(self):
        resultat = analyser(EXEMPLE_CSV, [])
        cde = _par_description(resultat.taches, "Passer la commande")
        attendu = _utc_attendu(datetime(2026, 10, 30, 0, 0, 0))
        assert cde["due"] == attendu

    def test_esttime_normalise_en_iso(self):
        resultat = analyser(EXEMPLE_CSV, [])
        devis = _par_description(resultat.taches, "Demander 3 devis")
        assert devis["estTime"] == "PT2H"


# --- 2. '^' : reference a la ligne non vide precedente -----------------------

class TestCaretLignePrecedente:
    def test_caret_designe_la_ligne_non_vide_precedente(self):
        texte = (
            HEADER + "\n"
            "a;Tache A;Proj;;;;;;\n"
            "\n"  # ligne entierement vide, ignoree, ne casse pas '^'
            "b;Tache B;Proj;;;;;;^\n"
        )
        resultat = analyser(texte, [])
        assert resultat.erreurs == []
        u_a = _uuid_pour("Proj", "a")
        u_b = _uuid_pour("Proj", "b")
        assert {"de": u_a, "vers": u_b} in resultat.aretes


# --- 3. Prefixe hexadecimal de tache existante --------------------------------

class TestPrefixeExistant:
    def test_prefixe_unique_resolu(self):
        existante = _tache_existante("abcdef12-3456-7890-abcd-ef1234567890", "Existante")
        texte = HEADER + "\n" + "n;Nouvelle;Proj;;;;;;abcdef12\n"
        resultat = analyser(texte, [existante])
        assert resultat.erreurs == []
        u_n = _uuid_pour("Proj", "n")
        assert {"de": "abcdef12-3456-7890-abcd-ef1234567890", "vers": u_n} in resultat.aretes

    def test_prefixe_ambigu_en_erreur(self):
        e1 = _tache_existante("abcdef12-1111-1111-1111-111111111111", "E1")
        e2 = _tache_existante("abcdef12-2222-2222-2222-222222222222", "E2")
        texte = HEADER + "\n" + "n;Nouvelle;Proj;;;;;;abcdef12\n"
        resultat = analyser(texte, [e1, e2])
        assert len(resultat.erreurs) == 1
        assert resultat.erreurs[0]["ligne"] == 2
        assert "ambigu" in resultat.erreurs[0]["message"].lower()


# --- 4. Ref inconnue ----------------------------------------------------------

class TestRefInconnue:
    def test_ref_absente_du_lot_et_de_l_existant(self):
        texte = HEADER + "\n" + "n;Nouvelle;Proj;;;;;;fantome\n"
        resultat = analyser(texte, [])
        assert len(resultat.erreurs) == 1
        assert resultat.erreurs[0]["ligne"] == 2
        message = resultat.erreurs[0]["message"].lower()
        assert "inconnu" in message


# --- 5. Cycle interne au fichier ----------------------------------------------

class TestCycleInterne:
    def test_cycle_direct_signale_avec_les_lignes(self):
        texte = (
            HEADER + "\n"
            "a;Tache A;Proj;;;;;;b\n"
            "b;Tache B;Proj;;;;;;a\n"
        )
        resultat = analyser(texte, [])
        assert len(resultat.erreurs) >= 1
        cycle = [e for e in resultat.erreurs if "cycl" in e["message"].lower()]
        assert cycle, f"aucune erreur de cycle trouvee parmi {resultat.erreurs}"
        message = cycle[0]["message"]
        assert "2" in message and "3" in message


# --- 6. Cycle passant par une tache existante ---------------------------------

class TestCycleParExistante:
    def test_cycle_via_tache_existante_signale(self):
        # y est une ligne du fichier ; on precalcule son uuid pour faire
        # dependre une tache EXISTANTE de cette future tache -> cycle.
        u_y = _uuid_pour("Proj", "y")
        existante = _tache_existante(
            "fedcba98-0000-0000-0000-000000000000", "Existante X",
            depends=[u_y],
        )
        # y (ligne du fichier) depend du prefixe de l'existante -> cycle
        # X -> y -> X
        texte = HEADER + "\n" + "y;Tache Y;Proj;;;;;;fedcba98\n"
        resultat = analyser(texte, [existante])
        cycle = [e for e in resultat.erreurs if "cycl" in e["message"].lower()]
        assert cycle, f"aucune erreur de cycle trouvee parmi {resultat.erreurs}"


# --- 7. Ref en double ----------------------------------------------------------

class TestRefEnDouble:
    def test_ref_dupliquee_dans_le_fichier(self):
        texte = (
            HEADER + "\n"
            "x;Premiere;Proj;;;;;;\n"
            "x;Seconde;Proj;;;;;;\n"
        )
        resultat = analyser(texte, [])
        assert len(resultat.erreurs) == 1
        assert resultat.erreurs[0]["ligne"] == 3
        assert "double" in resultat.erreurs[0]["message"].lower() or "dupli" in resultat.erreurs[0]["message"].lower()

    def test_deux_lignes_sans_ref_meme_projet_meme_description(self):
        texte = (
            "description;projet\n"
            "Meme description;Proj\n"
            "Meme description;Proj\n"
        )
        resultat = analyser(texte, [])
        assert len(resultat.erreurs) == 1
        assert resultat.erreurs[0]["ligne"] == 3


# --- 8. Date JJ/MM/AAAA --------------------------------------------------------

class TestDateJourMoisAnnee:
    def test_date_sans_heure(self):
        texte = HEADER + "\n" + "a;Tache A;Proj;;;15/03/2027;;;\n"
        resultat = analyser(texte, [])
        assert resultat.erreurs == []
        tache = resultat.taches[0]
        assert tache["due"] == _utc_attendu(datetime(2027, 3, 15, 0, 0, 0))

    def test_date_avec_heure(self):
        texte = HEADER + "\n" + "a;Tache A;Proj;;;15/03/2027 14:30;;;\n"
        resultat = analyser(texte, [])
        assert resultat.erreurs == []
        tache = resultat.taches[0]
        assert tache["due"] == _utc_attendu(datetime(2027, 3, 15, 14, 30, 0))

    def test_date_iso_avec_tirets(self):
        texte = HEADER + "\n" + "a;Tache A;Proj;;;2027-03-15;;;\n"
        resultat = analyser(texte, [])
        assert resultat.erreurs == []
        tache = resultat.taches[0]
        assert tache["due"] == _utc_attendu(datetime(2027, 3, 15, 0, 0, 0))


# --- 9. Date illisible ---------------------------------------------------------

class TestDateIllisible:
    def test_date_illisible_en_erreur_sur_la_cellule(self):
        texte = HEADER + "\n" + "a;Tache A;Proj;;;pas-une-date;;;\n"
        resultat = analyser(texte, [])
        assert len(resultat.erreurs) == 1
        assert resultat.erreurs[0]["ligne"] == 2
        assert resultat.erreurs[0]["colonne"].lower() in ("due", "echeance")


# --- 10. Separateur ',' vs ';' --------------------------------------------------

class TestSeparateur:
    def test_virgule_detectee(self):
        texte = (
            "ref,description,projet\n"
            "a,Tache A,Proj\n"
        )
        resultat = analyser(texte, [])
        assert resultat.erreurs == []
        assert len(resultat.taches) == 1
        assert resultat.taches[0]["description"] == "Tache A"

    def test_point_virgule_detecte(self):
        texte = (
            "ref;description;projet\n"
            "a;Tache A;Proj\n"
        )
        resultat = analyser(texte, [])
        assert resultat.erreurs == []
        assert len(resultat.taches) == 1


# --- 11. BOM UTF-8 tolere -------------------------------------------------------

class TestBOM:
    def test_bom_initial_tolere(self):
        texte = "﻿" + "ref;description;projet\n" + "a;Tache A;Proj\n"
        resultat = analyser(texte, [])
        assert resultat.erreurs == []
        assert len(resultat.taches) == 1
        # Le BOM ne doit pas se retrouver colle au nom de la premiere colonne
        assert resultat.taches[0]["description"] == "Tache A"


# --- 12. Description avec ';', ',' et guillemets --------------------------------

class TestDescriptionCsvComplexe:
    def test_description_avec_point_virgule_virgule_et_guillemets(self):
        buffer = io.StringIO()
        writer = csv.writer(buffer, delimiter=";")
        writer.writerow(["ref", "description", "projet"])
        writer.writerow(["a", 'Devis; "urgent", precision', "Proj"])
        resultat = analyser(buffer.getvalue(), [])
        assert resultat.erreurs == []
        assert resultat.taches[0]["description"] == 'Devis; "urgent", precision'


# --- 13. Alias anglais -----------------------------------------------------------

class TestAliasAnglais:
    def test_colonnes_anglaises_reconnues(self):
        texte = (
            "ref;description;project;tags;duree;due;scheduled;priority;depends\n"
            "a;Tache A;Proj;pro;1h;;;H;\n"
        )
        resultat = analyser(texte, [])
        assert resultat.erreurs == []
        assert resultat.taches[0]["project"] == "Proj"
        assert resultat.taches[0]["priority"] == "H"
        assert resultat.taches[0]["estTime"] == "PT1H"


# --- 14. Colonne inconnue ----------------------------------------------------------

class TestColonneInconnue:
    def test_colonne_non_reconnue_en_erreur_ligne_1(self):
        texte = "ref;description;projet;bidule\n" + "a;Tache A;Proj;x\n"
        resultat = analyser(texte, [])
        assert len(resultat.erreurs) == 1
        assert resultat.erreurs[0]["ligne"] == 1
        assert "bidule" in resultat.erreurs[0]["colonne"]

    def test_colonne_description_absente_en_erreur(self):
        texte = "ref;projet\n" + "a;Proj\n"
        resultat = analyser(texte, [])
        assert len(resultat.erreurs) == 1
        assert resultat.erreurs[0]["ligne"] == 1


# --- 15. Tag invalide ---------------------------------------------------------------

class TestTagInvalide:
    def test_tag_avec_caractere_interdit(self):
        texte = HEADER + "\n" + "a;Tache A;Proj;bad!tag;;;;;\n"
        resultat = analyser(texte, [])
        assert len(resultat.erreurs) == 1
        assert resultat.erreurs[0]["ligne"] == 2

    def test_tag_commencant_par_tiret(self):
        texte = HEADER + "\n" + "a;Tache A;Proj;-oops;;;;;\n"
        resultat = analyser(texte, [])
        assert len(resultat.erreurs) == 1

    def test_plus_initial_tolere_et_retire(self):
        texte = HEADER + "\n" + "a;Tache A;Proj;+externe;;;;;\n"
        resultat = analyser(texte, [])
        assert resultat.erreurs == []
        assert resultat.taches[0]["tags"] == ["externe"]

    def test_tags_separes_par_espace_ou_virgule(self):
        texte = HEADER + "\n" + 'a;Tache A;Proj;"pro perso";;;;;\n'
        resultat = analyser(texte, [])
        assert resultat.erreurs == []
        assert set(resultat.taches[0]["tags"]) == {"pro", "perso"}


# --- 16. Reimport = memes uuids -----------------------------------------------------

class TestReimportMemesUuids:
    def test_deux_analyses_du_meme_fichier_donnent_les_memes_uuids(self):
        r1 = analyser(EXEMPLE_CSV, [])
        r2 = analyser(EXEMPLE_CSV, [])
        uuids1 = sorted(t["uuid"] for t in r1.taches)
        uuids2 = sorted(t["uuid"] for t in r2.taches)
        assert uuids1 == uuids2


# --- 17-22. Fusion avec l'existant ---------------------------------------------------

class TestFusionAvecExistant:
    def _existante_complete(self):
        u = _uuid_pour("Proj", "a")
        return u, _tache_existante(
            u, "Ancienne description",
            project="Proj",
            status="pending",
            entry="20260101T000000Z",
            tags=["fige", "pro"],
            estTime="PT3H",
            due="20261001T000000Z",
            scheduled="20260915T080000Z",
            annotations=[{"entry": "20260101T000000Z", "description": "note existante"}],
            assignee="bob",
        )

    def test_champ_absent_de_l_entete_conserve(self):
        u, existante = self._existante_complete()
        # En-tete sans colonne estTime ni due : ces champs doivent rester
        # intacts dans l'objet fusionne.
        texte = "ref;description;projet\n" + f"a;Nouvelle description;Proj\n"
        resultat = analyser(texte, [existante])
        assert resultat.erreurs == []
        fusion = resultat.taches[0]
        assert fusion["uuid"] == u
        assert fusion["estTime"] == "PT3H"
        assert fusion["due"] == "20261001T000000Z"
        assert fusion["scheduled"] == "20260915T080000Z"

    def test_cellule_vide_dans_colonne_presente_efface_le_champ(self):
        u, existante = self._existante_complete()
        texte = HEADER + "\n" + "a;Ancienne description;Proj;;;;;;\n"
        resultat = analyser(texte, [existante])
        assert resultat.erreurs == []
        fusion = resultat.taches[0]
        assert "estTime" not in fusion
        assert "due" not in fusion

    def test_cellule_scheduled_vide_conserve_le_scheduled_existant(self):
        # Exception a la regle generale : scheduled est un etat du planning,
        # pas un contenu du fichier. Cellule vide -> scheduled existant garde.
        u, existante = self._existante_complete()
        texte = HEADER + "\n" + "a;Ancienne description;Proj;;;;;;\n"
        resultat = analyser(texte, [existante])
        assert resultat.erreurs == []
        fusion = resultat.taches[0]
        assert fusion["scheduled"] == "20260915T080000Z"

    def test_cellule_scheduled_renseignee_remplace(self):
        # Meme convention de date que la colonne due (JJ/MM/AAAA).
        u, existante = self._existante_complete()
        texte = HEADER + "\n" + "a;Ancienne description;Proj;;;;25/12/2026;;\n"
        resultat = analyser(texte, [existante])
        assert resultat.erreurs == []
        fusion = resultat.taches[0]
        assert fusion["scheduled"] == _utc_attendu(datetime(2026, 12, 25, 0, 0, 0))

    def test_status_completed_conserve(self):
        u = _uuid_pour("Proj", "a")
        existante = _tache_existante(
            u, "Tache close", project="Proj", status="completed",
            entry="20260101T000000Z", end="20260102T000000Z",
        )
        texte = "ref;description;projet\n" + "a;Description a jour;Proj\n"
        resultat = analyser(texte, [existante])
        assert resultat.erreurs == []
        fusion = resultat.taches[0]
        assert fusion["status"] == "completed"
        assert fusion["entry"] == "20260101T000000Z"
        assert fusion["end"] == "20260102T000000Z"
        assert fusion["description"] == "Description a jour"

    def test_annotations_conservees(self):
        u, existante = self._existante_complete()
        texte = "ref;description;projet\n" + "a;Nouvelle description;Proj\n"
        resultat = analyser(texte, [existante])
        fusion = resultat.taches[0]
        assert fusion["annotations"] == existante["annotations"]

    def test_fige_conserve_meme_si_absent_de_la_colonne_tags(self):
        u, existante = self._existante_complete()
        texte = HEADER + "\n" + "a;Ancienne description;Proj;urgent;;;;;\n"
        resultat = analyser(texte, [existante])
        assert resultat.erreurs == []
        fusion = resultat.taches[0]
        assert "fige" in fusion["tags"]
        assert "urgent" in fusion["tags"]

    def test_ref_jamais_produite_meme_en_fusion(self):
        u, existante = self._existante_complete()
        texte = "ref;description;projet\n" + "a;Nouvelle description;Proj\n"
        resultat = analyser(texte, [existante])
        assert "ref" not in resultat.taches[0]

    def test_nouvelle_tache_sans_status_ni_entry(self):
        texte = "ref;description;projet\n" + "n;Toute nouvelle;Proj\n"
        resultat = analyser(texte, [])
        assert resultat.erreurs == []
        fusion = resultat.taches[0]
        assert "status" not in fusion
        assert "entry" not in fusion


# --- 23. Auto-dependance ------------------------------------------------------------

class TestAutoDependance:
    def test_auto_dependance_en_erreur(self):
        texte = HEADER + "\n" + "a;Tache A;Proj;;;;;;a\n"
        resultat = analyser(texte, [])
        assert len(resultat.erreurs) == 1
        assert resultat.erreurs[0]["ligne"] == 2


# --- 24. Lignes entierement vides ignorees ------------------------------------------

class TestLignesVidesIgnorees:
    def test_ligne_vide_ne_produit_ni_tache_ni_erreur(self):
        texte = (
            HEADER + "\n"
            "a;Tache A;Proj;;;;;;\n"
            "\n"
            "b;Tache B;Proj;;;;;;\n"
        )
        resultat = analyser(texte, [])
        assert resultat.erreurs == []
        assert len(resultat.taches) == 2


# --- 25. BUG mesure bout en bout (fusion tous statuts) : prefixe de 8 hex ----
# ignore les taches deleted -------------------------------------------------
#
# Decision d'architecte (voir aussi test_import_routes.py) : la fusion se
# fait contre TOUTES les taches, quel que soit leur statut. Consequence pour
# la resolution des prefixes de 8 hex dans depend_de : une tache deleted ne
# doit PAS pouvoir etre choisie comme cible, sinon un CSV recree une
# dependance vers une tache que l'utilisateur a explicitement supprimee.
# Code actuel : `existantes_par_uuid` (import_csv.py) est construit sans
# filtrer le statut -- une tache deleted est donc aujourd'hui un candidat
# valide a la resolution de prefixe. Ce test doit etre ROUGE sur le code
# actuel : le prefixe se resout au lieu d'echouer.

class TestPrefixeIgnoreDeleted:
    def test_prefixe_qui_ne_correspond_qu_a_une_tache_deleted_est_inconnu(self):
        existante_supprimee = _tache_existante(
            "abcdef12-3456-7890-abcd-ef1234567890", "Supprimee", status="deleted"
        )
        texte = HEADER + "\n" + "n;Nouvelle;Proj;;;;;;abcdef12\n"
        resultat = analyser(texte, [existante_supprimee])

        assert len(resultat.erreurs) == 1
        assert resultat.erreurs[0]["ligne"] == 2
        assert "inconnu" in resultat.erreurs[0]["message"].lower()
        # Aucune arete ne doit viser la tache supprimee.
        assert resultat.aretes == []


# --- 26. Trou I6 : colonne absente de l'en-tete ecrase quand meme le champ --
#
# Regle du module (docstring en tete) : une colonne ABSENTE de l'en-tete
# signifie "champ non gere par cet import" -- le champ existant doit rester
# intact. Seule une colonne PRESENTE mais a cellule vide efface le champ.
# Ce test doit etre VERT sur le code actuel (les gardes `if champ not in
# champs_presents: continue` d'import_csv.py respectent deja cette regle) ;
# il sert de filet pour une regression qui ferait omettre les champs non
# presents au lieu de les laisser intacts (mutation I6, testee separement
# par l'implementeur/le rapport de ce contrat, jamais laissee dans le code).

class TestI6ChampsAbsentsDeLEnteteInchanges:
    def test_entete_reduite_ne_touche_pas_due_priority_esttime(self):
        existante = _tache_existante(
            _uuid_pour("Proj", "a"), "Ancienne description",
            due="20261030T000000Z", priority="H", estTime="PT2H",
        )
        # En-tete reduite : ni due, ni priority, ni estTime.
        texte = "ref;description;projet\n" + "a;Nouvelle description;Proj\n"
        resultat = analyser(texte, [existante])

        assert resultat.erreurs == []
        assert len(resultat.taches) == 1
        tache = resultat.taches[0]
        assert tache["due"] == "20261030T000000Z"
        assert tache["priority"] == "H"
        assert tache["estTime"] == "PT2H"
        assert tache["description"] == "Nouvelle description"


# --- Integration reelle (skip si `task` absent) --------------------------------------

TASK_DISPONIBLE = shutil.which("task") is not None


@pytest.mark.skipif(not TASK_DISPONIBLE, reason="binaire 'task' absent de l'environnement")
class TestIntegrationReelle:
    """
    Un seul scenario, sur une base Taskwarrior jetable (tmp_path), qui exerce
    la chaine complete : analyser() -> JSON -> `task import` -> `task export`.

    N'importe JAMAIS sans TASKRC pointant sur cette base temporaire (AGENTS.md
    SS3, CLAUDE.md du depot).
    """

    @pytest.fixture
    def taskrc(self, tmp_path):
        data_dir = tmp_path / "data"
        data_dir.mkdir()
        taskrc_path = tmp_path / "taskrc"
        taskrc_path.write_text(
            "data.location={}\n"
            "confirmation=off\n"
            "uda.estTime.type=duration\n"
            "uda.estTime.label=Est Time\n".format(str(data_dir).replace("\\", "/")),
            encoding="utf-8",
        )
        return str(taskrc_path)

    def _task(self, taskrc, *args):
        return subprocess.run(
            ["task", "rc:" + taskrc, *args],
            capture_output=True, text=True, encoding="utf-8",
        )

    def _importer(self, taskrc, taches):
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", encoding="utf-8", delete=False
        ) as handle:
            import json
            json.dump(taches, handle, ensure_ascii=False)
            chemin = handle.name
        resultat = self._task(taskrc, "import", chemin)
        return resultat

    def test_import_puis_reimport_avec_modification_manuelle(self, taskrc):
        import json

        resultat = analyser(EXEMPLE_CSV, [])
        assert resultat.erreurs == []

        proc = self._importer(taskrc, resultat.taches)
        assert proc.returncode == 0, proc.stderr

        export = self._task(taskrc, "export")
        taches_exportees = json.loads(export.stdout)
        assert len(taches_exportees) == 5
        for t in taches_exportees:
            assert "ref" not in t

        # depends corrects : la tache "plan" doit referencer devis et choix
        u_devis = _uuid_pour("NPD.Orion.achats", "devis")
        u_choix = _uuid_pour("NPD.Orion.achats", "choix")
        plan = _par_description(taches_exportees, "Plan de montage")
        assert set(plan.get("depends", [])) == {u_devis, u_choix}

        # Modification manuelle d'une tache existante : scheduled + fige, et
        # marquer une autre tache completed.
        u_devis_uuid = u_devis
        mod = self._task(
            taskrc, "rc.confirmation=off", u_devis_uuid, "modify",
            "scheduled:2027-01-01", "+fige",
        )
        assert mod.returncode == 0, mod.stderr
        done = self._task(taskrc, "rc.confirmation=off", u_choix, "done")
        assert done.returncode == 0, done.stderr

        # Reimport du meme CSV, description de "devis" changee.
        texte_modifie = EXEMPLE_CSV.replace(
            "Demander 3 devis", "Demander 3 devis (relance)"
        )
        existantes_apres_maj = json.loads(self._task(taskrc, "export").stdout)
        resultat2 = analyser(texte_modifie, existantes_apres_maj)
        assert resultat2.erreurs == []

        proc2 = self._importer(taskrc, resultat2.taches)
        assert proc2.returncode == 0, proc2.stderr

        export2 = json.loads(self._task(taskrc, "export").stdout)
        assert len(export2) == 5  # pas de doublon

        devis_final = next(t for t in export2 if t["uuid"] == u_devis_uuid)
        assert devis_final["description"] == "Demander 3 devis (relance)"
        # Valeur posee a la main (minuit local du 01/01/2027, converti en UTC
        # par task) : le reimport doit la laisser intacte.
        assert devis_final.get("scheduled") == _utc_attendu(datetime(2027, 1, 1))
        assert "fige" in devis_final.get("tags", [])

        choix_final = next(t for t in export2 if t["uuid"] == u_choix)
        assert choix_final["status"] == "completed"
