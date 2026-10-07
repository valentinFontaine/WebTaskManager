"""
Contrat de `tools/wtm.py` : le wrapper de securite entre les agents et Taskwarrior.

Il copie une base, l'audite en lecture seule, et n'ecrit qu'un lot valide, apres
sauvegarde, sur une base inchangee depuis l'audit.

Deux familles de tests :
- unitaires, entierement mockes (`FauxTask` remplace `wtm.executer_task`) ;
- integration reelle (`TestIntegration`), avec le vrai binaire `task` mais sur des
  bases creees dans `tmp_path` : ni la prod, ni dev, ni test. Sautes si `task` est absent.
"""

import json
import os
import shutil
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'tools'))

import wtm

BASE_PROD = 'C:/Users/irpaui/taskwarrior-prod'


def tache(uuid, description='t', **champs):
    base = {'uuid': uuid, 'description': description, 'status': 'pending',
            'estTime': 'PT1H', 'modified': '20261001T080000Z'}
    base.update(champs)
    return base


class FauxTask:
    """Remplace `wtm.executer_task` : repond a export / _get, enregistre le reste."""

    def __init__(self, taches=(), base='C:/tmp/copie/data', echec_sur=None):
        self.taches = list(taches)
        self.base = base
        self.ecritures = []
        self.echec_sur = echec_sur

    def __call__(self, taskrc, args, entree=None):
        if args == ['export']:
            return 0, json.dumps(self.taches), ''
        if args == ['_get', 'rc.data.location']:
            return 0, self.base + '\n', ''
        self.ecritures.append(list(args))
        if self.echec_sur is not None and len(self.ecritures) == self.echec_sur:
            return 1, '', 'echec simule'
        return 0, '', ''


def ecrire_lot(chemin, taches, operations, sauvegarde=True, empreinte=None):
    sauv = chemin.parent / 'sauvegarde.json'
    if sauvegarde:
        sauv.write_text(json.dumps(taches), encoding='utf-8')
    lot = {'version': 1, 'id': 'lot-test',
           'empreinte': empreinte or wtm.empreinte(taches),
           'sauvegarde': str(sauv), 'operations': operations}
    chemin.write_text(json.dumps(lot), encoding='utf-8')
    return str(chemin)


def modif(uuid, *args):
    return {'op': 'modify', 'uuid': uuid, 'args': list(args)}


# ---------------------------------------------------------------- anomalies

class TestAnomalies:
    def codes(self, taches):
        return {(a['code'], a['uuid']) for a in wtm.anomalies(taches)}

    def test_base_saine_sans_anomalie(self):
        a = tache('a')
        b = tache('b', depends=['a'])
        assert wtm.anomalies([a, b]) == []

    def test_cycle(self):
        a = tache('a', depends=['b'])
        b = tache('b', depends=['a'])
        codes = {c for c, _ in self.codes([a, b])}
        assert 'cycle' in codes

    def test_depends_inconnu_a_une_correction_mecanique(self):
        a = tache('a', depends=['fantome'])
        trouvees = [x for x in wtm.anomalies([a]) if x['code'] == 'depends-inconnu']
        assert len(trouvees) == 1
        assert trouvees[0]['uuid'] == 'a'
        assert trouvees[0]['correction'] == ['depends:-fantome']

    def test_depends_vers_tache_terminee_n_est_pas_une_anomalie(self):
        a = tache('a', depends=['b'])
        b = tache('b', status='completed')
        assert ('depends-inconnu', 'a') not in self.codes([a, b])

    def test_sans_esttime_sans_correction(self):
        a = tache('a')
        del a['estTime']
        trouvees = [x for x in wtm.anomalies([a]) if x['code'] == 'sans-esttime']
        assert len(trouvees) == 1 and trouvees[0]['correction'] is None

    def test_scheduled_apres_due(self):
        a = tache('a', scheduled='20261210T090000Z', due='20261205T170000Z')
        assert ('scheduled-apres-due', 'a') in self.codes([a])

    def test_jalon_sans_sous_tache(self):
        j = tache('j', tags=['milestone'])
        assert ('jalon-sans-sous-tache', 'j') in self.codes([j])

    def test_tache_terminee_n_est_pas_auditee(self):
        a = tache('a', status='completed')
        del a['estTime']
        assert wtm.anomalies([a]) == []


# ---------------------------------------------------------------- empreinte

class TestEmpreinte:
    def test_stable_et_independante_de_l_ordre(self):
        a, b = tache('a'), tache('b')
        assert wtm.empreinte([a, b]) == wtm.empreinte([b, a])

    def test_change_quand_une_tache_est_modifiee(self):
        a = tache('a')
        avant = wtm.empreinte([a])
        a2 = dict(a, modified='20261002T080000Z')
        assert wtm.empreinte([a2]) != avant


# ---------------------------------------------------------------- executer_task

class TestExecuterTask:
    def test_pose_taskrc_et_retire_taskdata_herite(self, monkeypatch):
        monkeypatch.setenv('TASKDATA', 'C:/Users/irpaui/taskwarrior-prod/data')
        vus = {}

        def faux_run(commande, **kw):
            vus['env'] = kw.get('env')
            vus['commande'] = commande
            return subprocess.CompletedProcess(commande, 0, stdout='[]', stderr='')

        monkeypatch.setattr(wtm.subprocess, 'run', faux_run)
        wtm.executer_task('C:/tmp/copie/taskrc', ['export'])
        assert vus['env']['TASKRC'] == 'C:/tmp/copie/taskrc'
        assert 'TASKDATA' not in vus['env']


# ---------------------------------------------------------------- appliquer

class TestAppliquer:
    def test_applique_les_operations_dans_l_ordre(self, tmp_path, monkeypatch):
        taches = [tache('a'), tache('b')]
        faux = FauxTask(taches)
        monkeypatch.setattr(wtm, 'executer_task', faux)
        lot = ecrire_lot(tmp_path / 'lot.json', taches,
                         [modif('a', 'estTime:2h'), modif('b', 'depends:-x')])
        res = wtm.appliquer(lot, 'C:/tmp/copie/taskrc')
        assert faux.ecritures == [
            ['rc.confirmation=off', 'a', 'modify', 'estTime:2h'],
            ['rc.confirmation=off', 'b', 'modify', 'depends:-x'],
        ]
        assert res['appliquees'] == 2

    def test_refuse_si_la_base_a_change_depuis_l_audit(self, tmp_path, monkeypatch):
        avant = [tache('a')]
        apres = [tache('a', modified='20261003T080000Z')]
        faux = FauxTask(apres)
        monkeypatch.setattr(wtm, 'executer_task', faux)
        lot = ecrire_lot(tmp_path / 'lot.json', avant, [modif('a', 'estTime:2h')])
        with pytest.raises(wtm.WtmErreur):
            wtm.appliquer(lot, 'C:/tmp/copie/taskrc')
        assert faux.ecritures == []

    def test_refuse_sans_sauvegarde(self, tmp_path, monkeypatch):
        taches = [tache('a')]
        faux = FauxTask(taches)
        monkeypatch.setattr(wtm, 'executer_task', faux)
        lot = ecrire_lot(tmp_path / 'lot.json', taches, [modif('a', 'estTime:2h')],
                         sauvegarde=False)
        with pytest.raises(wtm.WtmErreur):
            wtm.appliquer(lot, 'C:/tmp/copie/taskrc')
        assert faux.ecritures == []

    @pytest.mark.parametrize('base', [BASE_PROD + '/data',
                                      'C:\\Users\\irpaui\\taskwarrior-prod\\data'])
    def test_refuse_la_prod_sans_drapeau(self, tmp_path, monkeypatch, base):
        taches = [tache('a')]
        faux = FauxTask(taches, base=base)
        monkeypatch.setattr(wtm, 'executer_task', faux)
        lot = ecrire_lot(tmp_path / 'lot.json', taches, [modif('a', 'estTime:2h')])
        with pytest.raises(wtm.WtmErreur):
            wtm.appliquer(lot, 'C:/Users/irpaui/taskwarrior-prod/taskrc')
        assert faux.ecritures == []

    def test_accepte_la_prod_avec_le_drapeau(self, tmp_path, monkeypatch):
        taches = [tache('a')]
        faux = FauxTask(taches, base=BASE_PROD + '/data')
        monkeypatch.setattr(wtm, 'executer_task', faux)
        lot = ecrire_lot(tmp_path / 'lot.json', taches, [modif('a', 'estTime:2h')])
        res = wtm.appliquer(lot, 'C:/Users/irpaui/taskwarrior-prod/taskrc',
                            cible_prod=True)
        assert res['appliquees'] == 1

    def test_s_arrete_a_la_premiere_erreur_et_dit_ou(self, tmp_path, monkeypatch):
        taches = [tache('a'), tache('b'), tache('c')]
        faux = FauxTask(taches, echec_sur=2)
        monkeypatch.setattr(wtm, 'executer_task', faux)
        lot = ecrire_lot(tmp_path / 'lot.json', taches,
                         [modif('a', 'estTime:2h'), modif('b', 'estTime:2h'),
                          modif('c', 'estTime:2h')])
        with pytest.raises(wtm.WtmErreur) as exc:
            wtm.appliquer(lot, 'C:/tmp/copie/taskrc')
        assert len(faux.ecritures) == 2  # la troisieme n'est jamais tentee
        assert '1' in str(exc.value)  # une operation appliquee avant l'echec

    def test_refuse_un_argument_modify_non_ascii(self, tmp_path, monkeypatch):
        """task.exe corrompt les accents des arguments : on refuse, on n'ecrit pas de travers."""
        taches = [tache('a')]
        faux = FauxTask(taches)
        monkeypatch.setattr(wtm, 'executer_task', faux)
        lot = ecrire_lot(tmp_path / 'lot.json', taches,
                         [modif('a', 'description:Pi\u00e8ce')])
        with pytest.raises(wtm.WtmErreur):
            wtm.appliquer(lot, 'C:/tmp/copie/taskrc')
        assert faux.ecritures == []


# ---------------------------------------------------------------- CLI

class TestCli:
    def test_erreur_wtm_rend_2_et_ecrit_sur_stderr(self, tmp_path, capsys, monkeypatch):
        monkeypatch.setattr(wtm, 'executer_task', FauxTask([]))
        code = wtm.main(['appliquer', str(tmp_path / 'absent.json'),
                         '--taskrc', 'C:/tmp/copie/taskrc'])
        assert code == 2
        assert capsys.readouterr().err.strip() != ''


# ---------------------------------------------------------------- integration

AVEC_TASK = shutil.which('task') is not None


def creer_base(dossier):
    """Une base Taskwarrior vierge dans `dossier` ; rend le chemin de son taskrc."""
    dossier.mkdir(parents=True, exist_ok=True)
    data = dossier / 'data'
    data.mkdir(exist_ok=True)
    taskrc = dossier / 'taskrc'
    taskrc.write_text(
        'data.location={}\nconfirmation=off\nverbose=nothing\n'
        'uda.estTime.type=duration\nuda.estTime.label=Est\n'.format(
            str(data).replace('\\', '/')), encoding='utf-8')
    return str(taskrc)


def task_brut(taskrc, *args):
    env = {k: v for k, v in os.environ.items() if k != 'TASKDATA'}
    env['TASKRC'] = taskrc
    fini = subprocess.run(['task', *args], env=env, capture_output=True,
                          text=True, encoding='utf-8')
    return fini.returncode, fini.stdout


def exporter(taskrc):
    _, sortie = task_brut(taskrc, 'export')
    return json.loads(sortie)


@pytest.mark.skipif(not AVEC_TASK, reason='binaire task absent')
class TestIntegration:
    @pytest.fixture
    def source(self, tmp_path):
        rc = creer_base(tmp_path / 'source')
        task_brut(rc, 'add', 'Alpha', 'estTime:1h')
        task_brut(rc, 'add', 'Beta')  # sans estTime : anomalie attendue
        return rc

    def test_copie_identique_et_source_intacte(self, source, tmp_path):
        avant = wtm.empreinte(exporter(source))
        copie = wtm.copier(source, str(tmp_path / 'copie'))
        assert copie != source
        assert {t['uuid'] for t in exporter(copie)} == {t['uuid'] for t in exporter(source)}
        assert wtm.empreinte(exporter(source)) == avant

    def test_copie_refuse_une_destination_non_vide(self, source, tmp_path):
        dest = tmp_path / 'copie'
        dest.mkdir()
        (dest / 'quelque-chose').write_text('x')
        with pytest.raises(wtm.WtmErreur):
            wtm.copier(source, str(dest))

    def test_audit_en_lecture_seule_et_signale_l_anomalie(self, source, tmp_path):
        copie = wtm.copier(source, str(tmp_path / 'copie'))
        avant = wtm.empreinte(exporter(copie))
        res = wtm.auditer(copie, str(tmp_path / 'audit'))
        assert wtm.empreinte(exporter(copie)) == avant
        assert os.path.getsize(res['sauvegarde']) > 0
        lot = json.load(open(res['lot'], encoding='utf-8'))
        assert lot['empreinte'] == avant
        rapport = open(res['rapport'], encoding='utf-8').read()
        assert 'sans-esttime' in rapport

    def test_appliquer_ecrit_sur_la_copie_pas_sur_la_source(self, source, tmp_path):
        copie = wtm.copier(source, str(tmp_path / 'copie'))
        taches = exporter(copie)
        beta = next(t for t in taches if t['description'] == 'Beta')
        lot = ecrire_lot(tmp_path / 'lot.json', taches, [modif(beta['uuid'], 'estTime:2h')])
        wtm.appliquer(lot, copie)
        corrigee = next(t for t in exporter(copie) if t['uuid'] == beta['uuid'])
        assert 'estTime' in corrigee
        intacte = next(t for t in exporter(source) if t['uuid'] == beta['uuid'])
        assert 'estTime' not in intacte

    def test_appliquer_deux_fois_le_meme_lot_est_refuse(self, source, tmp_path):
        """La premiere application change la base : l'empreinte du lot n'est plus bonne."""
        copie = wtm.copier(source, str(tmp_path / 'copie'))
        taches = exporter(copie)
        beta = next(t for t in taches if t['description'] == 'Beta')
        lot = ecrire_lot(tmp_path / 'lot.json', taches, [modif(beta['uuid'], 'estTime:2h')])
        wtm.appliquer(lot, copie)
        with pytest.raises(wtm.WtmErreur):
            wtm.appliquer(lot, copie)

    def test_import_conserve_les_accents(self, source, tmp_path):
        copie = wtm.copier(source, str(tmp_path / 'copie'))
        taches = exporter(copie)
        nouvelle = {'uuid': '11111111-2222-3333-4444-555555555555',
                    'description': 'Pi\u00e8ce \u00e0 consulter', 'status': 'pending',
                    'entry': '20261007T080000Z'}
        lot = ecrire_lot(tmp_path / 'lot.json', taches,
                         [{'op': 'import', 'taches': [nouvelle]}])
        wtm.appliquer(lot, copie)
        vue = next(t for t in exporter(copie) if t['uuid'] == nouvelle['uuid'])
        assert vue['description'] == 'Pi\u00e8ce \u00e0 consulter'
