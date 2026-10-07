"""
Contrat de la partie planification de `tools/wtm.py` : `planifier` et `faisabilite`.

Le calcul du planificateur n'ecrit jamais dans Taskwarrior ; ce qui compte ici est ce
que l'agent en tire. Mesure faite le 2026-10-07 sur une base jetable de 5 taches :
`plan.json` n'en contenait que 2, code de retour 0, aucun retard. Les trois absentes
(sans estimation, sans contexte, `+external`) n'y figurent pas : un plan « sans retard »
peut cacher des taches jamais placees. D'ou `non_places` classe par raison, et un
verdict « indetermine » tant qu'une tache du perimetre n'est pas placee.

Meme principe que test_wtm.py : tests unitaires mockes, plus une integration sur des
bases creees dans `tmp_path` (jamais prod, dev ni test).
"""

import datetime
import json
import os
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'tools'))

import wtm
from test_wtm import (AVEC_TASK, BASE_PROD, FauxTask, creer_base, exporter, task_brut,
                      tache)


def plan(taches, statut='OPTIMAL', en_retard=(), retard_total=0):
    """Un plan.json minimal : {uuid: (debut, fin[, retard_minutes])}."""
    corps = {}
    for uuid, vals in taches.items():
        corps[uuid] = {'debut': vals[0], 'fin': vals[1]}
        if len(vals) > 2:
            corps[uuid]['retard_minutes'] = vals[2]
    return {'version': 1, 'statut': statut, 'retard_total': retard_total,
            'en_retard': list(en_retard), 't0': '2026-10-07T00:00:00',
            'granularite_minutes': 30, 'taches': corps}


def tp(uuid, projet='SRM', **champs):
    """Tache pending avec contexte pro et estimation, sauf indication contraire."""
    champs.setdefault('tags', ['pro'])
    return tache(uuid, uuid, project=projet, **champs)


def ok(debut='2026-10-08T08:30:00', fin='2026-10-08T12:00:00', *plus):
    return (debut, fin, *plus)


class TestAnalyserPlan:
    def test_tout_place_sans_retard_tient(self):
        taches = [tp('a'), tp('b')]
        p = plan({'a': ok(), 'b': ok('2026-10-09T08:30:00', '2026-10-09T12:00:00')})
        res = wtm.analyser_plan(p, taches, projet='SRM')
        assert res['verdict'] == 'tient'
        assert res['fin'] == '2026-10-09T12:00:00'
        assert res['non_places'] == []
        assert res['perimetre'] == 2

    def test_tache_en_retard_ne_tient_pas(self):
        taches = [tp('a')]
        p = plan({'a': ('2026-10-08T08:30:00', '2026-10-20T12:00:00', 480)},
                 en_retard=['a'], retard_total=16)
        res = wtm.analyser_plan(p, taches, projet='SRM')
        assert res['verdict'] == 'ne-tient-pas'
        assert res['en_retard'] == [{'uuid': 'a', 'description': 'a',
                                     'retard_minutes': 480}]

    def test_tache_absente_du_plan_rend_le_verdict_indetermine(self):
        """Le piege : un plan sans retard peut cacher des taches jamais placees."""
        taches = [tp('a'), tp('b')]
        p = plan({'a': ok()})
        res = wtm.analyser_plan(p, taches, projet='SRM')
        assert res['verdict'] == 'indetermine'
        assert [(x['uuid'], x['raison']) for x in res['non_places']] == [('b', 'ecartee')]

    def test_raisons_d_absence(self):
        sans_est = tp('s')
        del sans_est['estTime']
        sans_ctx = tp('c', tags=[])
        externe = tp('e', tags=['pro', 'external'])
        res = wtm.analyser_plan(plan({}), [sans_est, sans_ctx, externe], projet='SRM')
        raisons = {x['uuid']: x['raison'] for x in res['non_places']}
        assert raisons == {'s': 'sans-esttime', 'c': 'sans-contexte', 'e': 'external'}

    def test_les_externes_seuls_ne_bloquent_pas_le_verdict(self):
        taches = [tp('a'), tp('e', tags=['pro', 'external'])]
        res = wtm.analyser_plan(plan({'a': ok()}), taches, projet='SRM')
        assert res['verdict'] == 'tient'
        assert [x['raison'] for x in res['non_places']] == ['external']

    def test_statut_feasible_est_indetermine(self):
        taches = [tp('a')]
        p = plan({'a': ok()}, statut='FEASIBLE')
        assert wtm.analyser_plan(p, taches, projet='SRM')['verdict'] == 'indetermine'

    def test_le_perimetre_suit_le_projet_et_ses_sous_projets(self):
        taches = [tp('a', 'SRM'), tp('b', 'SRM.Nord'), tp('c', 'SRMIX'), tp('d', 'Autre')]
        p = plan({'a': ok(),
                  'b': ok('2026-10-09T08:30:00', '2026-10-09T12:00:00'),
                  'c': ok('2026-10-30T08:30:00', '2026-10-30T12:00:00'),
                  'd': ok('2026-11-30T08:30:00', '2026-11-30T12:00:00')})
        res = wtm.analyser_plan(p, taches, projet='SRM')
        assert res['perimetre'] == 2  # SRM et SRM.Nord ; pas SRMIX
        assert res['fin'] == '2026-10-09T12:00:00'

    def test_taches_terminees_ignorees(self):
        taches = [tp('a'), tp('z', status='completed')]
        res = wtm.analyser_plan(plan({'a': ok()}), taches, projet='SRM')
        assert res['perimetre'] == 1


class FauxPlanif:
    """Remplace `wtm.executer_planif` : ecrit les plans fournis, un par appel."""

    def __init__(self, plans, code=0):
        self.plans = list(plans)
        self.appels = []
        self.code = code

    def __call__(self, taskrc, args):
        self.appels.append((taskrc, list(args)))
        if self.code == 0:
            chemin = args[args.index('--sortie') + 1]
            with open(chemin, 'w', encoding='utf-8') as f:
                json.dump(self.plans[len(self.appels) - 1], f)
        return self.code, '', 'boom' if self.code else ''


def poser_fausses(monkeypatch, taches, plans, base='C:/tmp/copie/data', code=0):
    faux_plan = FauxPlanif(plans, code=code)
    monkeypatch.setattr(wtm, 'executer_task', FauxTask(taches, base=base))
    monkeypatch.setattr(wtm, 'executer_planif', faux_plan)
    # fichier d'echeances de reference : un autre projet a un mur, SRM aussi (a ecraser)
    monkeypatch.setattr(wtm, 'lire_echeances',
                        lambda: {'Autre': '2027-01-15', 'SRM': '2026-12-01'})
    return faux_plan


def echeances_vues(faux):
    args = faux.appels[0][1]
    with open(args[args.index('--echeances') + 1], encoding='utf-8') as f:
        return json.load(f)


class TestPlanifier:
    UNE_TACHE = [tp('a')]
    UN_PLAN = [plan({'a': ok()})]

    def test_ne_porte_jamais_de_drapeau_d_ecriture(self, tmp_path, monkeypatch):
        faux = poser_fausses(monkeypatch, self.UNE_TACHE, self.UN_PLAN)
        wtm.planifier('C:/tmp/copie/taskrc', str(tmp_path), projet='SRM')
        args = faux.appels[0][1]
        for interdit in ('--ecrire-scheduled', '--ecrire-due', '--appliquer'):
            assert interdit not in args
        assert '--sortie' in args and '--echeances' in args

    def test_sans_echeance_retire_le_mur_du_projet_et_garde_les_autres(
            self, tmp_path, monkeypatch):
        faux = poser_fausses(monkeypatch, self.UNE_TACHE, self.UN_PLAN)
        wtm.planifier('C:/tmp/copie/taskrc', str(tmp_path), projet='SRM')
        ech = echeances_vues(faux)
        assert 'SRM' not in ech and ech['Autre'] == '2027-01-15'

    def test_avec_echeance_pose_le_mur_du_projet(self, tmp_path, monkeypatch):
        faux = poser_fausses(monkeypatch, self.UNE_TACHE, self.UN_PLAN)
        wtm.planifier('C:/tmp/copie/taskrc', str(tmp_path), projet='SRM',
                      echeance='2026-12-14')
        ech = echeances_vues(faux)
        assert ech['SRM'] == '2026-12-14' and ech['Autre'] == '2027-01-15'

    def test_les_horizons_couvrent_l_echeance(self, tmp_path, monkeypatch):
        """Par defaut 90 j et opportuniste 21 j : ils ecarteraient les taches lointaines."""
        faux = poser_fausses(monkeypatch, self.UNE_TACHE, self.UN_PLAN)
        loin = (datetime.date.today() + datetime.timedelta(days=300)).isoformat()
        wtm.planifier('C:/tmp/copie/taskrc', str(tmp_path), projet='SRM', echeance=loin)
        args = faux.appels[0][1]
        horizon = int(args[args.index('--horizon') + 1])
        opportuniste = int(args[args.index('--horizon-opportuniste') + 1])
        assert horizon >= 300 and opportuniste >= horizon

    def test_fichier_d_echeances_illisible_est_une_erreur_claire(self, tmp_path, monkeypatch):
        import config
        mauvais = tmp_path / 'echeances.json'
        mauvais.write_text('{ pas du json', encoding='utf-8')
        monkeypatch.setattr(config, 'PLANIFICATEUR_ECHEANCES', str(mauvais))
        with pytest.raises(wtm.WtmErreur):
            wtm.lire_echeances()

    def test_echeance_sans_projet_refusee(self, tmp_path, monkeypatch):
        poser_fausses(monkeypatch, self.UNE_TACHE, self.UN_PLAN)
        with pytest.raises(wtm.WtmErreur):
            wtm.planifier('C:/tmp/copie/taskrc', str(tmp_path), echeance='2026-12-14')

    def test_refuse_la_prod_sans_drapeau(self, tmp_path, monkeypatch):
        faux = poser_fausses(monkeypatch, self.UNE_TACHE, self.UN_PLAN,
                             base=BASE_PROD + '/data')
        with pytest.raises(wtm.WtmErreur):
            wtm.planifier('C:/Users/irpaui/taskwarrior-prod/taskrc', str(tmp_path),
                          projet='SRM')
        assert faux.appels == []

    def test_echec_du_planificateur_remonte(self, tmp_path, monkeypatch):
        poser_fausses(monkeypatch, self.UNE_TACHE, self.UN_PLAN, code=1)
        with pytest.raises(wtm.WtmErreur) as exc:
            wtm.planifier('C:/tmp/copie/taskrc', str(tmp_path), projet='SRM')
        assert 'boom' in str(exc.value)

    def test_executer_planif_pose_taskrc_et_retire_taskdata(self, monkeypatch):
        monkeypatch.setenv('TASKDATA', 'C:/Users/irpaui/taskwarrior-prod/data')
        vus = {}

        def faux_run(commande, **kw):
            vus['env'], vus['cwd'] = kw.get('env'), kw.get('cwd')
            return subprocess.CompletedProcess(commande, 0, stdout='', stderr='')

        monkeypatch.setattr(wtm.subprocess, 'run', faux_run)
        wtm.executer_planif('C:/tmp/copie/taskrc', ['-m', 'planif'])
        assert vus['env']['TASKRC'] == 'C:/tmp/copie/taskrc'
        assert 'TASKDATA' not in vus['env']
        assert vus['cwd']  # le planificateur tourne dans son propre depot


class TestFaisabilite:
    TACHES = [tp('a')]

    def test_tient_avec_marge(self, tmp_path, monkeypatch):
        un = plan({'a': ok(fin='2026-10-30T12:00:00')})
        poser_fausses(monkeypatch, self.TACHES, [un, un])
        res = wtm.faisabilite('C:/tmp/copie/taskrc', str(tmp_path), 'SRM', '2026-12-14')
        assert res['verdict'] == 'tient'
        assert res['au_plus_tot']['fin'] == '2026-10-30T12:00:00'
        assert 44 <= res['marge_jours'] <= 46  # du 30/10 midi a la fin du 14/12

    def test_ne_tient_pas_donne_la_date_au_plus_tot(self, tmp_path, monkeypatch):
        tot = plan({'a': ok(fin='2026-12-20T12:00:00')})
        tard = plan({'a': ('2026-10-08T08:30:00', '2026-12-20T12:00:00', 9000)},
                    en_retard=['a'], retard_total=300)
        poser_fausses(monkeypatch, self.TACHES, [tot, tard])
        res = wtm.faisabilite('C:/tmp/copie/taskrc', str(tmp_path), 'SRM', '2026-12-14')
        assert res['verdict'] == 'ne-tient-pas'
        assert res['au_plus_tot']['fin'] == '2026-12-20T12:00:00'
        assert res['marge_jours'] < 0

    def test_deux_calculs_dans_deux_dossiers_distincts(self, tmp_path, monkeypatch):
        un = plan({'a': ok()})
        faux = poser_fausses(monkeypatch, self.TACHES, [un, un])
        wtm.faisabilite('C:/tmp/copie/taskrc', str(tmp_path), 'SRM', '2026-12-14')
        sorties = [a[1][a[1].index('--sortie') + 1] for a in faux.appels]
        assert len(faux.appels) == 2 and sorties[0] != sorties[1]

    def test_tache_non_placee_rend_indetermine_meme_sans_retard(self, tmp_path, monkeypatch):
        un = plan({'a': ok()})
        poser_fausses(monkeypatch, [tp('a'), tp('b')], [un, un])
        res = wtm.faisabilite('C:/tmp/copie/taskrc', str(tmp_path), 'SRM', '2026-12-14')
        assert res['verdict'] == 'indetermine'


def planificateur_present():
    try:
        import config
        return (os.path.exists(config.PLANIFICATEUR_PYTHON)
                and os.path.isdir(config.PLANIFICATEUR_RACINE))
    except Exception:
        return False


@pytest.mark.skipif(not (AVEC_TASK and planificateur_present()),
                    reason='task ou TaskWarriorPlanner absent')
class TestPlanifIntegration:
    """Mesure reelle sur une base temporaire : rien n'est ecrit, les absentes sont classees."""

    @pytest.fixture
    def copie(self, tmp_path):
        rc = creer_base(tmp_path / 'source')
        with open(rc, 'a', encoding='utf-8') as f:
            f.write('context.pro.read=+pro\ncontext.perso.read=+perso\n')
        task_brut(rc, 'add', 'Alpha', 'project:SRM', 'estTime:4h', '+pro')
        task_brut(rc, 'add', 'Beta', 'project:SRM', 'estTime:8h', '+pro')
        task_brut(rc, 'add', 'Gamma', 'project:SRM', '+pro')            # sans estimation
        task_brut(rc, 'add', 'Delta', 'project:SRM', 'estTime:5d', '+pro', '+external')
        task_brut(rc, 'add', 'Epsilon', 'project:SRM', 'estTime:1h')    # sans contexte
        return wtm.copier(rc, str(tmp_path / 'copie'))

    def test_classe_les_absentes_et_n_ecrit_rien(self, copie, tmp_path):
        avant = wtm.empreinte(exporter(copie))
        res = wtm.planifier(copie, str(tmp_path / 'plan'), projet='SRM')
        assert wtm.empreinte(exporter(copie)) == avant
        assert {x['raison'] for x in res['non_places']} == {
            'sans-esttime', 'external', 'sans-contexte'}
        assert res['perimetre'] == 5 and res['fin'] is not None
        assert res['verdict'] == 'indetermine'  # Gamma et Epsilon ne sont pas places
