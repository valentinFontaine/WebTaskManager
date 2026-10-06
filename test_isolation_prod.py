"""
Verrou d'isolation : la base de prod n'est utilisable que depuis le dossier de prod.

Le serveur de prod tourne depuis le worktree `WebTaskManager-prod` ; on developpe
dans `WebTaskManager`. Un mauvais TASKRC dans le terminal de dev ne doit pas
suffire a ouvrir la vraie base : le backend refuse de demarrer.

Entierement mocke : aucune commande `task` n'est executee.
"""

import os
import sys
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.dirname(__file__))

import main_fastapi
from main_fastapi import base_autorisee, verifier_isolation_prod
from fastapi_models import CommandResult

BASE_PROD = 'C:/Users/irpaui/taskwarrior-prod'
DOSSIER_PROD = 'C:/Users/irpaui/Documents/Projets/perso/WebTaskManager-prod'
DOSSIER_DEV = 'C:/Users/irpaui/Documents/Projets/perso/WebTaskManager'


class TestBaseAutorisee:
    def test_base_prod_depuis_dossier_dev_refusee(self):
        assert not base_autorisee(BASE_PROD + '/data', DOSSIER_DEV, BASE_PROD, DOSSIER_PROD)

    def test_base_prod_depuis_dossier_prod_acceptee(self):
        assert base_autorisee(BASE_PROD + '/data', DOSSIER_PROD, BASE_PROD, DOSSIER_PROD)

    def test_base_dev_depuis_dossier_dev_acceptee(self):
        assert base_autorisee('C:/Users/irpaui/taskwarrior-dev/data', DOSSIER_DEV,
                              BASE_PROD, DOSSIER_PROD)

    def test_casse_et_separateurs_ignores(self):
        # Windows : meme chemin ecrit autrement, toujours la prod.
        assert not base_autorisee(r'c:\users\IRPAUI\taskwarrior-prod\data', DOSSIER_DEV,
                                  BASE_PROD, DOSSIER_PROD)

    def test_nom_voisin_pas_confondu_avec_la_prod(self):
        # `taskwarrior-prod-copie` n'est pas sous `taskwarrior-prod`.
        assert base_autorisee('C:/Users/irpaui/taskwarrior-prod-copie/data', DOSSIER_DEV,
                              BASE_PROD, DOSSIER_PROD)


class TestVerifierIsolationProd:
    def _resultat(self, stdout):
        return CommandResult(success=True, stdout=stdout, stderr='', returncode=0)

    def test_refus_si_taskrc_vise_la_prod_depuis_le_dev(self, monkeypatch):
        monkeypatch.delenv('TASKDATA', raising=False)
        with patch('main_fastapi.run_task_command',
                   return_value=self._resultat(BASE_PROD + '/data\n')) as mock:
            with pytest.raises(RuntimeError, match='prod'):
                verifier_isolation_prod(racine=DOSSIER_DEV, base_prod=BASE_PROD,
                                        dossier_prod=DOSSIER_PROD)
        assert mock.call_count > 0

    def test_taskdata_herite_l_emporte_sur_le_taskrc(self, monkeypatch):
        # TASKDATA l'emporte sur data.location : c'est lui qu'il faut juger.
        monkeypatch.setenv('TASKDATA', BASE_PROD + '/data')
        with patch('main_fastapi.run_task_command',
                   return_value=self._resultat('C:/Users/irpaui/taskwarrior-dev/data\n')):
            with pytest.raises(RuntimeError):
                verifier_isolation_prod(racine=DOSSIER_DEV, base_prod=BASE_PROD,
                                        dossier_prod=DOSSIER_PROD)

    def test_base_dev_laisse_demarrer(self, monkeypatch):
        monkeypatch.delenv('TASKDATA', raising=False)
        with patch('main_fastapi.run_task_command',
                   return_value=self._resultat('C:/Users/irpaui/taskwarrior-dev/data\n')):
            verifier_isolation_prod(racine=DOSSIER_DEV, base_prod=BASE_PROD,
                                    dossier_prod=DOSSIER_PROD)
