#!/usr/bin/env python3
"""Nuit 3, etape 4 -- E4 : Valider ecrit le plan affiche, et rien d'autre.

## Decisions (utilisateur, 23/09) et defauts declares

- Valider ecrit **exactement le plan affiche** (`plan.json`), sans recalcul :
  la commande est `python -m planif --appliquer <plan.json>`, jamais
  `--ecrire-scheduled` / `--ecrire-due` (qui recalculent).
- Si la base a change depuis le calcul, Valider **refuse** (409) et demande de
  recalculer. L'**empreinte** de la base : SHA-256 des lignes `uuid|modified`
  des taches `status:pending`, triees, jointes par `\\n`. Elle est prise
  **juste avant** de lancer le calcul (dans `POST /api/plan/calculer`, par
  `run_task_command('task status:pending export')`) et gardee avec l'etat du
  calcul (`plan_runner`). Valider la reprend et compare.
- Refus 409 aussi : aucun calcul termine dans cette session (ou dernier calcul
  en echec), `plan.json` absent, calcul en cours, empreinte illisible. Une
  empreinte qu'on n'a pas pu lire ne prouve pas que la base n'a pas bouge : on
  refuse plutot que d'ecrire a l'aveugle.
- Les refus ont la forme de FastAPI : `HTTPException` -> `{"detail": "..."}`,
  message en francais. Le succes : `ResponseModel(success=True, data=<le JSON
  imprime par --appliquer>)`.
- Un echec de `--appliquer` (code non nul) : 500, `detail` = stderr.

## Ce qui ne bouge pas

`test_plan_runner.py::test_la_commande_n_ecrit_jamais_dans_la_base` reste
vrai : le CALCUL n'ecrit toujours pas. Le test symetrique est ici.

Sous pytest, `DEVELOPER_MODE` fait rendre du texte a `run_task_command` : les
tests qui ont besoin d'un export le simulent, avec la forme exacte d'un
`CommandResult` (fastapi_models.py).
"""
import hashlib
import json
import os
import sys
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient

import plan_runner
from fastapi_models import CommandResult
from main_fastapi import app

client = TestClient(app)

EXPORT_1 = [{"uuid": "bbbb", "modified": "20260923T100000Z", "status": "pending"},
            {"uuid": "aaaa", "modified": "20260923T090000Z", "status": "pending"}]
EXPORT_2 = [{"uuid": "bbbb", "modified": "20260923T110000Z", "status": "pending"},
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
    """Simule `plan_runner._executer` : calcul (rend 0) et validation."""

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


# --------------------------------------------------------------------------
# 1. l'empreinte
# --------------------------------------------------------------------------

def test_empreinte_est_le_sha256_des_lignes_uuid_modified_triees():
    attendu = hashlib.sha256(
        "aaaa|20260923T090000Z\nbbbb|20260923T100000Z".encode("utf-8")).hexdigest()
    assert plan_runner.empreinte(EXPORT_1) == attendu


def test_empreinte_ne_depend_pas_de_l_ordre_et_voit_un_modified():
    assert plan_runner.empreinte(EXPORT_1) == plan_runner.empreinte(EXPORT_1[::-1])
    assert plan_runner.empreinte(EXPORT_1) != plan_runner.empreinte(EXPORT_2)


def test_l_empreinte_est_prise_au_lancement_du_calcul(monkeypatch):
    base = Base(EXPORT_1)
    _calculer(base, Executeur(), monkeypatch)
    assert any("status:pending" in c and "export" in c for c in base.commandes)
    assert plan_runner.empreinte_du_calcul() == plan_runner.empreinte(EXPORT_1)


# --------------------------------------------------------------------------
# 2. la commande de validation : --appliquer, jamais les drapeaux qui recalculent
# --------------------------------------------------------------------------

def test_la_commande_de_validation_applique_le_plan_sans_recalcul():
    commande = plan_runner.commande_validation("plan.json")
    jointe = " ".join(commande)
    assert "--appliquer" in commande
    assert commande[commande.index("--appliquer") + 1] == os.path.abspath("plan.json")
    assert "--ecrire-scheduled" not in jointe
    assert "--ecrire-due" not in jointe


# --------------------------------------------------------------------------
# 3. l'endpoint : refus
# --------------------------------------------------------------------------

def _refus(reponse, motif):
    assert reponse.status_code == 409, reponse.text
    detail = reponse.json()["detail"]
    assert isinstance(detail, str) and motif in detail.lower(), detail
    return detail


def test_sans_calcul_valider_refuse(monkeypatch):
    executeur = Executeur()
    monkeypatch.setattr(plan_runner, "_executer", executeur)
    _refus(_valider(Base(EXPORT_1)), "calcul")
    assert executeur.validations == []


def test_pendant_un_calcul_valider_refuse(monkeypatch):
    import threading
    bloque = threading.Event()
    executeur = Executeur()

    def lent(commande, delai):
        bloque.wait(5)
        return executeur(commande, delai)

    monkeypatch.setattr(plan_runner, "_executer", lent)
    try:
        with patch("main_fastapi.run_task_command", side_effect=Base(EXPORT_1)):
            client.post("/api/plan/calculer")
        _refus(_valider(Base(EXPORT_1)), "cours")
    finally:
        bloque.set()
        plan_runner.attendre(5)
    assert executeur.validations == []


def test_apres_un_calcul_en_echec_valider_refuse(monkeypatch):
    monkeypatch.setattr(plan_runner, "_executer", lambda c, d: (2, "", "boum"))
    with patch("main_fastapi.run_task_command", side_effect=Base(EXPORT_1)):
        client.post("/api/plan/calculer")
    plan_runner.attendre(5)
    _refus(_valider(Base(EXPORT_1)), "calcul")


def test_si_la_base_a_change_valider_refuse_sans_rien_ecrire(monkeypatch):
    executeur = Executeur()
    _calculer(Base(EXPORT_1), executeur, monkeypatch)
    detail = _refus(_valider(Base(EXPORT_2)), "chang")
    assert "recalcul" in detail.lower()
    assert executeur.validations == []


def test_plan_absent_valider_refuse(monkeypatch, etat_neuf):
    executeur = Executeur()
    _calculer(Base(EXPORT_1), executeur, monkeypatch)
    etat_neuf.unlink()
    _refus(_valider(Base(EXPORT_1)), "plan")
    assert executeur.validations == []


def test_empreinte_illisible_au_calcul_valider_refuse(monkeypatch):
    """Sous DEVELOPER_MODE, l'export rend du texte : pas d'empreinte, pas d'ecriture."""
    executeur = Executeur()
    monkeypatch.setattr(plan_runner, "_executer", executeur)
    texte = CommandResult(success=True, stdout="[DEV MODE] ...", stderr="",
                          returncode=0)
    with patch("main_fastapi.run_task_command", return_value=texte):
        client.post("/api/plan/calculer")
    plan_runner.attendre(5)
    assert plan_runner.empreinte_du_calcul() is None
    reponse = _valider(Base(EXPORT_1))
    assert reponse.status_code == 409
    assert executeur.validations == []


def test_empreinte_illisible_a_la_validation_refuse(monkeypatch):
    executeur = Executeur()
    _calculer(Base(EXPORT_1), executeur, monkeypatch)
    echec = CommandResult(success=False, stdout="", stderr="task introuvable",
                          returncode=1)
    with patch("main_fastapi.run_task_command", return_value=echec):
        reponse = client.post("/api/plan/valider")
    assert reponse.status_code == 409
    assert executeur.validations == []


# --------------------------------------------------------------------------
# 4. l'endpoint : succes et echec de l'ecriture
# --------------------------------------------------------------------------

def test_base_inchangee_valider_applique_et_rend_le_compte_rendu(monkeypatch, etat_neuf):
    executeur = Executeur()
    _calculer(Base(EXPORT_1), executeur, monkeypatch)
    reponse = _valider(Base(EXPORT_1))
    assert reponse.status_code == 200, reponse.text
    corps = reponse.json()
    assert corps["success"] is True
    assert corps["data"] == COMPTE_RENDU
    assert len(executeur.validations) == 1
    commande = executeur.validations[0]
    assert commande[commande.index("--appliquer") + 1] == os.path.abspath(str(etat_neuf))


def test_un_echec_de_l_ecriture_remonte_en_500(monkeypatch):
    executeur = Executeur(code_validation=1, stdout="", stderr="task modify a echoue")
    _calculer(Base(EXPORT_1), executeur, monkeypatch)
    reponse = _valider(Base(EXPORT_1))
    assert reponse.status_code == 500
    assert "task modify a echoue" in reponse.json()["detail"]


def test_valider_ne_relance_pas_de_calcul(monkeypatch):
    """Valider ecrit le plan affiche : aucun appel a la commande de calcul."""
    executeur = Executeur()
    _calculer(Base(EXPORT_1), executeur, monkeypatch)
    avant = len(executeur.commandes)
    _valider(Base(EXPORT_1))
    nouvelles = executeur.commandes[avant:]
    assert nouvelles and all("--appliquer" in c for c in nouvelles)
