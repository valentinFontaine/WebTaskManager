#!/usr/bin/env python3
"""Nuit 3, etape 5 -- E3 : figer une tache a l'instant ou on depose son bloc.

    POST /api/task/{uuid}/figer      corps : {"scheduled": "YYYYMMDDTHHMMSSZ"}

Decision de l'utilisateur (23/09) : deplacer un bloc propose ecrit TOUT DE
SUITE `+fixed` et `scheduled` = nouveau debut. Le solveur ne bouge plus une
tache `+fixed` (contrainte 8 : debut du bloc 0 impose).

## Ce qui est sous contrat

- **rien d'autre que `+fixed` et `scheduled`** : une seule commande
  `task <uuid> modify +fixed scheduled:<valeur>`. Surtout pas le chemin de
  `PUT /api/task/{id}/modify`, qui EFFACE les tags (`-TAGS`) avant de les
  reecrire. Le test qui compte le plus est le dernier : sur une vraie base
  Taskwarrior jetable, les tags `pro`, `external` et un tag d'acteur survivent.
- **tout ce qui entre dans la commande est valide avant** :
  `run_task_command` passe par `shell=True`. L'uuid doit etre un uuid
  canonique (`fullmatch`, comme `/depends`), la date une date UTC compacte
  `YYYYMMDDTHHMMSSZ` (la forme que l'ordonnanceur ecrit, sans ambiguite de
  fuseau). Sinon 400, et **aucune** commande lancee.
- refus de Taskwarrior : 400, `detail` = stderr (forme FastAPI).
- succes : `ResponseModel(success=True, task=<la tache reexportee>)`.
"""
import json
import os
import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import main_fastapi
from fastapi_models import CommandResult
from main_fastapi import app

client = TestClient(app)

UUID = "0f0f0f0f-1111-4222-8333-444444444444"
QUAND = "20261005T120000Z"


class Enregistreur:
    def __init__(self, succes=True, stderr=""):
        self.commandes = []
        self.succes = succes
        self.stderr = stderr

    def __call__(self, commande):
        self.commandes.append(commande)
        if "export" in commande:
            return CommandResult(success=True, stdout=json.dumps([{"uuid": UUID}]),
                                 stderr="", returncode=0)
        return CommandResult(success=self.succes, stdout="", stderr=self.stderr,
                             returncode=0 if self.succes else 2)

    @property
    def ecritures(self):
        return [c for c in self.commandes if "export" not in c]


def _figer(uuid, corps, enregistreur):
    with patch("main_fastapi.run_task_command", side_effect=enregistreur):
        return client.post("/api/task/{}/figer".format(uuid), json=corps)


# --------------------------------------------------------------------------
# 1. la commande : +fixed et scheduled, rien d'autre
# --------------------------------------------------------------------------

def test_une_seule_ecriture_qui_ne_pose_que_fige_et_scheduled():
    enr = Enregistreur()
    reponse = _figer(UUID, {"scheduled": QUAND}, enr)
    assert reponse.status_code == 200, reponse.text
    assert reponse.json()["success"] is True
    assert len(enr.ecritures) == 1
    mots = [m for m in enr.ecritures[0].split() if not m.startswith("rc.")]
    assert mots == ["task", UUID, "modify", "+fixed", "scheduled:" + QUAND]


def test_aucun_tag_n_est_efface():
    enr = Enregistreur()
    _figer(UUID, {"scheduled": QUAND}, enr)
    for commande in enr.commandes:
        assert "-TAGS" not in commande
        assert not any(m.startswith("-") for m in commande.split()[1:])


def test_la_tache_reexportee_est_rendue():
    reponse = _figer(UUID, {"scheduled": QUAND}, Enregistreur())
    assert reponse.json()["task"]["uuid"] == UUID


def test_un_refus_de_taskwarrior_est_un_400_avec_son_message():
    reponse = _figer(UUID, {"scheduled": QUAND},
                     Enregistreur(succes=False, stderr="Unknown date format"))
    assert reponse.status_code == 400
    assert "Unknown date format" in reponse.json()["detail"]


# --------------------------------------------------------------------------
# 2. validation avant toute commande (shell=True)
# --------------------------------------------------------------------------

@pytest.mark.parametrize("uuid", [
    "12",
    "0F0F0F0F-1111-4222-8333-444444444444",
    "0f0f0f0f-1111-4222-8333-444444444444x",
    "0f0f0f0f-1111-4222-8333-44444444444 & echo",
])
def test_un_uuid_non_canonique_est_refuse_sans_commande(uuid):
    enr = Enregistreur()
    reponse = _figer(uuid, {"scheduled": QUAND}, enr)
    assert reponse.status_code in (400, 404, 405)
    assert enr.commandes == []


@pytest.mark.parametrize("quand", [
    "", "demain", "2026-10-05T12:00:00", "20261005T120000Z & del x",
    "20261005T120000", "now",
])
def test_une_date_hors_format_est_refusee_sans_commande(quand):
    enr = Enregistreur()
    reponse = _figer(UUID, {"scheduled": quand}, enr)
    assert reponse.status_code in (400, 422)
    assert enr.commandes == []


def test_un_corps_sans_scheduled_est_refuse_sans_commande():
    enr = Enregistreur()
    reponse = _figer(UUID, {}, enr)
    assert reponse.status_code in (400, 422)
    assert enr.commandes == []


# --------------------------------------------------------------------------
# 3. sur une VRAIE base Taskwarrior jetable : les tags survivent
# --------------------------------------------------------------------------

@pytest.fixture
def vraie_base(tmp_path, monkeypatch):
    """Une base Taskwarrior sous tmp_path, et run_task_command branche dessus.

    DEVELOPER_MODE est leve pour CE test seulement, et l'isolation est
    VERIFIEE avant toute ecriture : `task _show` doit montrer le dossier de
    tmp_path, sinon le test s'arrete sans rien ecrire.
    """
    donnees = tmp_path / "data"
    donnees.mkdir()
    taskrc = tmp_path / "taskrc"
    taskrc.write_text(
        "data.location={}\nconfirmation=off\nbulk=0\nverbose=nothing\n"
        "uda.estTime.type=duration\nuda.estTime.label=Est Time\n".format(
            donnees.as_posix()), encoding="utf-8")
    env = dict(os.environ)
    env.pop("TASKDATA", None)
    env["TASKRC"] = str(taskrc)
    env["TW_WEB"] = "1"
    monkeypatch.setattr(main_fastapi, "_TW_ENV", env)
    monkeypatch.setattr(main_fastapi, "DEVELOPER_MODE", False)

    montre = main_fastapi.run_task_command("task _show")
    if donnees.as_posix() not in montre.stdout:
        pytest.fail("isolation Taskwarrior non confirmee : aucune ecriture tentee")

    graine = tmp_path / "graine.json"
    graine.write_text(json.dumps([{
        "uuid": UUID, "description": "Plan de detail carter", "status": "pending",
        "entry": "20260901T080000Z", "project": "NPD.Orion.plans",
        "tags": ["pro", "external", "acteurDupont"], "estTime": "PT6H"}]),
        encoding="utf-8")
    res = subprocess.run(["task", "import", str(graine)], capture_output=True,
                         text=True, encoding="utf-8", env=env, check=False)
    assert res.returncode == 0, res.stderr

    def exporter():
        r = subprocess.run(["task", UUID, "export"], capture_output=True,
                           text=True, encoding="utf-8", env=env, check=True)
        return json.loads(r.stdout)[0]
    return exporter


def test_sur_une_vraie_base_les_tags_existants_survivent(vraie_base):
    avant = vraie_base()
    reponse = client.post("/api/task/{}/figer".format(UUID),
                          json={"scheduled": QUAND})
    assert reponse.status_code == 200, reponse.text
    apres = vraie_base()
    assert set(apres["tags"]) == set(avant["tags"]) | {"fixed"}
    assert {"pro", "external", "acteurDupont"} <= set(apres["tags"])
    assert apres["scheduled"] == QUAND
    for champ in ("description", "project", "estTime", "status"):
        assert apres[champ] == avant[champ], champ
