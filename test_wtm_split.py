"""Tests de l'operation `split` des lots de wtm (decoupage d'une tache en sous-taches
et jalon). La logique de validation est celle de decoupage.py ; ici on verifie
l'ecriture : sous-taches importees en UTF-8, puis une seule commande sur le jalon,
annulation si elle echoue."""

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'tools'))

import wtm
from test_wtm import (AVEC_TASK, FauxTask, creer_base, ecrire_lot, exporter,
                      task_brut, tache)

T = '11111111-1111-4111-8111-111111111111'
P = '22222222-2222-4222-8222-222222222222'


class FauxTaskImport(FauxTask):
    """Comme FauxTask, mais lit le fichier d'un `import` avant qu'il soit supprime."""

    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self.importees = []

    def __call__(self, taskrc, args, entree=None):
        if args and args[0] == 'import':
            with open(args[1], encoding='utf-8') as f:
                self.importees.extend(json.load(f))
        return super().__call__(taskrc, args, entree)


def op_split(uuid=T, sous_taches=None, sous_projet=None):
    return {'op': 'split', 'uuid': uuid, 'sous_projet': sous_projet,
            'sous_taches': sous_taches if sous_taches is not None else [
                {'description': 'Rédiger le plan', 'estTime': '2h'},
                {'description': 'Faire relire', 'estTime': '1h30'}]}


def appliquer(tmp_path, monkeypatch, taches, operation, faux=None):
    faux = faux or FauxTaskImport(taches)
    monkeypatch.setattr(wtm, 'executer_task', faux)
    lot = ecrire_lot(tmp_path / 'lot.json', taches, [operation])
    return faux, lambda: wtm.appliquer(lot, 'C:/tmp/copie/taskrc')


class TestSplitLot:
    def base(self):
        return [tache(T, 'Livrer', project='Pompe', tags=['fixed', 'bureau'],
                      depends=[P], due='20261215T000000Z'),
                tache(P, 'Prealable')]

    def test_sous_taches_importees_puis_un_modify_sur_le_jalon(self, tmp_path, monkeypatch):
        faux, lancer = appliquer(tmp_path, monkeypatch, self.base(), op_split())
        assert lancer() == {'appliquees': 1}
        assert [t['description'] for t in faux.importees] == ['Rédiger le plan', 'Faire relire']
        for t in faux.importees:
            assert t['project'] == 'Pompe'
            assert t['tags'] == ['bureau']          # +fixed n'est pas herite
            assert t['depends'] == [P]
            assert t['due'] == '20261215T000000Z'
            assert t['status'] == 'pending'
        modifs = [e for e in faux.ecritures if 'modify' in e]
        assert len(modifs) == 1
        nouveaux = [t['uuid'] for t in faux.importees]
        assert modifs[0][-3:] == ['+milestone', 'estTime:30min',
                                  'depends:' + ','.join(nouveaux + ['-' + P])]
        assert modifs[0][:3] == ['rc.confirmation=off', T, 'modify']

    def test_une_seule_sous_tache_refuse_sans_ecriture(self, tmp_path, monkeypatch):
        faux, lancer = appliquer(tmp_path, monkeypatch, self.base(),
                                 op_split(sous_taches=[{'description': 'seule'}]))
        with pytest.raises(wtm.WtmErreur):
            lancer()
        assert faux.ecritures == []

    def test_jalon_deja_decoupe_refuse_sans_ecriture(self, tmp_path, monkeypatch):
        base = [tache(T, 'Livrer', tags=['milestone'])]
        faux, lancer = appliquer(tmp_path, monkeypatch, base, op_split())
        with pytest.raises(wtm.WtmErreur):
            lancer()
        assert faux.ecritures == []

    def test_tache_inconnue_refusee_sans_ecriture(self, tmp_path, monkeypatch):
        faux, lancer = appliquer(tmp_path, monkeypatch, self.base(),
                                 op_split(uuid='33333333-3333-4333-8333-333333333333'))
        with pytest.raises(wtm.WtmErreur):
            lancer()
        assert faux.ecritures == []

    def test_refus_detecte_avant_toute_operation_du_lot(self, tmp_path, monkeypatch):
        """Un split invalide en fin de lot ne laisse pas passer les operations d'avant."""
        base = self.base()
        faux = FauxTaskImport(base)
        monkeypatch.setattr(wtm, 'executer_task', faux)
        lot = ecrire_lot(tmp_path / 'lot.json', base,
                         [{'op': 'modify', 'uuid': P, 'args': ['+x']},
                          op_split(sous_taches=[{'description': 'seule'}])])
        with pytest.raises(wtm.WtmErreur):
            wtm.appliquer(lot, 'C:/tmp/copie/taskrc')
        assert faux.ecritures == []

    def test_echec_du_modify_supprime_les_sous_taches(self, tmp_path, monkeypatch):
        # ecritures : 1 = import, 2 = modify du jalon (echec), puis les suppressions
        faux = FauxTaskImport(self.base(), echec_sur=2)
        faux, lancer = appliquer(tmp_path, monkeypatch, self.base(), op_split(), faux)
        with pytest.raises(wtm.WtmErreur):
            lancer()
        crees = [t['uuid'] for t in faux.importees]
        supprimes = [e for e in faux.ecritures if 'delete' in e]
        assert {e[1] for e in supprimes} == set(crees)


@pytest.mark.skipif(not AVEC_TASK, reason='binaire task absent')
class TestSplitIntegration:
    def test_decoupage_reel_sur_une_base_jetable(self, tmp_path):
        rc = creer_base(tmp_path / 'base')
        task_brut(rc, 'add', 'Preparer', 'estTime:1h')
        task_brut(rc, 'add', 'Livrer', 'project:Pompe', '+bureau', 'estTime:4h')
        task_brut(rc, 'add', 'Valider', 'estTime:1h')
        par_nom = {t['description']: t for t in exporter(rc)}
        cible, avant, apres = (par_nom['Livrer']['uuid'], par_nom['Preparer']['uuid'],
                               par_nom['Valider']['uuid'])
        task_brut(rc, cible, 'modify', 'depends:' + avant)
        task_brut(rc, apres, 'modify', 'depends:' + cible)

        taches = exporter(rc)
        lot = ecrire_lot(tmp_path / 'lot.json', taches, [op_split(uuid=cible)])
        assert wtm.appliquer(lot, rc) == {'appliquees': 1}

        final = {t['uuid']: t for t in exporter(rc)}
        jalon = final[cible]
        assert 'milestone' in jalon['tags']
        assert jalon['estTime'] in ('PT30M', 'PT1800S')
        sous = [t for t in final.values() if t['description'] in ('Rédiger le plan', 'Faire relire')]
        assert len(sous) == 2
        assert set(jalon['depends']) == {t['uuid'] for t in sous}
        for t in sous:
            assert t['project'] == 'Pompe'
            assert t['depends'] == [avant]
        assert final[apres]['depends'] == [cible]    # le successeur dépend toujours du jalon
        # ISO comme `task add` : `import` stockerait le texte brut, que ni les filtres
        # Taskwarrior (estTime.above:1h) ni le planificateur ne lisent (mesure du 2026-10-15)
        assert sorted(t['estTime'] for t in sous) == ['PT1H30M', 'PT2H']
