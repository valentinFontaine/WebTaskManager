#!/usr/bin/env python3
"""
Contrat de test pour les routes d'import CSV : POST /api/import/apercu et
POST /api/import.

Routes NON ECRITES a la date de ce fichier : ces tests doivent echouer avec
un 404 (route absente), pas avec une erreur de mock ou d'import -- c'est le
seul rouge attendu avant implementation.

Forme de run_task_command (main_fastapi.py) : renvoie une instance pydantic
CommandResult (fastapi_models.py), jamais un CompletedProcess brut (voir
test_depends.py pour le meme rappel). Les tests mockent
'main_fastapi.run_task_command'.

Contrat suppose des deux routes (voir le prompt d'origine pour le detail) :

    POST /api/import/apercu   corps {"csv": "<texte>"}
        -> 200 {"taches": [...], "erreurs": [...], "graphe": {"noeuds": [...], "aretes": [...]}}
        Aucune commande d'ECRITURE (pas de `task import`). Un ou plusieurs
        appels de LECTURE (export de l'existant) sont attendus et sans objet
        ici : seule l'absence d'ecriture est verifiee.

    POST /api/import          corps {"csv": "<texte>"}
        -> s'il y a la moindre erreur d'analyse : 400 {"detail": {"erreurs": [...]}}
           et AUCUNE commande d'ECRITURE (interpretation retenue : la lecture
           de l'existant, necessaire pour analyser, n'est pas elle-meme une
           ecriture -- voir l'ambiguite documentee dans le rapport de ce
           contrat).
        -> sinon : ecrit les objets produits dans un fichier JSON temporaire
           et lance EXACTEMENT UNE commande `task ... import <chemin>`,
           renvoie 200 {"success": true, "creees": n, "mises_a_jour": m}.
        -> si `task import` echoue (returncode != 0) : 502 ou 500, jamais 200,
           avec le stderr de Taskwarrior dans le detail de la reponse.

AMBIGUITE DE SPEC signalee explicitement (a trancher par l'implementeur ou
au retour de ce contrat) : la forme exacte de "graphe" (est-ce
`construire_graphe(...)` rappelee telle quelle avec un parametre `projet`,
ou une projection directe de `.aretes`/`.taches` du resultat d'analyse, vu
qu'un CSV peut toucher plusieurs projets a la fois comme dans l'exemple
complet) n'est pas fixee ici. Les tests ci-dessous ne verifient que la forme
minimale garantie par l'enonce : les cles "noeuds" et "aretes" existent, et
"aretes" a la meme cardinalite que les dependances du lot.

--- BUG mesure bout en bout : fusion limitee aux taches pending ---------------

`_existantes_pour_import()` (main_fastapi.py) appelle
`task status:pending export` : une tache COMPLETED (ou deleted, waiting,
recurring) dont l'uuid derive correspond a une ligne du CSV est invisible a
la fusion. `import_csv.analyser` ne la trouve donc pas dans
`taches_existantes`, produit un objet nu sans "status", et `task import`
rouvre la tache (pending). Le compteur "creees" la compte aussi a tort
(alors qu'elle existait deja).

Spec (decision d'architecte) : la fusion se fait contre TOUTES les taches,
quel que soit leur statut (pending, waiting, completed, deleted, recurring).
Le statut n'est JAMAIS modifie par le CSV : une tache terminee reste
terminee et une tache supprimee reste supprimee (pas de resurrection). Une
tache existante de n'importe quel statut compte en "mise a jour", jamais en
"creee". La resolution des prefixes de 8 hex dans depend_de ignore les
taches deleted (voir test_import_csv.py, TestPrefixeIgnoreDeleted) : une
tache supprimee ne doit pas pouvoir redevenir une cible de dependance valide
via un reimport.

Tests ci-dessous (classes TestFusionTousStatutsReelle et
TestFusionTousStatutsMock) : voir leurs docstrings respectives pour le detail
(integration reelle via TestClient sur base jetable, puis route mockee
controlant le filtre envoye a `task ... export`). Les deux sont ROUGES sur
le code actuel, pour la raison ci-dessus (et non pour une autre raison --
verifie a l'ecriture de ce contrat).
"""

import json
import os
import re
import subprocess
import tempfile
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import import_csv
import main_fastapi
from main_fastapi import app
from fastapi_models import CommandResult

client = TestClient(app)


EXEMPLE_CSV = (
    "ref;description;projet;tags;estTime;due;scheduled;priorite;depend_de\n"
    "devis;Demander 3 devis;NPD.Orion.achats;pro;2h;;;M;\n"
    "attente;Reponse fournisseurs;NPD.Orion.achats;externe;10j;;;;devis\n"
    "choix;Choisir le fournisseur;NPD.Orion.achats;pro;1h;;;;attente\n"
    "cde;Passer la commande;NPD.Orion.commandes;pro;1h;30/10/2026;;H;choix\n"
    "plan;Plan de montage;NPD.Orion;pro;4h;;;;devis, choix\n"
)

CSV_EN_ERREUR = "ref;description;projet;bidule\n" + "a;Tache A;Proj;x\n"

CSV_SIMPLE_VALIDE = "ref;description;projet\n" + "a;Tache A;Proj\n"


_MOTIF_IMPORT = re.compile(r"\btask\b.*\bimport\b", re.IGNORECASE)


def _est_commande_import(commande):
    return bool(_MOTIF_IMPORT.search(commande))


def _appel_import(mock):
    """Renvoie la (seule) commande d'import parmi les appels du mock."""
    imports = [
        c[0][0] for c in mock.call_args_list
        if _est_commande_import(c[0][0])
    ]
    return imports


def _reponse_export_vide():
    return CommandResult(success=True, stdout="[]", stderr="", returncode=0)


# --- 1. Apercu : jamais d'ecriture, forme de la reponse ----------------------

class TestApercu:
    def test_apercu_sans_erreur_200_et_cinq_taches(self):
        with patch("main_fastapi.run_task_command") as mock:
            mock.return_value = _reponse_export_vide()
            reponse = client.post("/api/import/apercu", json={"csv": EXEMPLE_CSV})

        assert reponse.status_code == 200, reponse.text
        corps = reponse.json()
        assert len(corps["taches"]) == 5
        assert corps["erreurs"] == []
        for t in corps["taches"]:
            assert t["nouvelle"] is True
            assert "uuid" in t and "description" in t and "ligne" in t

    def test_apercu_aucune_commande_d_ecriture(self):
        with patch("main_fastapi.run_task_command") as mock:
            mock.return_value = _reponse_export_vide()
            client.post("/api/import/apercu", json={"csv": EXEMPLE_CSV})

        assert _appel_import(mock) == []

    def test_apercu_graphe_a_la_cardinalite_attendue(self):
        with patch("main_fastapi.run_task_command") as mock:
            mock.return_value = _reponse_export_vide()
            reponse = client.post("/api/import/apercu", json={"csv": EXEMPLE_CSV})

        corps = reponse.json()
        assert "noeuds" in corps["graphe"]
        assert "aretes" in corps["graphe"]
        # devis->attente, attente->choix, choix->cde, devis->plan, choix->plan
        assert len(corps["graphe"]["aretes"]) == 5

    def test_apercu_avec_erreur_remonte_les_erreurs_sans_500(self):
        with patch("main_fastapi.run_task_command") as mock:
            mock.return_value = _reponse_export_vide()
            reponse = client.post("/api/import/apercu", json={"csv": CSV_EN_ERREUR})

        assert reponse.status_code == 200, reponse.text
        corps = reponse.json()
        assert len(corps["erreurs"]) == 1


# --- 2. Import refuse si erreur : 400, aucune ecriture -----------------------

class TestImportRefuseSurErreur:
    def test_400_sur_erreur_d_analyse(self):
        with patch("main_fastapi.run_task_command") as mock:
            mock.return_value = _reponse_export_vide()
            reponse = client.post("/api/import", json={"csv": CSV_EN_ERREUR})

        assert reponse.status_code == 400, reponse.text
        corps = reponse.json()
        assert len(corps["detail"]["erreurs"]) == 1

    def test_aucune_commande_d_ecriture_si_erreur(self):
        with patch("main_fastapi.run_task_command") as mock:
            mock.return_value = _reponse_export_vide()
            client.post("/api/import", json={"csv": CSV_EN_ERREUR})

        assert _appel_import(mock) == []


# --- 3. Import reussi : exactement une commande, fichier correct -------------

class TestImportReussi:
    def _mock_avec_capture(self, capture):
        """Construit le side_effect du mock : repond a l'export existant,
        et pour la commande d'import, LIT le fichier JSON avant de renvoyer
        le succes (le fichier est supprime par la route juste apres)."""

        def side_effect(commande):
            if _est_commande_import(commande):
                m = re.search(r'import\s+"?([^"\s]+)"?\s*$', commande.strip())
                assert m, f"chemin introuvable dans la commande : {commande!r}"
                chemin = m.group(1)
                with open(chemin, "r", encoding="utf-8") as f:
                    capture["contenu"] = json.load(f)
                capture["chemin"] = chemin
                return CommandResult(success=True, stdout="Imported 5 tasks.", stderr="", returncode=0)
            return _reponse_export_vide()

        return side_effect

    def test_une_seule_commande_d_import(self):
        capture = {}
        with patch("main_fastapi.run_task_command") as mock:
            mock.side_effect = self._mock_avec_capture(capture)
            reponse = client.post("/api/import", json={"csv": EXEMPLE_CSV})

        assert reponse.status_code == 200, reponse.text
        assert len(_appel_import(mock)) == 1

    def test_fichier_contient_les_objets_attendus(self):
        capture = {}
        with patch("main_fastapi.run_task_command") as mock:
            mock.side_effect = self._mock_avec_capture(capture)
            client.post("/api/import", json={"csv": EXEMPLE_CSV})

        assert "contenu" in capture
        assert len(capture["contenu"]) == 5
        descriptions = {t["description"] for t in capture["contenu"]}
        assert "Demander 3 devis" in descriptions
        for t in capture["contenu"]:
            assert "ref" not in t

    def test_reponse_indique_les_compteurs(self):
        capture = {}
        with patch("main_fastapi.run_task_command") as mock:
            mock.side_effect = self._mock_avec_capture(capture)
            reponse = client.post("/api/import", json={"csv": EXEMPLE_CSV})

        corps = reponse.json()
        assert corps["success"] is True
        assert corps["creees"] == 5
        assert corps["mises_a_jour"] == 0


# --- 4. Echec de `task import` : pas de succes -------------------------------

class TestEchecTaskImport:
    def _mock_echec(self):
        def side_effect(commande):
            if _est_commande_import(commande):
                return CommandResult(
                    success=False, stdout="",
                    stderr="Erreur Taskwarrior : donnee invalide",
                    returncode=2,
                )
            return _reponse_export_vide()

        return side_effect

    def test_echec_ne_renvoie_jamais_200(self):
        with patch("main_fastapi.run_task_command") as mock:
            mock.side_effect = self._mock_echec()
            reponse = client.post("/api/import", json={"csv": CSV_SIMPLE_VALIDE})

        assert reponse.status_code in (500, 502), reponse.text
        assert reponse.status_code != 200

    def test_stderr_remonte_dans_le_detail(self):
        with patch("main_fastapi.run_task_command") as mock:
            mock.side_effect = self._mock_echec()
            reponse = client.post("/api/import", json={"csv": CSV_SIMPLE_VALIDE})

        assert "Erreur Taskwarrior" in reponse.text


# --- 5. BUG mesure bout en bout : fusion limitee aux taches pending ----------
#
# Voir la docstring de tete de ce fichier pour la spec complete. Les deux
# classes ci-dessous exercent le meme defaut par deux voies : integration
# reelle par la route (base jetable, vrai binaire `task`), puis route mockee
# controlant explicitement le filtre envoye a `run_task_command`.

import shutil
import uuid

TASK_DISPONIBLE = shutil.which("task") is not None


def _uuid_pour(projet, ref_ou_description):
    return str(uuid.uuid5(import_csv.NAMESPACE, f"{projet}/{ref_ou_description}"))


@pytest.mark.skipif(not TASK_DISPONIBLE, reason="binaire 'task' absent de l'environnement")
class TestFusionTousStatutsReelle:
    """Integration reelle via TestClient, sur une base Taskwarrior jetable.

    `main_fastapi.DEVELOPER_MODE` est force a False (sinon `run_task_command`
    ne fait que journaliser) et `main_fastapi._TW_ENV` est repointe sur un
    TASKRC de tmp_path -- jamais sur une base reelle (AGENTS.md SS3, CLAUDE.md
    du depot).

    Scenario : importer l'exemple complet (5 taches), marquer une tache
    `done` et une autre `delete` a la main, puis reimporter le MEME CSV.
    Attendu (spec ci-dessus) : les deux statuts sont preserves (aucune
    resurrection), creees == 0, mises_a_jour == 5 au second import.

    Rouge sur le code actuel : `_existantes_pour_import()` ne voit que les
    taches pending, donc "choix" (marquee done) et "cde" (marquee deleted)
    redeviennent invisibles a la fusion -- `task import` les rouvre en
    pending et le compteur "creees" les recompte a tort.
    """

    @pytest.fixture
    def taskrc(self, tmp_path):
        data_dir = tmp_path / "data"
        data_dir.mkdir()
        taskrc_path = tmp_path / "taskrc"
        taskrc_path.write_text(
            "data.location={}\n"
            "confirmation=off\n"
            "bulk=0\n"
            "uda.estTime.type=duration\n"
            "uda.estTime.label=Est Time\n".format(str(data_dir).replace("\\", "/")),
            encoding="utf-8",
        )
        return str(taskrc_path)

    def _env_isole(self, taskrc):
        # Defaut d'instrument corrige ici : un TASKDATA herite de l'environnement
        # du processus pytest l'emporte sur data.location du taskrc temporaire.
        # On retire TASKDATA de l'env transmis, comme test_nuit3_figer.py le fait
        # pour sa fixture `vraie_base`.
        env = dict(os.environ)
        env.pop("TASKDATA", None)
        env["TASKRC"] = taskrc
        env["TW_WEB"] = "1"
        return env

    def _task(self, taskrc, *args, env=None):
        return subprocess.run(
            ["task", "rc:" + taskrc, *args],
            capture_output=True, text=True, encoding="utf-8",
            env=env,
        )

    def test_done_et_delete_survivent_a_un_reimport_du_meme_csv(self, taskrc, monkeypatch):
        monkeypatch.setattr(main_fastapi, "DEVELOPER_MODE", False)
        env = self._env_isole(taskrc)
        monkeypatch.setattr(main_fastapi, "_TW_ENV", env)

        # Isolation VERIFIEE avant toute ecriture : si la base resolue n'est
        # pas sous tmp_path (TASKDATA herite qui l'emporterait sur le taskrc),
        # on s'arrete sans rien ecrire.
        data_dir = os.path.dirname(taskrc) + os.sep + "data"
        resolue = self._task(taskrc, "_get", "rc.data.location", env=env)
        if data_dir.replace("\\", "/") not in resolue.stdout.replace("\\", "/"):
            pytest.fail(
                "isolation Taskwarrior non confirmee : rc.data.location resolu "
                f"({resolue.stdout.strip()!r}) ne pointe pas sous tmp_path "
                f"({data_dir!r}) -- TASKDATA herite de l'environnement pytest ? "
                "aucune ecriture tentee."
            )

        premier = client.post("/api/import", json={"csv": EXEMPLE_CSV})
        assert premier.status_code == 200, premier.text
        corps1 = premier.json()
        assert corps1["creees"] == 5, corps1
        assert corps1["mises_a_jour"] == 0, corps1

        uuid_choix = _uuid_pour("NPD.Orion.achats", "choix")
        uuid_cde = _uuid_pour("NPD.Orion.commandes", "cde")

        fait = self._task(taskrc, "rc.confirmation=off", uuid_choix, "done", env=env)
        assert fait.returncode == 0, fait.stderr
        supprime = self._task(taskrc, "rc.confirmation=off", uuid_cde, "delete", env=env)
        assert supprime.returncode == 0, supprime.stderr

        second = client.post("/api/import", json={"csv": EXEMPLE_CSV})
        assert second.status_code == 200, second.text
        corps2 = second.json()
        assert corps2["creees"] == 0, corps2
        assert corps2["mises_a_jour"] == 5, corps2

        export = json.loads(self._task(taskrc, "export", env=env).stdout)
        choix_final = next(t for t in export if t["uuid"] == uuid_choix)
        cde_final = next(t for t in export if t["uuid"] == uuid_cde)
        assert choix_final["status"] == "completed", choix_final
        assert cde_final["status"] == "deleted", cde_final


class TestFusionTousStatutsMock:
    """Route mockee : le mock d'export respecte le FILTRE de la commande
    envoyee par `_existantes_pour_import()`. Si la commande contient
    `status:pending`, seules les taches pending sont renvoyees -- exactement
    ce que ferait le vrai Taskwarrior. Une tache existante `completed` est
    donc invisible sur le code actuel, ce qui discrimine le test : il est
    rouge pour cette raison (le filtre pending cache l'existante), pas pour
    une erreur de mock.
    """

    def _mock(self, tache_existante, capture):
        def side_effect(commande):
            if _est_commande_import(commande):
                m = re.search(r'import\s+"?([^"\s]+)"?\s*$', commande.strip())
                assert m, f"chemin introuvable dans la commande : {commande!r}"
                with open(m.group(1), "r", encoding="utf-8") as f:
                    capture["contenu"] = json.load(f)
                return CommandResult(success=True, stdout="Imported 1 task.", stderr="", returncode=0)
            if "export" in commande:
                if "status:pending" in commande:
                    return CommandResult(success=True, stdout="[]", stderr="", returncode=0)
                return CommandResult(
                    success=True, stdout=json.dumps([tache_existante]),
                    stderr="", returncode=0,
                )
            return _reponse_export_vide()

        return side_effect

    def test_existante_completed_invisible_au_filtre_pending_actuel(self):
        uuid_a = _uuid_pour("Proj", "a")
        tache_existante = {
            "uuid": uuid_a, "description": "Tache A", "project": "Proj",
            "status": "completed",
        }
        capture = {}
        with patch("main_fastapi.run_task_command") as mock:
            mock.side_effect = self._mock(tache_existante, capture)
            reponse = client.post("/api/import", json={"csv": CSV_SIMPLE_VALIDE})

        assert reponse.status_code == 200, reponse.text
        corps = reponse.json()
        # Spec : une tache existante de n'importe quel statut compte en
        # "mise a jour", jamais en "creee".
        assert corps["creees"] == 0, corps
        assert corps["mises_a_jour"] == 1, corps
        assert "contenu" in capture
        assert len(capture["contenu"]) == 1
        # Spec : le statut n'est jamais modifie par le CSV -- l'objet envoye
        # a `task import` doit porter le statut completed de l'existante.
        assert capture["contenu"][0].get("status") == "completed", capture["contenu"][0]
