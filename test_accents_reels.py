"""
Accents de bout en bout contre un VRAI Taskwarrior : creation, modification de la
description, modification du projet avec description inchangee, relecture.

Ne tourne que sur demande, sur une base jetable :
    TW_REEL=1 TASKRC=<taskrc jetable> pytest test_accents_reels.py
Meme commande sous Termux (staging) : c'est le test qui valide le binaire amont.
Sans TW_REEL, tout est saute : `pytest` seul reste sans risque.

Sous Windows, task.exe lit argv en ANSI puis en UTF-8 (voir argv_for_task_exe) ;
sous Linux/Termux l'UTF-8 passe tel quel. Le test doit etre vert dans les deux cas.
"""
import json
import os
import subprocess

import pytest
from fastapi.testclient import TestClient

import main_fastapi

pytestmark = pytest.mark.skipif(
    os.environ.get('TW_REEL') != '1' or not (os.environ.get('TASKRC') or os.environ.get('TASKDATA')),
    reason="test reel : TW_REEL=1 et TASKRC/TASKDATA sur une base jetable requis",
)

DESCRIPTIONS = [
    "faire Design outillage de montage 12° pour le montage avec Test hydro integré",
    "integré",
    "avec Test hydro integré",
    "façon très élaborée — œuvre ñ",
]

MARQUEURS_JETABLE = ('test', 'dev', 'staging', 'tmp', 'temp')


@pytest.fixture(scope='module')
def client():
    if os.environ.get('TASKDATA'):
        loc = os.environ['TASKDATA']
    else:
        loc = subprocess.run(
            f'task rc:"{os.environ["TASKRC"]}" _get rc.data.location',
            shell=True, capture_output=True, encoding='utf-8', errors='replace',
        ).stdout.strip()
    if not any(m in loc.lower() for m in MARQUEURS_JETABLE):
        pytest.fail(f"Base effective {loc!r} : pas reconnue comme jetable, refus.")
    main_fastapi.DEVELOPER_MODE = False
    yield TestClient(main_fastapi.app)


def _lire(uuid):
    r = main_fastapi.run_task_command(f'task {uuid} export')
    return json.loads(r.stdout)[0]


def _creer(client, description):
    resp = client.post('/api/task/add', json={'description': description}).json()
    assert resp.get('success'), resp
    return resp['task']


@pytest.mark.parametrize('description', DESCRIPTIONS)
def test_creation_avec_accents(client, description):
    tache = _creer(client, description)
    try:
        assert _lire(tache['uuid'])['description'] == description
    finally:
        client.delete(f'/api/task/{tache["id"]}/delete')


@pytest.mark.parametrize('description', DESCRIPTIONS)
def test_modification_description_avec_accents(client, description):
    tache = _creer(client, 'sans accent')
    try:
        resp = client.put(f'/api/task/{tache["id"]}/modify', json={'description': description}).json()
        assert resp.get('success'), resp
        assert _lire(tache['uuid'])['description'] == description
    finally:
        client.delete(f'/api/task/{tache["id"]}/delete')


def test_projet_seul_description_accentuee_inchangee(client):
    tache = _creer(client, DESCRIPTIONS[0])
    try:
        resp = client.put(f'/api/task/{tache["id"]}/modify',
                          json={'description': DESCRIPTIONS[0], 'project': 'Essai.Accents'}).json()
        assert resp.get('success'), resp
        relue = _lire(tache['uuid'])
        assert relue['description'] == DESCRIPTIONS[0]
        assert relue['project'] == 'Essai.Accents'
    finally:
        client.delete(f'/api/task/{tache["id"]}/delete')
