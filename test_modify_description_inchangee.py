"""
Bug : changer uniquement le projet d'une tache dont la description contient un
caractere non-ASCII (ex. "12°") echouait avec « Failed to update task ».

Cause : l'editeur renvoie toujours la description, meme inchangee ; le backend
la passait alors en argument a task.exe, qui corrompt/rejette le non-ASCII
(« Unknown error »). Une description inchangee ne doit pas etre renvoyee a
Taskwarrior.
"""
import json
import re
from unittest.mock import patch

from fastapi.testclient import TestClient

from main_fastapi import app
from fastapi_models import CommandResult

client = TestClient(app)

DESCRIPTION = "faire Design outillage de montage 12° pour le montage avec Test hydro integré"


def _repondeur(description_actuelle):
    def repondeur(commande):
        if re.search(r'(?:^|\s)modify(?:\s|$)', commande):
            if not commande.isascii() and 'description:' in commande:
                return CommandResult(success=False, stdout="",
                                     stderr="Unknown error. Please report.\n", returncode=1)
            return CommandResult(success=True, stdout="Modified 1 task.", stderr="", returncode=0)
        tache = {"id": 1, "uuid": "11111111-1111-1111-1111-111111111111",
                 "description": description_actuelle, "status": "pending",
                 "project": "NPD.Heliside", "tags": []}
        return CommandResult(success=True, stdout=json.dumps([tache]), stderr="", returncode=0)
    return repondeur


def test_projet_seul_ne_renvoie_pas_la_description_inchangee():
    with patch('main_fastapi.run_task_command') as mock_cmd:
        mock_cmd.side_effect = _repondeur(DESCRIPTION)
        reponse = client.put("/api/task/1/modify", json={
            "description": DESCRIPTION,
            "project": "NPD.Heliside.MRE.Montage",
            "tags": [],
        })

    assert reponse.json()["success"] is True, reponse.text
    modifs = [a.args[0] for a in mock_cmd.call_args_list
              if re.search(r'(?:^|\s)modify(?:\s|$)', a.args[0])]
    assert len(modifs) == 1, modifs
    assert 'description:' not in modifs[0], modifs[0]
    assert 'project:NPD.Heliside.MRE.Montage' in modifs[0], modifs[0]
