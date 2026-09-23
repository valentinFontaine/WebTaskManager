#!/usr/bin/env python3
"""Nuit 3, etape 1 -- le calcul lance depuis l'interface peut viser la base de test.

L'ordonnanceur sait desormais lire sa grille, ses echeances de projet et son
agenda depuis des chemins explicites (`--config`, `--echeances`,
`--reunions`). `plan_runner` les passe si, et seulement si, les variables
d'environnement `PLANIFICATEUR_CONFIG`, `PLANIFICATEUR_ECHEANCES` et
`PLANIFICATEUR_REUNIONS` sont positionnees, sur le modele de
`PLANIFICATEUR_RACINE` (lues par `config.py`).

Sans elles, un calcul sur `taskwarrior-test` utiliserait la vraie grille de
l'utilisateur, et ses vraies reunions des qu'une extraction Outlook existe.

On verifie la LIGNE DE COMMANDE, sans rien executer, comme
`test_la_commande_n_ecrit_jamais_dans_la_base`.
"""
import importlib
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))

import config
import plan_runner

VARIABLES = {
    "PLANIFICATEUR_CONFIG": ("--config", "C:/base-test/config.json"),
    "PLANIFICATEUR_ECHEANCES": ("--echeances", "C:/base-test/echeances.json"),
    "PLANIFICATEUR_REUNIONS": ("--reunions", "C:/base-test/reunions.json"),
}


def _recharger():
    importlib.reload(config)
    importlib.reload(plan_runner)


@pytest.fixture
def environnement(monkeypatch):
    """Rend une fonction qui pose des variables puis recharge les modules.

    Restaure a la fin : variables retirees, modules recharges.
    """
    def poser(**variables):
        for nom in VARIABLES:
            monkeypatch.delenv(nom, raising=False)
        for nom, valeur in variables.items():
            monkeypatch.setenv(nom, valeur)
        _recharger()
    yield poser
    for nom in VARIABLES:
        monkeypatch.delenv(nom, raising=False)
    monkeypatch.undo()
    _recharger()


def _valeur_apres(commande, option):
    assert commande.count(option) == 1, commande
    return commande[commande.index(option) + 1]


def test_sans_variable_aucune_option_de_chemin(environnement):
    """Comportement inchange quand rien n'est pose."""
    environnement()
    commande = plan_runner.commande_planification("plan.json")
    for option, _ in VARIABLES.values():
        assert option not in commande


def test_les_trois_variables_passent_les_trois_options(environnement):
    environnement(**{nom: chemin for nom, (_, chemin) in VARIABLES.items()})
    commande = plan_runner.commande_planification("plan.json")
    for option, chemin in VARIABLES.values():
        assert os.path.normcase(os.path.abspath(_valeur_apres(commande, option))) \
            == os.path.normcase(os.path.abspath(chemin))


@pytest.mark.parametrize("nom", sorted(VARIABLES))
def test_chaque_variable_est_independante(environnement, nom):
    """Une seule variable posee : une seule option, la bonne."""
    option, chemin = VARIABLES[nom]
    environnement(**{nom: chemin})
    commande = plan_runner.commande_planification("plan.json")
    assert _valeur_apres(commande, option)
    for autre, (autre_option, _) in VARIABLES.items():
        if autre != nom:
            assert autre_option not in commande


def test_avec_les_chemins_la_commande_n_ecrit_toujours_pas(environnement):
    """La garantie E1 tient aussi avec les options de chemin."""
    environnement(**{nom: chemin for nom, (_, chemin) in VARIABLES.items()})
    jointe = " ".join(plan_runner.commande_planification("plan.json"))
    assert "--ecrire-scheduled" not in jointe
    assert "--ecrire-due" not in jointe
    assert "--appliquer" not in jointe
    assert "modify" not in jointe
