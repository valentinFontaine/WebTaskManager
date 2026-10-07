#!/usr/bin/env python3
"""
Contrat du decoupage (split) d'une tache : POST /api/task/{uuid}/split.

Modele arrete le 2026-10-07 (NOTES.md, docs/tags.md) :
- la tache decoupee garde son uuid, prend +milestone, son estTime passe a
  30min (temps symbolique : TaskWarriorPlanner n'a pas a connaitre le tag) et
  ne depend plus que de ses sous-taches ; ses successeurs ne sont pas touches ;
- les sous-taches reprennent les depends d'origine, le projet, les tags (sauf
  +fixed et +milestone) et la due ; chacune a son propre estTime ;
- sous-projet optionnel : sous-taches dans Projet.Sous, jalon dans Projet ;
  un nom deja pris est refuse (409) ;
- apparier_a : la sous-tache depend de la sous-tache designee d'un jalon
  predecesseur, au lieu de ce jalon.

Ordre des commandes : sous-taches d'abord (rien n'en depend encore), puis UNE
seule commande sur le jalon (ajouts et retraits de depends ensemble) ; en cas
d'echec, les sous-taches deja creees sont supprimees et le jalon n'est pas
touche. Le successeur reste donc bloque a chaque instant.

Cloture : POST /done ferme les jalons dont la derniere dependance en attente
vient de se terminer, en cascade.
"""

import json
import re
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import decoupage
from decoupage import ErreurDecoupage
from main_fastapi import app
from fastapi_models import CommandResult

client = TestClient(app)

T = "11111111-1111-1111-1111-111111111111"   # tache a decouper
P1 = "22222222-2222-2222-2222-222222222222"  # predecesseur ordinaire
J = "33333333-3333-3333-3333-333333333333"   # predecesseur jalon
JA = "44444444-4444-4444-4444-444444444444"  # sous-tache A du jalon J
JB = "55555555-5555-5555-5555-555555555555"  # sous-tache B du jalon J
S1 = "66666666-6666-6666-6666-666666666666"  # sous-taches creees
S2 = "77777777-7777-7777-7777-777777777777"
S3 = "88888888-8888-8888-8888-888888888888"


def tache(**champs):
    base = {
        "uuid": T, "status": "pending", "description": "Plans",
        "project": "Pompe", "tags": ["committed", "fixed"],
        "due": "20261030T170000Z", "estTime": "PT6H", "depends": [P1],
    }
    base.update(champs)
    return base


def st(description, estTime=None, apparier_a=None):
    return {"description": description, "estTime": estTime, "apparier_a": apparier_a}


# --- Logique pure : preparer_decoupage ---------------------------------------

class TestHeritage:
    def test_champs_herites(self):
        plan = decoupage.preparer_decoupage(
            tache(), [st("Plan APM", "2h"), st("Plan GPM", "1h30")], None, {}, [])
        assert len(plan) == 2
        a, b = plan
        assert a["description"] == "Plan APM"
        assert a["project"] == "Pompe"
        assert a["due"] == "20261030T170000Z"
        assert a["depends"] == [P1]
        assert a["estTime"] == "2h"
        # 1h30 est reecrit sous la seule forme composee acceptee
        assert b["estTime"] == "1h+30min"

    def test_tag_fixed_non_herite(self):
        plan = decoupage.preparer_decoupage(
            tache(tags=["committed", "fixed", "quick"]),
            [st("a"), st("b")], None, {}, [])
        assert plan[0]["tags"] == ["committed", "quick"]

    def test_sans_projet_ni_due_ni_depends(self):
        t = tache(depends=None, tags=None)
        del t["project"], t["due"]
        plan = decoupage.preparer_decoupage(t, [st("a"), st("b")], None, {}, [])
        assert plan[0]["project"] is None
        assert plan[0]["due"] is None
        assert plan[0]["depends"] == []
        assert plan[0]["tags"] == []

    def test_depends_chaine_taskwarrior2(self):
        plan = decoupage.preparer_decoupage(
            tache(depends=f"{P1},{J}"), [st("a"), st("b")], None, {}, [])
        assert plan[0]["depends"] == [P1, J]


class TestSousProjet:
    def test_sous_projet(self):
        plan = decoupage.preparer_decoupage(
            tache(), [st("a"), st("b")], "Plans", {}, ["Pompe", "Autre"])
        assert all(s["project"] == "Pompe.Plans" for s in plan)

    def test_nom_pris_409(self):
        with pytest.raises(ErreurDecoupage) as e:
            decoupage.preparer_decoupage(
                tache(), [st("a"), st("b")], "Plans", {}, ["Pompe", "Pompe.Plans"])
        assert e.value.status == 409

    def test_nom_pris_casse_differente_409(self):
        with pytest.raises(ErreurDecoupage) as e:
            decoupage.preparer_decoupage(
                tache(), [st("a"), st("b")], "plans", {}, ["Pompe.Plans"])
        assert e.value.status == 409

    @pytest.mark.parametrize("nom", ["", "a.b", "a b", 'a"b', "a&b"])
    def test_nom_invalide_400(self, nom):
        with pytest.raises(ErreurDecoupage) as e:
            decoupage.preparer_decoupage(tache(), [st("a"), st("b")], nom, {}, [])
        assert e.value.status == 400

    def test_sous_projet_sans_projet_400(self):
        t = tache()
        del t["project"]
        with pytest.raises(ErreurDecoupage) as e:
            decoupage.preparer_decoupage(t, [st("a"), st("b")], "Plans", {}, [])
        assert e.value.status == 400

    def test_nom_libre(self):
        assert decoupage.nom_sous_projet_libre("Pompe", "Plans", ["Pompe"]) == "Plans"
        assert decoupage.nom_sous_projet_libre(
            "Pompe", "Plans", ["Pompe.Plans", "Pompe.Plans-2"]) == "Plans-3"


class TestApparier:
    def predecesseurs(self):
        return {J: {"uuid": J, "status": "pending", "tags": ["milestone"], "depends": [JA, JB]},
                P1: {"uuid": P1, "status": "pending", "tags": [], "depends": []}}

    def test_remplace_le_jalon_par_la_sous_tache(self):
        plan = decoupage.preparer_decoupage(
            tache(depends=[P1, J]),
            [st("Consulter APM", apparier_a=JA), st("Consulter GPM", apparier_a=JB), st("Synthese")],
            None, self.predecesseurs(), [])
        assert plan[0]["depends"] == [P1, JA]
        assert plan[1]["depends"] == [P1, JB]
        assert plan[2]["depends"] == [P1, J]

    def test_hors_jalon_predecesseur_400(self):
        with pytest.raises(ErreurDecoupage) as e:
            decoupage.preparer_decoupage(
                tache(depends=[P1, J]), [st("a", apparier_a=S3), st("b")],
                None, self.predecesseurs(), [])
        assert e.value.status == 400

    def test_uuid_non_canonique_400(self):
        with pytest.raises(ErreurDecoupage) as e:
            decoupage.preparer_decoupage(
                tache(depends=[P1, J]), [st("a", apparier_a=JA + " && del"), st("b")],
                None, self.predecesseurs(), [])
        assert e.value.status == 400


class TestRefus:
    @pytest.mark.parametrize("champs", [
        {"status": "completed"}, {"status": "deleted"},
        {"tags": ["milestone"]}, {"recur": "weekly"}, {"parent": S3},
    ])
    def test_tache_non_decoupable_409(self, champs):
        with pytest.raises(ErreurDecoupage) as e:
            decoupage.preparer_decoupage(tache(**champs), [st("a"), st("b")], None, {}, [])
        assert e.value.status == 409

    def test_moins_de_deux_sous_taches_400(self):
        with pytest.raises(ErreurDecoupage) as e:
            decoupage.preparer_decoupage(tache(), [st("a")], None, {}, [])
        assert e.value.status == 400

    @pytest.mark.parametrize("desc", ["", "   ", 'avec "guillemet"'])
    def test_description_invalide_400(self, desc):
        with pytest.raises(ErreurDecoupage) as e:
            decoupage.preparer_decoupage(tache(), [st(desc), st("b")], None, {}, [])
        assert e.value.status == 400

    def test_esttime_injection_400(self):
        with pytest.raises(ErreurDecoupage) as e:
            decoupage.preparer_decoupage(tache(), [st("a", "2h & del x"), st("b")], None, {}, [])
        assert e.value.status == 400


# --- Logique pure : commandes -------------------------------------------------

class TestCommandes:
    def test_commande_ajout(self):
        cmd = decoupage.commande_ajout({
            "description": "Plan APM", "project": "Pompe.Plans", "tags": ["committed"],
            "due": "20261030T170000Z", "estTime": "2h", "depends": [P1, JA],
        })
        assert cmd == (f'task add "Plan APM" project:Pompe.Plans +committed '
                       f'due:20261030T170000Z estTime:2h depends:{P1},{JA}')

    def test_commande_ajout_minimale(self):
        cmd = decoupage.commande_ajout({
            "description": "a", "project": None, "tags": [], "due": None,
            "estTime": None, "depends": [],
        })
        assert cmd == 'task add "a"'

    def test_commande_jalon_une_seule_commande(self):
        cmd = decoupage.commande_jalon(T, [P1, J], [S1, S2])
        assert cmd == (f'task rc.confirmation=off {T} modify +milestone estTime:30min '
                       f'depends:{S1},{S2},-{P1},-{J}')

    def test_commande_jalon_sans_ancien_depends(self):
        cmd = decoupage.commande_jalon(T, [], [S1, S2])
        assert cmd.endswith(f'depends:{S1},{S2}')


# --- Logique pure : cloture ---------------------------------------------------

class TestJalonsAFermer:
    def test_derniere_sous_tache(self):
        pending = [{"uuid": T, "tags": ["milestone"], "depends": [S1, S2]}]
        assert decoupage.jalons_a_fermer(S2, pending) == [T]

    def test_sous_tache_encore_en_attente(self):
        pending = [{"uuid": T, "tags": ["milestone"], "depends": [S1, S2]},
                   {"uuid": S1, "tags": [], "depends": []}]
        assert decoupage.jalons_a_fermer(S2, pending) == []

    def test_tache_ordinaire_jamais_fermee(self):
        pending = [{"uuid": T, "tags": [], "depends": [S2]}]
        assert decoupage.jalons_a_fermer(S2, pending) == []

    def test_jalon_sans_lien_avec_la_tache_terminee(self):
        pending = [{"uuid": T, "tags": ["milestone"], "depends": [S1]}]
        assert decoupage.jalons_a_fermer(S2, pending) == []

    def test_cascade(self):
        # J a ete decoupe, puis sa sous-tache JA aussi (JA est un jalon de S1)
        pending = [{"uuid": J, "tags": ["milestone"], "depends": [JA, JB]},
                   {"uuid": JA, "tags": ["milestone"], "depends": [S1]}]
        assert decoupage.jalons_a_fermer(S1, pending) == [JA, J]


# --- Endpoint mocke -------------------------------------------------------------

def ok(stdout=""):
    return CommandResult(success=True, stdout=stdout, stderr="", returncode=0)


def ko(stderr="erreur"):
    return CommandResult(success=False, stdout="", stderr=stderr, returncode=2)


class FauxTaskwarrior:
    """Rejoue les commandes du split ; `echecs` : prefixes de commande qui echouent."""

    def __init__(self, t, predecesseurs=(), projets=("Pompe",), echecs=()):
        self.t = t
        self.predecesseurs = {p["uuid"]: p for p in predecesseurs}
        self.projets = list(projets)
        self.echecs = echecs
        self.crees = []
        self.a_creer = [S1, S2, S3]
        self.commandes = []

    def __call__(self, cmd):
        self.commandes.append(cmd)
        for e in self.echecs:
            if re.search(e, cmd):
                return ko("Taskwarrior a refuse")
        if cmd == f"task {T} export":
            return ok(json.dumps([self.t]))
        if cmd == "task _projects":
            return ok("\n".join(self.projets))
        if cmd.startswith("task add "):
            self.crees.append(self.a_creer[len(self.crees)])
            return ok("Created task 9.")
        if cmd == "task +LATEST export":
            desc = re.search(r'add "([^"]*)"', self.commandes[-2]).group(1)
            return ok(json.dumps([{"uuid": self.crees[-1], "description": desc}]))
        m = re.fullmatch(r"task ((?:[0-9a-f-]{36} ?)+) export", cmd)
        if m:
            return ok(json.dumps([self.predecesseurs[u] for u in m.group(1).split()
                                  if u in self.predecesseurs]))
        return ok("Modified 1 task.")


def poster(corps, tache_id=T):
    return client.post(f"/api/task/{tache_id}/split", json=corps)


class TestEndpoint:
    def test_ordre_des_commandes(self):
        faux = FauxTaskwarrior(tache())
        with patch("main_fastapi.run_task_command", side_effect=faux):
            r = poster({"sous_taches": [st("Plan APM", "2h"), st("Plan GPM", "3h")],
                        "sous_projet": "Plans"})
        assert r.status_code == 200, r.text
        assert r.json()["success"] is True
        ecritures = [c for c in faux.commandes if " add " in c or " modify " in c]
        assert ecritures == [
            f'task add "Plan APM" project:Pompe.Plans +committed due:20261030T170000Z estTime:2h depends:{P1}',
            f'task add "Plan GPM" project:Pompe.Plans +committed due:20261030T170000Z estTime:3h depends:{P1}',
            f'task rc.confirmation=off {T} modify +milestone estTime:30min depends:{S1},{S2},-{P1}',
        ]
        assert [t["uuid"] for t in r.json()["tasks"]] == [S1, S2]

    def test_aucune_commande_sur_un_successeur(self):
        faux = FauxTaskwarrior(tache())
        with patch("main_fastapi.run_task_command", side_effect=faux):
            poster({"sous_taches": [st("a"), st("b")], "sous_projet": None})
        modifies = [c for c in faux.commandes if " modify " in c]
        assert len(modifies) == 1 and f" {T} modify " in modifies[0]

    def test_echec_du_jalon_supprime_les_sous_taches(self):
        faux = FauxTaskwarrior(tache(), echecs=[r" modify \+milestone"])
        with patch("main_fastapi.run_task_command", side_effect=faux):
            r = poster({"sous_taches": [st("a"), st("b")], "sous_projet": None})
        assert r.status_code == 400
        assert "Taskwarrior a refuse" in r.json()["detail"]
        suppressions = [c for c in faux.commandes if c.endswith(" delete")]
        assert suppressions == [f"task rc.confirmation=off {S1} delete",
                                f"task rc.confirmation=off {S2} delete"]

    def test_echec_d_une_creation_supprime_les_precedentes(self):
        faux = FauxTaskwarrior(tache(), echecs=[r'add "b"'])
        with patch("main_fastapi.run_task_command", side_effect=faux):
            r = poster({"sous_taches": [st("a"), st("b"), st("c")], "sous_projet": None})
        assert r.status_code == 400
        assert not any(" modify " in c for c in faux.commandes)
        assert [c for c in faux.commandes if c.endswith(" delete")] == [
            f"task rc.confirmation=off {S1} delete"]

    def test_apparier(self):
        jalon = {"uuid": J, "status": "pending", "tags": ["milestone"], "depends": [JA, JB]}
        faux = FauxTaskwarrior(tache(depends=[P1, J]), predecesseurs=[jalon])
        with patch("main_fastapi.run_task_command", side_effect=faux):
            r = poster({"sous_taches": [st("a", apparier_a=JA), st("b", apparier_a=JB)],
                        "sous_projet": None})
        assert r.status_code == 200, r.text
        ajouts = [c for c in faux.commandes if c.startswith("task add ")]
        assert ajouts[0].endswith(f"depends:{P1},{JA}")
        assert ajouts[1].endswith(f"depends:{P1},{JB}")

    def test_nom_pris_aucune_ecriture(self):
        faux = FauxTaskwarrior(tache(), projets=["Pompe", "Pompe.Plans"])
        with patch("main_fastapi.run_task_command", side_effect=faux):
            r = poster({"sous_taches": [st("a"), st("b")], "sous_projet": "Plans"})
        assert r.status_code == 409
        assert not any(" add " in c or " modify " in c for c in faux.commandes)

    def test_uuid_invalide_400_sans_commande(self):
        with patch("main_fastapi.run_task_command") as m:
            r = poster({"sous_taches": [st("a"), st("b")]}, tache_id="1")
        assert r.status_code == 400
        assert m.call_count == 0

    def test_tache_introuvable_404(self):
        with patch("main_fastapi.run_task_command", return_value=ok("[]")):
            r = poster({"sous_taches": [st("a"), st("b")]})
        assert r.status_code == 404


class TestClotureViaDone:
    def test_done_ferme_le_jalon(self):
        commandes = []

        def faux(cmd):
            commandes.append(cmd)
            if cmd == "task status:pending export":
                return ok(json.dumps([{"uuid": T, "tags": ["milestone"], "depends": [S1, S2]}]))
            return ok("Completed 1 task.")

        with patch("main_fastapi.run_task_command", side_effect=faux):
            r = client.post(f"/api/task/{S2}/done")
        assert r.status_code == 200
        assert commandes[0] == f"task {S2} done"
        assert f"task {T} done" in commandes
        assert r.json()["data"] == {"jalons_fermes": [T]}

    def test_done_par_id_numerique_resout_l_uuid(self):
        commandes = []

        def faux(cmd):
            commandes.append(cmd)
            if cmd == "task 1 _uuids":
                return ok(S2 + "\n")
            if cmd == "task status:pending export":
                return ok(json.dumps([{"uuid": T, "tags": ["milestone"], "depends": [S2]}]))
            return ok("Completed 1 task.")

        with patch("main_fastapi.run_task_command", side_effect=faux):
            r = client.post("/api/task/1/done")
        assert f"task {T} done" in commandes
        assert r.json()["data"] == {"jalons_fermes": [T]}

    def test_echec_du_done_ne_ferme_rien(self):
        with patch("main_fastapi.run_task_command", return_value=ko()) as m:
            r = client.post(f"/api/task/{S2}/done")
        assert r.json()["success"] is False
        assert m.call_count == 1
