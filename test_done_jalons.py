"""`done` ne ferme plus les jalons tant que FERMER_JALONS_AUTO est faux (decision du
2026-10-07 : l'utilisateur ferme les jalons lui-meme, ce qui sert de verification).
La fonction decoupage.jalons_a_fermer et le test avec le drapeau actif restent dans
test_decoupage.py (TestClotureViaDone)."""

import json
from unittest.mock import patch

from fastapi.testclient import TestClient

import config
import main_fastapi
from test_decoupage import ok

client = TestClient(main_fastapi.app)

S1 = '11111111-1111-4111-8111-111111111111'
S2 = '22222222-2222-4222-8222-222222222222'
T = '33333333-3333-4333-8333-333333333333'


def test_le_drapeau_est_eteint_par_defaut():
    assert config.FERMER_JALONS_AUTO is False


def test_done_ne_ferme_pas_le_jalon_par_defaut():
    commandes = []

    def faux(cmd):
        commandes.append(cmd)
        if cmd == "task status:pending export":
            return ok(json.dumps([{"uuid": T, "tags": ["milestone"], "depends": [S1, S2]}]))
        return ok("Completed 1 task.")

    with patch("main_fastapi.run_task_command", side_effect=faux):
        r = client.post(f"/api/task/{S2}/done")
    assert r.status_code == 200
    assert commandes == [f"task {S2} done"]
    assert not r.json().get("data")
