#!/usr/bin/env python3
"""E1 — lancer le planificateur depuis l'interface, sans jamais ecrire.

## Ce que ce lot ajoute, et ce qu'il n'ajoute pas

`calendar-planner.js` sait deja lire `/plan.json` et l'afficher dans trois
calendriers distincts de ceux des taches reelles (lot 9). Ce qui manquait, c'est
**qui produit ce fichier** : jusqu'ici, personne. Le lot 9 s'est developpe sur un
plan bouchonne, ecrit a la main.

E1 comble ce trou, et rien d'autre : un endpoint qui lance l'ordonnanceur et
regenere `plan.json`.

## La garantie qui compte plus que les autres

**Un calcul declenche depuis l'interface n'ecrit RIEN dans Taskwarrior.**

L'ordonnanceur n'ecrit que sur demande explicite (`--ecrire-scheduled`,
`--ecrire-due`) ; sans ces drapeaux il se contente de produire son JSON. Le
bouton « calculer » ne doit donc jamais les passer -- c'est exactement ce qui
fait de lui un dry-run, et c'est ce que `test_la_commande_n_ecrit_jamais_dans_la
_base` verifie sur la ligne de commande elle-meme, sans rien executer.

La base de l'utilisateur est synchronisee par Syncthing sur trois machines. Une
ecriture involontaire n'y serait pas rattrapable depuis ici.

## Pourquoi un sous-processus et pas un import

L'ordonnanceur vit dans un autre depot, avec son propre `venv` et `ortools`.
Decision du 23/09 : sous-processus, avec un chemin **configurable** plutot
qu'une constante -- les deux depots restent independants et `ortools` ne rentre
pas dans le venv de l'application web. L'installer comme dependance sera plus
propre le jour ou l'on voudra que le code se reutilise ; c'est note au carnet,
ce n'est pas pour aujourd'hui.

## Pourquoi une tache de fond

La resolution prend de 30 s a 2 minutes. Un appel HTTP synchrone figerait
l'interface tout ce temps, et un navigateur ou un proxy peut couper avant la
fin. L'endpoint rend donc la main tout de suite et l'etat s'interroge.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient

import plan_runner
from main_fastapi import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def etat_neuf():
    """Chaque test part d'un lanceur au repos."""
    plan_runner.reinitialiser()
    yield
    plan_runner.reinitialiser()


# --------------------------------------------------------------------------
# La garantie centrale : jamais d'ecriture
# --------------------------------------------------------------------------

def test_la_commande_n_ecrit_jamais_dans_la_base():
    """Verifie la LIGNE DE COMMANDE, sans rien executer.

    C'est le seul controle qui vaille : il ne depend d'aucun mock, d'aucune base
    jetable, et il resterait vrai meme si quelqu'un changeait le comportement de
    l'ordonnanceur. Si un jour un drapeau d'ecriture apparait ici, ce test tombe.
    """
    commande = plan_runner.commande_planification("plan.json")
    jointe = " ".join(commande)
    assert "--ecrire-scheduled" not in jointe
    assert "--ecrire-due" not in jointe
    assert "modify" not in jointe


def test_la_commande_vise_le_fichier_que_le_calendrier_lit():
    """`plan.json` a la racine : c'est l'URL que `calendar-planner.js` demande."""
    commande = plan_runner.commande_planification("plan.json")
    assert "plan.json" in " ".join(commande)


# --------------------------------------------------------------------------
# L'etat, et ce qu'il raconte
# --------------------------------------------------------------------------

def test_au_repos_l_etat_est_inactif():
    reponse = client.get("/api/plan/etat")
    assert reponse.status_code == 200
    assert reponse.json()["data"]["statut"] == "inactif"


def test_lancer_rend_la_main_tout_de_suite(monkeypatch):
    """L'endpoint ne doit pas attendre la fin du calcul."""
    monkeypatch.setattr(plan_runner, "_executer", lambda cmd, delai: (0, "", ""))
    reponse = client.post("/api/plan/calculer")
    assert reponse.status_code == 200
    assert reponse.json()["success"] is True
    assert reponse.json()["data"]["statut"] in ("en_cours", "termine")


def test_un_calcul_deja_en_cours_n_est_pas_relance(monkeypatch):
    """Deux resolutions simultanees ecriraient le meme fichier en meme temps.

    Le second appel est refuse, pas mis en file : l'utilisateur veut le plan
    d'aujourd'hui, pas deux fois celui d'il y a dix secondes.
    """
    import threading
    bloque = threading.Event()
    monkeypatch.setattr(plan_runner, "_executer",
                        lambda cmd, delai: (bloque.wait(5), 0, "", "")[1:])
    try:
        client.post("/api/plan/calculer")
        seconde = client.post("/api/plan/calculer")
        assert seconde.json()["success"] is False
        assert "cours" in (seconde.json().get("error") or "").lower()
    finally:
        bloque.set()


def test_un_echec_du_planificateur_remonte_en_clair(monkeypatch):
    """Un plan qui n'a pas ete calcule ne doit pas ressembler a un plan vide."""
    monkeypatch.setattr(plan_runner, "_executer",
                        lambda cmd, delai: (2, "", "ortools introuvable"))
    client.post("/api/plan/calculer")
    plan_runner.attendre(5)
    etat = client.get("/api/plan/etat").json()["data"]
    assert etat["statut"] == "echec"
    assert "ortools introuvable" in etat["message"]


def test_un_planificateur_absent_le_dit_au_lieu_de_planter(monkeypatch):
    """Le chemin est configurable, donc il peut etre faux. Ca doit s'entendre."""
    monkeypatch.setattr(plan_runner, "PYTHON", "n-existe-pas/python.exe")
    monkeypatch.setattr(plan_runner, "RACINE", "n-existe-pas")
    reponse = client.post("/api/plan/calculer")
    assert reponse.json()["success"] is False
    erreur = (reponse.json().get("error") or "").lower()
    assert "planificateur" in erreur or "introuvable" in erreur


def test_un_calcul_reussi_passe_a_termine(monkeypatch):
    monkeypatch.setattr(plan_runner, "_executer", lambda cmd, delai: (0, "ok", ""))
    client.post("/api/plan/calculer")
    plan_runner.attendre(5)
    etat = client.get("/api/plan/etat").json()["data"]
    assert etat["statut"] == "termine"
    assert etat["duree_s"] is not None
