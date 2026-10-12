#!/usr/bin/env python3
"""Perimetre du calcul : projets choisis et horizon detaille (2026-10-12).

La fenetre « Calculer le plan » envoie `{"projets": [...], "horizon_detaille": N}`
a `POST /api/plan/calculer`. Le backend les traduit en options du planificateur :

- `projets` non vide -> `--filtre "status:pending project:A"`, ou
  `--filtre "status:pending ( project:A or project:B )"` pour plusieurs projets.
  `project:A` de Taskwarrior couvre deja les sous-projets `A.x`.
- `horizon_detaille` -> `--horizon-detaille N` (jours, entier de 1 a 90 : 90 est
  l'horizon total par defaut du planificateur).

Sans corps, ou avec des champs vides, la commande est exactement celle d'avant :
tous les projets, horizon detaille par defaut du planificateur.

Un nom de projet est passe au filtre Taskwarrior : on n'accepte que lettres,
chiffres, `_`, `-` et `.`, pour qu'aucune saisie ne puisse elargir le filtre
(`or`, parentheses, guillemets, espaces). Refus -> `success: false`, rien lance.
"""
import os
import shlex
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient

import plan_runner
from main_fastapi import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def etat_neuf():
    plan_runner.reinitialiser()
    yield
    plan_runner.reinitialiser()


def valeur(commande, option):
    """La valeur qui suit `option` dans la commande, ou None si absente."""
    if option not in commande:
        return None
    return commande[commande.index(option) + 1]


# --------------------------------------------------------------------------
# La ligne de commande
# --------------------------------------------------------------------------

def test_sans_perimetre_la_commande_est_inchangee():
    assert (plan_runner.commande_planification("plan.json")
            == plan_runner.commande_planification("plan.json", projets=[],
                                                  horizon_detaille=None))
    commande = plan_runner.commande_planification("plan.json")
    assert "--filtre" not in commande
    assert "--horizon-detaille" not in commande


def test_un_projet_devient_un_filtre():
    commande = plan_runner.commande_planification("plan.json", projets=["Balise77"])
    filtre = valeur(commande, "--filtre")
    assert shlex.split(filtre) == ["status:pending", "project:Balise77"]


def test_plusieurs_projets_sont_reunis_par_or():
    commande = plan_runner.commande_planification(
        "plan.json", projets=["Balise77", "maisonChristina.cuisine"])
    assert shlex.split(valeur(commande, "--filtre")) == [
        "status:pending", "(", "project:Balise77", "or",
        "project:maisonChristina.cuisine", ")"]


def test_l_horizon_detaille_est_transmis():
    commande = plan_runner.commande_planification("plan.json", horizon_detaille=30)
    assert valeur(commande, "--horizon-detaille") == "30"


def test_le_perimetre_n_ajoute_aucun_drapeau_d_ecriture():
    jointe = " ".join(plan_runner.commande_planification(
        "plan.json", projets=["Balise77"], horizon_detaille=30))
    assert "--ecrire-scheduled" not in jointe
    assert "--ecrire-due" not in jointe
    assert "--appliquer" not in jointe


# --------------------------------------------------------------------------
# L'endpoint
# --------------------------------------------------------------------------

@pytest.fixture
def commandes(monkeypatch):
    """Capture les commandes reellement lancees, sans rien executer."""
    vues = []

    def executer(commande, delai):
        vues.append(commande)
        return 0, "", ""

    monkeypatch.setattr(plan_runner, "_executer", executer)
    return vues


def test_l_endpoint_transmet_projets_et_horizon(commandes):
    reponse = client.post("/api/plan/calculer",
                          json={"projets": ["Balise77"], "horizon_detaille": 21})
    assert reponse.json()["success"] is True
    plan_runner.attendre(5)
    assert len(commandes) == 1
    assert shlex.split(valeur(commandes[0], "--filtre")) == [
        "status:pending", "project:Balise77"]
    assert valeur(commandes[0], "--horizon-detaille") == "21"


def test_l_endpoint_sans_corps_calcule_tout(commandes):
    reponse = client.post("/api/plan/calculer")
    assert reponse.json()["success"] is True
    plan_runner.attendre(5)
    assert len(commandes) == 1
    assert "--filtre" not in commandes[0]
    assert "--horizon-detaille" not in commandes[0]


def test_l_endpoint_corps_vide_calcule_tout(commandes):
    client.post("/api/plan/calculer", json={"projets": [], "horizon_detaille": None})
    plan_runner.attendre(5)
    assert "--filtre" not in commandes[0]
    assert "--horizon-detaille" not in commandes[0]


@pytest.mark.parametrize("projet", [
    "Balise77 or status:completed", "a)", "(a", 'a"b', "a'b", "", " ", "a b",
])
def test_un_nom_de_projet_suspect_est_refuse(commandes, projet):
    reponse = client.post("/api/plan/calculer", json={"projets": [projet]})
    assert reponse.json()["success"] is False
    assert commandes == []


@pytest.mark.parametrize("horizon", [0, -3, 91, 2.5, "14"])
def test_un_horizon_hors_bornes_est_refuse(commandes, horizon):
    reponse = client.post("/api/plan/calculer", json={"horizon_detaille": horizon})
    assert reponse.json()["success"] is False
    assert commandes == []


def test_un_projet_accentue_est_accepte(commandes):
    reponse = client.post("/api/plan/calculer", json={"projets": ["Maison.Été-2026"]})
    assert reponse.json()["success"] is True
