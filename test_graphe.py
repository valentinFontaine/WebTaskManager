#!/usr/bin/env python3
"""
Contrat de test pour GET /api/graphe?projet=X (fonctionnalite H).

Rappel de la specification (voir le prompt d'origine, pas duplique ici en
detail) :
- la source est l'export JSON complet des taches pending, filtre en Python
  (pas par un filtre project: passe a Taskwarrior) ;
- une tache est "dans le projet" si son champ project vaut X ou est un
  sous-projet de X, sur frontiere de point, insensible a la casse ;
- les voisins directs (predecesseur ou successeur) hors projet sont inclus
  avec dans_projet=false, sans voisins de voisins ;
- une arete n'existe que si ses deux extremites figurent dans les noeuds ;
- depends accepte une liste d'uuid (Taskwarrior 3) ou une chaine separee par
  des virgules (Taskwarrior 2).

Choix de tri documente : les noeuds sont ordonnes par (project, description),
comparaison insensible a la casse. Ce choix n'est pas impose par l'enonce,
seule la stabilite/determinisme l'est ; le test verifie cet ordre precis et
devra etre ajuste si un autre tri deterministe est prefere a l'implementation.

Ces tests sont ecrits AVANT l'implementation de la route : ils doivent
echouer avec un 404 (route absente), pas avec une erreur de mock.
"""

import copy
import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import main_fastapi
from main_fastapi import app
from fastapi_models import CommandResult

client = TestClient(app)


# --- Jeu de donnees construit a la main -----------------------------------
#
# Projet cible des tests : NPD.Orion
#
# u1, u2, u3 : dans le projet (cas nominal, sous-projet, casse differente)
# u4, u5     : NE sont PAS dans le projet malgre un prefixe proche
#              (NPD.OrionX, NPD.Or) -- frontiere de point stricte
# u6         : hors projet, predecesseur direct de u1 (via depends chaine)
# u7         : hors projet, successeur direct de u2 (via depends liste)
# u8         : hors projet, predecesseur de u6 -- voisin de voisin, doit
#              rester absent du resultat
# u99        : n'existe pas dans l'export pending (tache terminee/supprimee)
#              -- referencee par depends de u1, l'arete doit etre ignoree

def _taches_pending():
    return [
        {
            "uuid": "u1",
            "description": "Concevoir arbre de transmission",
            "project": "NPD.Orion",
            "estTime": "PT1H",
            "due": None,
            "tags": ["externe"],
            # Taskwarrior 2 : chaine separee par des virgules, une des deux
            # cibles (u99) n'existe pas dans l'export pending.
            "depends": "u6,u99",
        },
        {
            "uuid": "u2",
            "description": "Tracer plan hydraulique",
            "project": "npd.orion.plans",
            "estTime": None,
            "due": "20260901T000000Z",
            "tags": [],
            "depends": [],
        },
        {
            "uuid": "u3",
            "description": "Devis fournisseur reducteur",
            "project": "NPD.Orion.achats.devis",
            "estTime": None,
            "due": None,
            "tags": ["fige"],
            "depends": [],
        },
        {
            "uuid": "u4",
            "description": "Tache d'un projet homonyme",
            "project": "NPD.OrionX",
            "estTime": None,
            "due": None,
            "tags": [],
            "depends": [],
        },
        {
            "uuid": "u5",
            "description": "Tache d'un projet prefixe court",
            "project": "NPD.Or",
            "estTime": None,
            "due": None,
            "tags": [],
            "depends": [],
        },
        {
            "uuid": "u6",
            "description": "Fournir la specification amont",
            "project": "Divers",
            "estTime": None,
            "due": None,
            "tags": [],
            "depends": [],
        },
        {
            "uuid": "u7",
            "description": "Integrer le plan hydraulique en aval",
            "project": "Divers",
            "estTime": None,
            "due": None,
            "tags": [],
            # Taskwarrior 3 : liste d'uuid. u7 depend de u2 (dans le projet).
            "depends": ["u2"],
        },
        {
            "uuid": "u8",
            "description": "Voisin de voisin, ne doit pas apparaitre",
            "project": "Divers",
            "estTime": None,
            "due": None,
            "tags": [],
            "depends": ["u6"],
        },
    ]


def _mock_export(mock_command, taches):
    mock_command.return_value = CommandResult(
        success=True,
        stdout=json.dumps(taches),
        stderr="",
        returncode=0,
    )


def _noeud(reponse, uuid):
    for n in reponse["noeuds"]:
        if n["uuid"] == uuid:
            return n
    return None


class TestGrapheSource:
    """La source est l'export pending complet, filtre en Python."""

    @patch("main_fastapi.run_task_command")
    def test_export_pending_complet_pas_de_filtre_projet_cote_taskwarrior(self, mock_command):
        _mock_export(mock_command, _taches_pending())

        response = client.get("/api/graphe", params={"projet": "NPD.Orion"})

        assert response.status_code == 200
        assert mock_command.call_count == 1
        commande = mock_command.call_args[0][0]
        # Le nom du projet ne doit pas se retrouver dans la commande envoyee
        # a Taskwarrior : le filtrage se fait en Python sur l'export complet,
        # pas via un filtre project: cote Taskwarrior.
        assert "NPD.Orion" not in commande
        assert "orion" not in commande.lower()
        assert "pending" in commande.lower()
        assert "export" in commande.lower()


class TestGrapheSelectionProjet:
    """Frontiere de point, insensible a la casse, sur le champ project."""

    @patch("main_fastapi.run_task_command")
    def test_projet_exact_et_sous_projets_inclus(self, mock_command):
        _mock_export(mock_command, _taches_pending())

        response = client.get("/api/graphe", params={"projet": "NPD.Orion"})
        data = response.json()

        uuids_dans_projet = {n["uuid"] for n in data["noeuds"] if n["dans_projet"]}
        assert uuids_dans_projet == {"u1", "u2", "u3"}
        for uuid in ("u1", "u2", "u3"):
            assert _noeud(data, uuid)["dans_projet"] is True

    @patch("main_fastapi.run_task_command")
    def test_prefixe_proche_sans_frontiere_de_point_exclu(self, mock_command):
        _mock_export(mock_command, _taches_pending())

        response = client.get("/api/graphe", params={"projet": "NPD.Orion"})
        data = response.json()

        # u4 (NPD.OrionX) et u5 (NPD.Or) ne sont pas des sous-projets de
        # NPD.Orion malgre le prefixe textuel : ils sont soit absents, soit
        # presents en tant que voisins avec dans_projet=false -- jamais
        # dans_projet=true, et ici ils n'ont aucun lien de dependance donc
        # absents du resultat.
        assert _noeud(data, "u4") is None
        assert _noeud(data, "u5") is None

    @patch("main_fastapi.run_task_command")
    def test_selection_insensible_a_la_casse(self, mock_command):
        _mock_export(mock_command, _taches_pending())

        response = client.get("/api/graphe", params={"projet": "npd.orion"})
        data = response.json()

        uuids_dans_projet = {n["uuid"] for n in data["noeuds"] if n["dans_projet"]}
        assert uuids_dans_projet == {"u1", "u2", "u3"}


class TestGrapheVoisins:
    """Voisins directs hors projet inclus ; pas de voisins de voisins."""

    @patch("main_fastapi.run_task_command")
    def test_predecesseur_et_successeur_directs_inclus(self, mock_command):
        _mock_export(mock_command, _taches_pending())

        response = client.get("/api/graphe", params={"projet": "NPD.Orion"})
        data = response.json()

        n6 = _noeud(data, "u6")
        n7 = _noeud(data, "u7")
        assert n6 is not None and n6["dans_projet"] is False
        assert n7 is not None and n7["dans_projet"] is False

    @patch("main_fastapi.run_task_command")
    def test_pas_de_voisin_de_voisin(self, mock_command):
        _mock_export(mock_command, _taches_pending())

        response = client.get("/api/graphe", params={"projet": "NPD.Orion"})
        data = response.json()

        # u8 ne depend que de u6, un voisin -- pas d'une tache du projet.
        assert _noeud(data, "u8") is None


class TestGrapheAretes:
    """Aretes issues de depends, avec extremites obligatoirement presentes."""

    @patch("main_fastapi.run_task_command")
    def test_arete_predecesseur_hors_projet(self, mock_command):
        _mock_export(mock_command, _taches_pending())

        response = client.get("/api/graphe", params={"projet": "NPD.Orion"})
        data = response.json()

        assert {"de": "u6", "vers": "u1"} in data["aretes"]

    @patch("main_fastapi.run_task_command")
    def test_depends_liste_taskwarrior3(self, mock_command):
        _mock_export(mock_command, _taches_pending())

        response = client.get("/api/graphe", params={"projet": "NPD.Orion"})
        data = response.json()

        # u7 (hors projet) depend de u2 (liste ["u2"], format Taskwarrior 3).
        assert {"de": "u2", "vers": "u7"} in data["aretes"]

    @patch("main_fastapi.run_task_command")
    def test_depends_chaine_taskwarrior2(self, mock_command):
        _mock_export(mock_command, _taches_pending())

        response = client.get("/api/graphe", params={"projet": "NPD.Orion"})
        data = response.json()

        # u1 depend de "u6,u99" (chaine, format Taskwarrior 2) : l'arete vers
        # u6 doit etre presente.
        assert {"de": "u6", "vers": "u1"} in data["aretes"]

    @patch("main_fastapi.run_task_command")
    def test_arete_ignoree_si_extremite_absente_de_lexport(self, mock_command):
        _mock_export(mock_command, _taches_pending())

        response = client.get("/api/graphe", params={"projet": "NPD.Orion"})

        assert response.status_code == 200
        data = response.json()

        # u99 n'existe pas dans l'export pending (terminee/supprimee/inconnue)
        # : aucune arete ne doit la mentionner, et elle n'apparait pas comme
        # noeud. Pas d'erreur levee.
        assert _noeud(data, "u99") is None
        for arete in data["aretes"]:
            assert arete["de"] != "u99"
            assert arete["vers"] != "u99"

    @patch("main_fastapi.run_task_command")
    def test_arete_absente_si_voisin_de_voisin_exclu(self, mock_command):
        _mock_export(mock_command, _taches_pending())

        response = client.get("/api/graphe", params={"projet": "NPD.Orion"})
        data = response.json()

        # u8 est exclu (voisin de voisin) donc aucune arete u8->u6 ne doit
        # apparaitre, meme si le lien existe dans les donnees source.
        for arete in data["aretes"]:
            assert arete["de"] != "u8"
            assert arete["vers"] != "u8"


class TestGrapheFormeDesNoeuds:
    """Champs attendus sur un noeud, tels quels ou null."""

    @patch("main_fastapi.run_task_command")
    def test_champs_noeud_dans_projet(self, mock_command):
        _mock_export(mock_command, _taches_pending())

        response = client.get("/api/graphe", params={"projet": "NPD.Orion"})
        data = response.json()

        n1 = _noeud(data, "u1")
        assert n1["description"] == "Concevoir arbre de transmission"
        assert n1["project"] == "NPD.Orion"
        assert n1["estTime"] == "PT1H"
        assert n1["due"] is None
        assert n1["externe"] is True
        assert n1["fige"] is False
        assert n1["dans_projet"] is True

        n3 = _noeud(data, "u3")
        assert n3["externe"] is False
        assert n3["fige"] is True

        n2 = _noeud(data, "u2")
        assert n2["estTime"] is None
        assert n2["due"] == "20260901T000000Z"

    @patch("main_fastapi.run_task_command")
    def test_reponse_racine(self, mock_command):
        _mock_export(mock_command, _taches_pending())

        response = client.get("/api/graphe", params={"projet": "NPD.Orion"})
        data = response.json()

        assert data["projet"] == "NPD.Orion"
        assert isinstance(data["noeuds"], list)
        assert isinstance(data["aretes"], list)


class TestGrapheCasVides:

    @patch("main_fastapi.run_task_command")
    def test_projet_sans_aucune_tache(self, mock_command):
        _mock_export(mock_command, _taches_pending())

        response = client.get("/api/graphe", params={"projet": "NPD.Vide.Inexistant"})

        assert response.status_code == 200
        data = response.json()
        assert data["projet"] == "NPD.Vide.Inexistant"
        assert data["noeuds"] == []
        assert data["aretes"] == []

    def test_parametre_projet_absent(self):
        response = client.get("/api/graphe")
        assert response.status_code in (400, 422)

    def test_parametre_projet_vide(self):
        response = client.get("/api/graphe", params={"projet": ""})
        assert response.status_code in (400, 422)


class TestGrapheOrdreDeterministe:

    @patch("main_fastapi.run_task_command")
    def test_deux_appels_identiques_rendent_le_meme_ordre(self, mock_command):
        _mock_export(mock_command, _taches_pending())

        r1 = client.get("/api/graphe", params={"projet": "NPD.Orion"})
        r2 = client.get("/api/graphe", params={"projet": "NPD.Orion"})

        assert [n["uuid"] for n in r1.json()["noeuds"]] == [n["uuid"] for n in r2.json()["noeuds"]]

    @patch("main_fastapi.run_task_command")
    def test_tri_par_project_puis_description_insensible_casse(self, mock_command):
        # Ordre de sortie de l'export volontairement melange, pour ne pas
        # coincider par hasard avec le tri attendu.
        taches = copy.deepcopy(_taches_pending())
        melangees = [taches[2], taches[0], taches[1], taches[5], taches[6]]
        _mock_export(mock_command, melangees)

        response = client.get("/api/graphe", params={"projet": "NPD.Orion"})
        data = response.json()

        cles = [(n["project"].lower(), n["description"].lower()) for n in data["noeuds"]]
        assert cles == sorted(cles)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
