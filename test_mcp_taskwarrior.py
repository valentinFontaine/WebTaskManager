"""
Contrat de `tools/mcp_taskwarrior.py` : le serveur MCP qui lit, propose, applique et annule
des lots d'operations Taskwarrior (spec : openspec/changes/serveur-mcp-taskwarrior/).

Fonctions pures testees directement (le serveur MCP n'en est qu'une enveloppe) :

    configuration(environ) -> {'taskrc', 'etat'}
    lire(taskrc, projet=None, statut='pending', filtre=None, limite=50) -> str
    proposer_lot(taskrc, etat, titre, operations, maintenant=None) -> str (resume)
    appliquer_lot(taskrc, etat, id, maintenant=None) -> str
    annuler_lot(taskrc, etat, id) -> str
    lister_lots(etat, n=10, maintenant=None) -> str
    rendre_resume(proposition) -> str
    creer_serveur(config) -> FastMCP

Les refus levent `wtm.WtmErreur` ; l'enveloppe MCP les rend en texte « Refusé : ... ».

Integration reelle : vrai binaire `task`, bases creees dans `tmp_path` (jamais la prod,
ni dev, ni test). Mesure du 2026-10-15 qui structure le contrat : `task import` sur un
uuid existant REMPLACE la tache entiere (les champs absents disparaissent), et ne
normalise pas `estTime` (le texte est stocke tel quel).
"""

import asyncio
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'tools'))

import wtm
from test_wtm import AVEC_TASK, creer_base, exporter, task_brut

try:
    import mcp_taskwarrior as mcp_tw
except ImportError:  # contrat rouge tant que le module n'existe pas
    mcp_tw = None

pytestmark = pytest.mark.skipif(not AVEC_TASK, reason='binaire task absent')


# ---------------------------------------------------------------- outils

def utc(annee, mois, jour, heure=12):
    """Date locale -> format Taskwarrior UTC (midi : loin des changements d'heure)."""
    return datetime(annee, mois, jour, heure).astimezone(timezone.utc).strftime('%Y%m%dT%H%M%SZ')


def par_desc(taskrc, description):
    return next(t for t in exporter(taskrc) if t['description'] == description)


def id_du_lot(resume):
    m = re.search(r'Lot (L-[0-9a-z]+)', resume)
    assert m, 'pas d\'identifiant de lot dans :\n' + resume
    return m.group(1)


def creer(description, **champs):
    op = {'op': 'creer', 'description': description, 'project': 'NPD.Heliside',
          'tags': ['pro', 'jde'], 'estTime': '30min'}
    op.update(champs)
    return op


@pytest.fixture
def base(tmp_path):
    """Base jetable : Alpha (pro), Beta (perso), Gamma (pro, depend d'Alpha)."""
    rc = creer_base(tmp_path / 'base')
    task_brut(rc, 'add', 'Alpha', 'project:NPD.Heliside', '+pro', '+jde', 'estTime:1h',
              'due:2026-12-01')
    task_brut(rc, 'add', 'Beta', 'project:Maison', '+perso', 'estTime:30min')
    alpha = par_desc(rc, 'Alpha')
    task_brut(rc, 'add', 'Gamma', 'project:NPD.Heliside', '+pro', 'estTime:2h',
              'depends:' + alpha['uuid'])
    return rc


@pytest.fixture
def etat(tmp_path):
    return str(tmp_path / 'etat')


def proposer(base, etat, *operations, titre='Essai'):
    return mcp_tw.proposer_lot(base, etat, titre, list(operations))


def proposer_et_figer(base, etat, *operations):
    resume = proposer(base, etat, *operations)
    return id_du_lot(resume)


# ---------------------------------------------------------------- configuration

class TestConfiguration:
    def test_refuse_sans_wtm_mcp_taskrc(self):
        with pytest.raises(wtm.WtmErreur):
            mcp_tw.configuration({'LOCALAPPDATA': 'C:/x'})

    def test_refuse_un_taskrc_introuvable(self, tmp_path):
        with pytest.raises(wtm.WtmErreur):
            mcp_tw.configuration({'WTM_MCP_TASKRC': str(tmp_path / 'absent')})

    def test_etat_par_defaut_dans_localappdata(self, base, tmp_path):
        conf = mcp_tw.configuration({'WTM_MCP_TASKRC': base,
                                     'LOCALAPPDATA': str(tmp_path / 'lad')})
        assert conf['taskrc'] == base
        assert os.path.normpath(conf['etat']) == os.path.normpath(
            str(tmp_path / 'lad' / 'wtm-mcp'))

    def test_refuse_un_etat_dans_le_dossier_de_la_base(self, base, tmp_path):
        """Syncthing repliquerait les lots et les sauvegardes."""
        with pytest.raises(wtm.WtmErreur):
            mcp_tw.configuration({'WTM_MCP_TASKRC': base,
                                  'WTM_MCP_ETAT': str(tmp_path / 'base' / 'data' / 'etat')})

    def test_taskdata_herite_ignore(self, base, etat, tmp_path, monkeypatch):
        autre = creer_base(tmp_path / 'autre')
        task_brut(autre, 'add', 'Intruse', '+pro')
        monkeypatch.setenv('TASKDATA', str(tmp_path / 'autre' / 'data'))
        texte = mcp_tw.lire(base)
        assert 'Alpha' in texte and 'Intruse' not in texte


# ---------------------------------------------------------------- lire

class TestLire:
    def test_en_tete_et_une_ligne_par_tache(self, base):
        alpha = par_desc(base, 'Alpha')
        texte = mcp_tw.lire(base)
        premiere = texte.splitlines()[0]
        assert '3' in premiere
        assert wtm.empreinte(exporter(base))[:8] in premiere
        ligne = next(l for l in texte.splitlines() if 'Alpha' in l)
        assert alpha['uuid'][:8] in ligne
        assert 'NPD.Heliside' in ligne and 'jde' in ligne
        assert alpha['uuid'] not in texte, 'uuid court attendu, pas l\'uuid complet'

    def test_dependances_en_uuid_court(self, base):
        alpha = par_desc(base, 'Alpha')
        ligne = next(l for l in mcp_tw.lire(base).splitlines() if 'Gamma' in l)
        assert alpha['uuid'][:8] in ligne

    def test_projet_et_filtre(self, base):
        texte = mcp_tw.lire(base, projet='Maison')
        assert 'Beta' in texte and 'Alpha' not in texte
        texte = mcp_tw.lire(base, filtre='+jde')
        assert 'Alpha' in texte and 'Gamma' not in texte

    def test_limite_annonce_les_taches_masquees(self, base):
        texte = mcp_tw.lire(base, limite=1)
        assert '2 autres non affichées' in texte

    @pytest.mark.parametrize('filtre', ['modify estTime:1h', 'done', 'delete', '1 purge'])
    def test_filtre_avec_un_mot_de_commande_refuse(self, base, filtre):
        avant = wtm.empreinte(exporter(base))
        with pytest.raises(wtm.WtmErreur):
            mcp_tw.lire(base, filtre=filtre)
        assert wtm.empreinte(exporter(base)) == avant

    def test_lecture_seule(self, base):
        avant = wtm.empreinte(exporter(base))
        mcp_tw.lire(base)
        assert wtm.empreinte(exporter(base)) == avant


# ---------------------------------------------------------------- proposer_lot

class TestProposer:
    def test_lot_valide_fige_sans_toucher_la_base(self, base, etat):
        avant = wtm.empreinte(exporter(base))
        resume = proposer(base, etat, creer('Corriger la codification'))
        lot = id_du_lot(resume)
        assert wtm.empreinte(exporter(base)) == avant
        assert os.path.isfile(os.path.join(etat, 'lots', lot + '.json'))
        assert '✔ essai sur copie (1 créée)' in resume
        assert 'Avertissements : aucun' in resume

    def test_l_essai_ne_laisse_pas_de_copie(self, base, etat, tmp_path, monkeypatch):
        monkeypatch.setenv('TMP', str(tmp_path / 'tmp'))
        monkeypatch.setenv('TEMP', str(tmp_path / 'tmp'))
        os.makedirs(tmp_path / 'tmp')
        import tempfile
        monkeypatch.setattr(tempfile, 'tempdir', None)
        proposer(base, etat, creer('X'))
        assert os.listdir(tmp_path / 'tmp') == []

    def test_deux_propositions_ont_deux_identifiants(self, base, etat):
        a = proposer_et_figer(base, etat, creer('X'))
        b = proposer_et_figer(base, etat, creer('X'))
        assert a != b

    def test_uuid_court_accepte(self, base, etat):
        alpha = par_desc(base, 'Alpha')
        resume = proposer(base, etat, {'op': 'modifier', 'uuid': alpha['uuid'][:8],
                                       'estTime': '2h'})
        id_du_lot(resume)

    @pytest.mark.parametrize('operation, motif', [
        (creer('X', estTime='1h3x'), 'estTime'),
        (creer('X', due='31/02/2026'), 'date'),
        (creer('X', tags=['jde']), 'contexte'),
        (creer('X', depends=['deadbeef']), 'deadbeef'),
        (creer('X', depends=['$2']), '$2'),
        ({'op': 'modifier', 'uuid': 'deadbeef', 'estTime': '1h'}, 'deadbeef'),
        ({'op': 'modifier', 'uuid': 'ALPHA', 'status': 'completed'}, 'status'),
        ({'op': 'modifier', 'uuid': 'ALPHA', 'tags_retrait': ['pro']}, 'contexte'),
        ({'op': 'done', 'uuid': 'ALPHA'}, 'interdit'),
        ({'op': 'delete', 'uuid': 'ALPHA'}, 'interdit'),
        ({'op': 'purge'}, 'interdit'),
        ({'op': 'undo'}, 'interdit'),
        ({'op': 'sync'}, 'interdit'),
        ({'op': 'config', 'nom': 'confirmation', 'valeur': 'off'}, 'interdit'),
    ])
    def test_bloquant_le_lot_n_est_pas_fige(self, base, etat, operation, motif):
        alpha = par_desc(base, 'Alpha')
        operation = {k: (alpha['uuid'] if v == 'ALPHA' else v) for k, v in operation.items()}
        resume = proposer(base, etat, operation)
        assert 'Bloquants' in resume
        assert motif in resume
        assert not re.search(r'Lot L-[0-9a-z]+', resume)
        lots = os.path.join(etat, 'lots')
        assert not os.path.isdir(lots) or not os.listdir(lots)

    def test_cycle_cree_par_le_lot(self, base, etat):
        alpha = par_desc(base, 'Alpha')
        gamma = par_desc(base, 'Gamma')  # Gamma depend deja d'Alpha
        resume = proposer(base, etat, {'op': 'modifier', 'uuid': alpha['uuid'],
                                       'depends_ajout': [gamma['uuid']]})
        assert 'Bloquants' in resume and 'cycle' in resume

    def test_dependance_vers_une_tache_creee_du_lot(self, base, etat):
        resume = proposer(base, etat, creer('Premiere'), creer('Seconde', depends=['$1']))
        id_du_lot(resume)

    @pytest.mark.parametrize('operation, motif', [
        (creer('X', tags=['pro', 'zorglub']), 'zorglub'),
        (creer('X', project='Projet.Nouveau'), 'Projet.Nouveau'),
        (creer('alpha '), 'Alpha'),
        (creer('X', due='2020-01-01'), 'échéance'),
        (creer('X', scheduled='2026-12-10', due='2026-12-05'), 'scheduled'),
        (creer('X', estTime=None), 'estTime'),
    ])
    def test_avertissement_le_lot_est_fige(self, base, etat, operation, motif):
        operation = {k: v for k, v in operation.items() if v is not None}
        resume = proposer(base, etat, operation)
        id_du_lot(resume)
        avert = resume[resume.index('Avertissements'):]
        assert 'aucun' not in avert.splitlines()[0]
        assert motif in avert

    def test_lot_fige_et_immuable(self, base, etat):
        """Un lot retouche sur disque apres proposition n'est plus applicable."""
        lot = proposer_et_figer(base, etat, creer('X'))
        chemin = os.path.join(etat, 'lots', lot + '.json')
        with open(chemin, encoding='utf-8') as f:
            contenu = json.load(f)
        texte = json.dumps(contenu, ensure_ascii=False).replace('"X"', '"Y"')
        with open(chemin, 'w', encoding='utf-8') as f:
            f.write(texte)
        with pytest.raises(wtm.WtmErreur):
            mcp_tw.appliquer_lot(base, etat, lot)
        assert not any(t['description'] in ('X', 'Y') for t in exporter(base))


# ---------------------------------------------------------------- appliquer_lot

class TestAppliquer:
    def test_creation_avec_accents_et_champs(self, base, etat):
        lot = proposer_et_figer(base, etat, creer('Pièce à vérifier', estTime='1h30',
                                                   due='2026-11-04'))
        texte = mcp_tw.appliquer_lot(base, etat, lot)
        assert 'Lot {} appliqué : 1 créée, 0 modifiée'.format(lot) in texte
        t = par_desc(base, 'Pièce à vérifier')
        assert texte.count(t['uuid'][:8]) == 1
        assert t['project'] == 'NPD.Heliside'
        assert sorted(t['tags']) == ['jde', 'pro']
        assert t['estTime'] == 'PT1H30M', 'estTime normalise par le serveur, pas par import'
        assert t['due'][:8] in ('20261103', '20261104')

    def test_creation_avec_dependance_interne(self, base, etat):
        lot = proposer_et_figer(base, etat, creer('Premiere'), creer('Seconde', depends=['$1']))
        mcp_tw.appliquer_lot(base, etat, lot)
        assert par_desc(base, 'Seconde')['depends'] == [par_desc(base, 'Premiere')['uuid']]

    def test_modification_conserve_les_autres_champs(self, base, etat):
        """`import` remplace la tache entiere : le serveur doit repartir de l'export."""
        alpha = par_desc(base, 'Alpha')
        beta = par_desc(base, 'Beta')
        lot = proposer_et_figer(base, etat, {
            'op': 'modifier', 'uuid': alpha['uuid'], 'estTime': '2h',
            'description': 'Alpha révisée', 'tags_ajout': ['mail'], 'tags_retrait': ['jde'],
            'depends_ajout': [beta['uuid']]})
        mcp_tw.appliquer_lot(base, etat, lot)
        t = next(x for x in exporter(base) if x['uuid'] == alpha['uuid'])
        assert t['description'] == 'Alpha révisée'
        assert t['estTime'] == 'PT2H'
        assert sorted(t['tags']) == ['mail', 'pro']
        assert t['depends'] == [beta['uuid']]
        assert t['project'] == 'NPD.Heliside' and t['due'] == alpha['due']
        assert t['entry'] == alpha['entry']

    def test_annoter(self, base, etat):
        alpha = par_desc(base, 'Alpha')
        lot = proposer_et_figer(base, etat, {'op': 'annoter', 'uuid': alpha['uuid'],
                                             'texte': 'Relancé par mail'})
        mcp_tw.appliquer_lot(base, etat, lot)
        t = par_desc(base, 'Alpha')
        assert [a['description'] for a in t['annotations']] == ['Relancé par mail']

    def test_sauvegarde_et_journal_ecrits(self, base, etat):
        alpha = par_desc(base, 'Alpha')
        lot = proposer_et_figer(base, etat, creer('X'),
                                {'op': 'modifier', 'uuid': alpha['uuid'], 'estTime': '2h'})
        avant = exporter(base)
        mcp_tw.appliquer_lot(base, etat, lot)
        sauvegardes = os.listdir(os.path.join(etat, 'sauvegardes'))
        assert any(lot in s for s in sauvegardes)
        with open(os.path.join(etat, 'sauvegardes',
                               next(s for s in sauvegardes if lot in s)), encoding='utf-8') as f:
            assert {t['uuid'] for t in json.load(f)} == {t['uuid'] for t in avant}
        with open(os.path.join(etat, 'journaux', lot + '.json'), encoding='utf-8') as f:
            journal = json.load(f)
        assert journal['crees'] == [par_desc(base, 'X')['uuid']]
        modif = journal['modifiees'][alpha['uuid']]
        assert modif['avant']['estTime'] == 'PT1H'
        assert modif['modified'] == par_desc(base, 'Alpha')['modified']

    def test_refuse_si_la_base_a_change(self, base, etat):
        lot = proposer_et_figer(base, etat, creer('X'))
        task_brut(base, 'add', 'Arrivee entre-temps', '+pro')
        with pytest.raises(wtm.WtmErreur, match='base a changé'):
            mcp_tw.appliquer_lot(base, etat, lot)
        assert not any(t['description'] == 'X' for t in exporter(base))

    def test_refuse_un_lot_perime(self, base, etat):
        lot = proposer_et_figer(base, etat, creer('X'))
        with pytest.raises(wtm.WtmErreur):
            mcp_tw.appliquer_lot(base, etat, lot,
                                 maintenant=datetime.now() + timedelta(hours=25))
        assert not any(t['description'] == 'X' for t in exporter(base))

    def test_refuse_un_lot_deja_applique(self, base, etat):
        lot = proposer_et_figer(base, etat, creer('X'))
        mcp_tw.appliquer_lot(base, etat, lot)
        with pytest.raises(wtm.WtmErreur):
            mcp_tw.appliquer_lot(base, etat, lot)
        assert sum(t['description'] == 'X' for t in exporter(base)) == 1

    def test_refuse_un_lot_inconnu(self, base, etat):
        with pytest.raises(wtm.WtmErreur):
            mcp_tw.appliquer_lot(base, etat, 'L-0000')


# ---------------------------------------------------------------- annuler_lot

class TestAnnuler:
    def test_annule_une_creation(self, base, etat):
        lot = proposer_et_figer(base, etat, creer('X'))
        mcp_tw.appliquer_lot(base, etat, lot)
        uuid = par_desc(base, 'X')['uuid']
        mcp_tw.annuler_lot(base, etat, lot)
        assert next(t for t in exporter(base) if t['uuid'] == uuid)['status'] == 'deleted'
        assert par_desc(base, 'Alpha')['status'] == 'pending'

    def test_annule_une_modification(self, base, etat):
        alpha = par_desc(base, 'Alpha')
        lot = proposer_et_figer(base, etat, {'op': 'modifier', 'uuid': alpha['uuid'],
                                             'estTime': '2h', 'tags_ajout': ['mail']})
        mcp_tw.appliquer_lot(base, etat, lot)
        mcp_tw.annuler_lot(base, etat, lot)
        t = par_desc(base, 'Alpha')
        assert t['estTime'] == 'PT1H'
        assert sorted(t['tags']) == ['jde', 'pro']
        assert t['due'] == alpha['due']

    def test_annule_un_decoupage(self, base, etat):
        """Spec : ou bien l'annulation marche, ou bien elle est refusee explicitement."""
        alpha = par_desc(base, 'Alpha')
        lot = proposer_et_figer(base, etat, {
            'op': 'decouper', 'uuid': alpha['uuid'], 'sous_projet': None,
            'sous_taches': [{'description': 'Rédiger', 'estTime': '1h'},
                            {'description': 'Relire', 'estTime': '30min'}]})
        mcp_tw.appliquer_lot(base, etat, lot)
        assert 'milestone' in par_desc(base, 'Alpha')['tags']
        mcp_tw.annuler_lot(base, etat, lot)
        t = par_desc(base, 'Alpha')
        assert 'milestone' not in t['tags'] and t['estTime'] == 'PT1H'
        assert not t.get('depends')
        statuts = {x['description']: x['status'] for x in exporter(base)}
        assert statuts['Rédiger'] == 'deleted' and statuts['Relire'] == 'deleted'

    def test_refuse_en_bloc_si_une_tache_a_ete_retouchee(self, base, etat):
        alpha = par_desc(base, 'Alpha')
        lot = proposer_et_figer(base, etat, creer('X'),
                                {'op': 'modifier', 'uuid': alpha['uuid'], 'estTime': '2h'})
        mcp_tw.appliquer_lot(base, etat, lot)
        task_brut(base, alpha['uuid'], 'modify', 'estTime:3h')
        with pytest.raises(wtm.WtmErreur, match='Alpha'):
            mcp_tw.annuler_lot(base, etat, lot)
        assert par_desc(base, 'X')['status'] == 'pending'
        assert par_desc(base, 'Alpha')['estTime'] == 'PT3H'

    def test_refuse_un_lot_non_applique(self, base, etat):
        lot = proposer_et_figer(base, etat, creer('X'))
        with pytest.raises(wtm.WtmErreur):
            mcp_tw.annuler_lot(base, etat, lot)

    def test_refuse_une_double_annulation(self, base, etat):
        lot = proposer_et_figer(base, etat, creer('X'))
        mcp_tw.appliquer_lot(base, etat, lot)
        mcp_tw.annuler_lot(base, etat, lot)
        with pytest.raises(wtm.WtmErreur):
            mcp_tw.annuler_lot(base, etat, lot)


# ---------------------------------------------------------------- lister_lots

class TestLister:
    def test_etats_des_lots(self, base, etat):
        propose = proposer_et_figer(base, etat, creer('A'))
        applique = proposer_et_figer(base, etat, creer('B'))
        mcp_tw.appliquer_lot(base, etat, applique)
        annule = proposer_et_figer(base, etat, creer('C'))
        mcp_tw.appliquer_lot(base, etat, annule)
        mcp_tw.annuler_lot(base, etat, annule)
        lignes = mcp_tw.lister_lots(etat).splitlines()

        def ligne(lot):
            return next(l for l in lignes if lot in l)
        assert 'appliqué' in ligne(applique)
        assert 'annulé' in ligne(annule)
        # propose avant deux applications : la base a change, mais l'etat reste « proposé »
        # tant que les 24 h ne sont pas passees ; la peremption par l'age se voit ici :
        assert 'périmé' in next(l for l in mcp_tw.lister_lots(
            etat, maintenant=datetime.now() + timedelta(hours=25)).splitlines() if propose in l)

    def test_n_derniers(self, base, etat):
        lots = [proposer_et_figer(base, etat, creer('X{}'.format(i))) for i in range(3)]
        texte = mcp_tw.lister_lots(etat, n=2)
        assert lots[0] not in texte and lots[1] in texte and lots[2] in texte


# ---------------------------------------------------------------- resume (format)

RESUME_ATTENDU = """\
Lot L-0412 — Garnitures US SiC/SiC — 2 à créer, 0 à modifier      (proposé le 15/10 à 09:12)
Base : 258 tâches en attente, empreinte 2dfd948d

 #  Op     Projet           Tâche                                         Tags                Durée  Échéance
 1  créer  NPD.Heliside.US  Corriger la codification JDE des garnitures   jde                 30min  —
                            GMS-0300-00013 à 00015 : faces SiC/SiC
 2  créer  NPD.Heliside.US  Demander à Flexaseal (D. Wolford) de          mail fournisseur    15min  04/11/2026
                            corriger FAS-10521                            sourcing quick

Contrôles : ✔ formats  ✔ tags connus  ✔ projet existant  ✔ essai sur copie (2 créées)
Avertissements : aucun
→ « applique le lot » pour écrire. Le lot expire si la base change ou dans 24 h."""


def proposition_connue():
    return {
        'id': 'L-0412', 'titre': 'Garnitures US SiC/SiC',
        'propose_le': datetime(2026, 10, 15, 9, 12),
        'base': {'en_attente': 258, 'empreinte': '2dfd948d' + '0' * 56},
        'creer': 2, 'modifier': 0,
        'lignes': [
            {'op': 'creer', 'project': 'NPD.Heliside.US',
             'description': 'Corriger la codification JDE des garnitures '
                            'GMS-0300-00013 à 00015 : faces SiC/SiC',
             'tags': ['pro', 'jde'], 'estTime': 'PT30M', 'due': None},
            {'op': 'creer', 'project': 'NPD.Heliside.US',
             'description': 'Demander à Flexaseal (D. Wolford) de corriger FAS-10521',
             'tags': ['pro', 'mail', 'fournisseur', 'sourcing', 'quick'],
             'estTime': 'PT15M', 'due': utc(2026, 11, 4)},
        ],
        'controles': {'formats': True, 'tags': True, 'projet': True,
                      'essai': {'creees': 2, 'modifiees': 0}},
        'bloquants': [], 'avertissements': [],
    }


class TestResume:
    def test_rendu_d_un_lot_connu(self):
        assert mcp_tw.rendre_resume(proposition_connue()) == RESUME_ATTENDU

    def test_modification_montre_avant_apres(self):
        p = proposition_connue()
        p['creer'], p['modifier'] = 0, 1
        p['lignes'] = [{'op': 'modifier', 'project': 'NPD.Heliside.US',
                        'description': 'Alpha', 'tags': ['pro'], 'estTime': 'PT2H',
                        'due': None, 'changements': [('estTime', 'PT1H', 'PT2H')]}]
        p['controles']['essai'] = {'creees': 0, 'modifiees': 1}
        texte = mcp_tw.rendre_resume(p)
        assert 'estTime : 1h → 2h' in texte
        assert '(1 modifiée)' in texte

    def test_bloquants_sans_identifiant(self):
        p = proposition_connue()
        p['id'] = None
        p['bloquants'] = ['estTime invalide : 1h3x']
        p['controles']['formats'] = False
        p['controles']['essai'] = None
        texte = mcp_tw.rendre_resume(p)
        assert 'L-0412' not in texte
        assert '✘ formats' in texte
        assert 'estTime invalide : 1h3x' in texte
        assert '« applique le lot »' not in texte


# ---------------------------------------------------------------- enveloppe MCP

class TestServeurMcp:
    def test_cinq_outils(self, base, etat):
        serveur = mcp_tw.creer_serveur({'taskrc': base, 'etat': etat})
        noms = {t.name for t in asyncio.run(serveur.list_tools())}
        assert noms == {'lire', 'proposer_lot', 'appliquer_lot', 'annuler_lot', 'lister_lots'}

    def test_un_refus_devient_un_texte(self, base, etat):
        serveur = mcp_tw.creer_serveur({'taskrc': base, 'etat': etat})
        res = asyncio.run(serveur.call_tool('appliquer_lot', {'id': 'L-0000'}))
        texte = json.dumps(res, default=str, ensure_ascii=False)
        assert 'Refusé' in texte
