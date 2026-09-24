#!/usr/bin/env python3
"""Nuit 3, defaut 3 -- un plan dont la passe 1 est INFEASIBLE/UNKNOWN/MODEL_INVALID
ne doit jamais etre ecrit dans Taskwarrior par POST /api/plan/valider.

## Le champ existe reellement

`plan.json` porte un champ `statut` -- ce n'est PAS invente pour ce test : voir
`../TaskWarriorPlanner/planif/sortie.py::plan_en_dict` (« "statut": plan.statut »)
et `planif/solveur.py` (`Plan.statut` vaut la `StatusName` CP-SAT de la PASSE 1 :
'OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'UNKNOWN' ou 'MODEL_INVALID' ; `completer`,
qui fait la passe 2, ne le modifie jamais -- voir `plan_en_dict`docstring et
`completer()`). C'est bien le statut de la passe 1 qui est repris tel quel dans
le fichier lu par `../WebTaskManager`.

Piege verifie dans le depot voisin (solveur.py, fonctions `resoudre`/`completer`) :
un statut INFEASIBLE ou UNKNOWN de la passe 1 n'empeche PAS la passe 2
(opportuniste) de placer des taches sur le plan (vide) qu'elle recoit --
`completer()` ne lit jamais `plan.statut`. Un plan INFEASIBLE peut donc porter
des blocs. Backend et interface doivent refuser sur le STATUT, pas sur
« aucun bloc ».

## Reprise du contrat de test_nuit3_valider.py

Meme structure (Base/Executeur/_calculer/_valider), duplique ici a dessein :
un fichier de contrat isole, qui ne depend pas d'une fixture d'un autre module.
"""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient
from unittest.mock import patch

import plan_runner
from fastapi_models import CommandResult
from main_fastapi import app

client = TestClient(app)

EXPORT_1 = [{"uuid": "bbbb", "modified": "20260923T100000Z", "status": "pending"},
            {"uuid": "aaaa", "modified": "20260923T090000Z", "status": "pending"}]

COMPTE_RENDU = {"scheduled": {"modifiees": ["aaaa"], "inchangees": ["bbbb"],
                              "ignorees": []},
                "due": {"modifiees": [], "inchangees": ["aaaa"],
                        "ignorees": ["bbbb"]}}


@pytest.fixture(autouse=True)
def etat_neuf(tmp_path, monkeypatch):
    plan_runner.reinitialiser()
    plan = tmp_path / "plan.json"
    plan.write_text('{"version": 1, "taches": {}}', encoding="utf-8")
    monkeypatch.setattr(plan_runner, "SORTIE", str(plan))
    yield plan
    plan_runner.reinitialiser()


class Base:
    """Simule `run_task_command` : rend l'export courant, compte les appels."""

    def __init__(self, export):
        self.export = export
        self.commandes = []

    def __call__(self, commande):
        self.commandes.append(commande)
        if "export" in commande:
            return CommandResult(success=True, stdout=json.dumps(self.export),
                                 stderr="", returncode=0)
        return CommandResult(success=True, stdout="", stderr="", returncode=0)


class Executeur:
    """Simule `plan_runner._executer` : calcul (rend 0) et validation.

    Chaque appel avec `--appliquer` (une VRAIE ecriture Taskwarrior, faite par
    le sous-processus planificateur) est compte dans `validations` : un test
    qui echoue avec `validations == []` prouve qu'aucune ecriture n'a eu lieu.
    """

    def __init__(self, code_validation=0, stdout=None, stderr=""):
        self.commandes = []
        self.code_validation = code_validation
        self.stdout = json.dumps(COMPTE_RENDU) if stdout is None else stdout
        self.stderr = stderr

    def __call__(self, commande, delai):
        self.commandes.append(list(commande))
        if "--appliquer" in commande:
            return self.code_validation, self.stdout, self.stderr
        return 0, "", ""

    @property
    def validations(self):
        return [c for c in self.commandes if "--appliquer" in c]


def _calculer(base, executeur, monkeypatch):
    monkeypatch.setattr(plan_runner, "_executer", executeur)
    with patch("main_fastapi.run_task_command", side_effect=base):
        reponse = client.post("/api/plan/calculer")
    assert reponse.json()["success"] is True, reponse.json()
    plan_runner.attendre(5)
    assert plan_runner.etat()["statut"] == "termine"


def _valider(base):
    with patch("main_fastapi.run_task_command", side_effect=base):
        return client.post("/api/plan/valider")


def _ecrire_plan(chemin, statut):
    """Ecrit un plan.json minimal mais conforme au contrat reel (version,
    statut, taches), pour que le backend puisse lire le champ qu'il doit
    verifier."""
    chemin.write_text(json.dumps({
        "version": 1,
        "statut": statut,
        "retard_total": 0,
        "en_retard": [],
        "taches": {},
    }), encoding="utf-8")


# --------------------------------------------------------------------------
# A. le defaut : un statut de passe 1 rate refuse la validation, sans rien
#    ecrire -- et un statut recevable reste accepte (temoin).
# --------------------------------------------------------------------------

@pytest.mark.parametrize("statut, mot_attendu", [
    ("INFEASIBLE", "infaisable"),
    ("UNKNOWN", "unknown"),
    ("MODEL_INVALID", "model_invalid"),
])
def test_statut_rate_valider_refuse_sans_rien_ecrire(
        monkeypatch, etat_neuf, statut, mot_attendu):
    executeur = Executeur()
    _calculer(Base(EXPORT_1), executeur, monkeypatch)
    _ecrire_plan(etat_neuf, statut)

    reponse = _valider(Base(EXPORT_1))

    assert reponse.status_code == 409, reponse.text
    detail = reponse.json()["detail"]
    assert isinstance(detail, str)
    assert mot_attendu in detail.lower(), detail
    assert statut in detail, detail
    assert executeur.validations == []


@pytest.mark.parametrize("statut", ["OPTIMAL", "FEASIBLE"])
def test_statut_recevable_valider_reste_accepte_temoin(
        monkeypatch, etat_neuf, statut):
    executeur = Executeur()
    _calculer(Base(EXPORT_1), executeur, monkeypatch)
    _ecrire_plan(etat_neuf, statut)

    reponse = _valider(Base(EXPORT_1))

    assert reponse.status_code == 200, reponse.text
    corps = reponse.json()
    assert corps["success"] is True
    assert corps["data"] == COMPTE_RENDU
    assert len(executeur.validations) == 1
