#!/usr/bin/env python3
"""
Contrat de test pour PUT /api/task/{task_id}/modify vis-a-vis des tags.

Defaut mesure sur Taskwarrior 3.5 (dev-pc, fork wilt00) : le code actuel
(main_fastapi.py, endpoint modify_task, ~ligne 736) efface les tags avec
`task ... modify -TAGS`. Ceci est un NO-OP sous Taskwarrior 3.5 (code retour
0, tags inchanges), puis le code n'ajoute que des `+tag`. Consequence : il
est impossible de retirer un tag depuis l'interface. `task <uuid> modify
-montag` fonctionne, lui, correctement -- c'est donc bien -TAGS le probleme,
pas le mecanisme +/- de Taskwarrior en general.

Mecanisme attendu (S1) : lire les tags actuels de la tache (export), puis
une seule commande modify portant un `-t` pour chaque tag actuel absent de
la liste demandee et un `+t` pour chaque tag demande absent des tags
actuels (avec les autres modifications eventuelles dans la meme commande).
Plus jamais de `-TAGS`.

Forme de run_task_command (mesuree dans main_fastapi.py, cf. test_depends.py
et test_fastapi.py) : ne renvoie pas un tuple, mais une instance du modele
pydantic CommandResult (fastapi_models.py) : success, stdout, stderr,
returncode. Les tests mockent donc 'main_fastapi.run_task_command'.

Forme de l'export d'une tache (mesuree dans main_fastapi.py : get_tasks,
modify_task, figer_tache...) : `task ... export` renvoie sur stdout une
liste JSON d'objets tache, chacun au moins avec id, uuid, description,
status, tags (liste de chaines). C'est cette forme que les mocks d'export
reproduisent ici.

Les tests S1/S2 ne figent PAS le nombre exact d'appels a run_task_command :
l'implementation peut faire un ou plusieurs exports de lecture avant la
commande modify, et un export final pour renvoyer la tache a jour (comme le
fait deja le code actuel). Le mock repond selon la FORME de la commande
recue (contient "modify" ou non), pas selon un rang fixe dans une liste --
sinon un simple changement du nombre d'appels casserait le contrat pour de
mauvaises raisons.
"""

import json
import os
import re
import shutil
import subprocess
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import main_fastapi
from main_fastapi import app
from fastapi_models import CommandResult

client = TestClient(app)


# --- Aides -------------------------------------------------------------

def _est_commande_modify(commande):
    """Une commande modify porte le mot 'modify' isole (pas 'modifier' etc)."""
    return re.search(r'(?:^|\s)modify(?:\s|$)', commande) is not None


def _tokens_tag(commande):
    """Extrait les tokens +tag / -tag ISOLES (entoures d'espaces ou de bord
    de chaine) d'une commande modify. Ignore tout le reste (description:"..."
    par exemple, qui ne commence pas par + ou -)."""
    return set(re.findall(r'(?:(?<=\s)|^)[+-][\w.-]+(?=\s|$)', commande))


def _repondeur_lecture_puis_ecriture(tags_avant, tags_apres, description_apres="Tache",
                                     description_avant=None):
    """Construit un side_effect pour le mock de run_task_command : toute
    commande contenant 'modify' repond par un succes ; toute AUTRE commande
    (un export, forcement) repond avec les tags d'avant tant que la
    modification n'a pas eu lieu, puis les tags d'apres. Permet au test de ne
    pas figer le nombre d'appels exact que fera l'implementation."""
    etat = {"modifiee": False}

    def repondeur(commande):
        if _est_commande_modify(commande):
            etat["modifiee"] = True
            return CommandResult(success=True, stdout="Modified 1 task.", stderr="", returncode=0)
        tags = tags_apres if etat["modifiee"] else tags_avant
        tache = {
            "id": 1,
            "uuid": "11111111-1111-1111-1111-111111111111",
            "description": description_apres if etat["modifiee"] or description_avant is None else description_avant,
            "status": "pending",
            "tags": tags,
        }
        return CommandResult(success=True, stdout=json.dumps([tache]), stderr="", returncode=0)

    return repondeur


# --- S1 : le retrait fonctionne vraiment --------------------------------

class TestS1RetraitDeTag:
    def test_une_seule_commande_modify_porte_le_bon_diff_de_tags(self):
        """Tags actuels : fixed, garde. Tags demandes : garde, neuf.
        Attendu : une seule commande modify, contenant -fixed et +neuf,
        ni +garde ni -garde (tag inchange), et jamais -TAGS."""
        with patch('main_fastapi.run_task_command') as mock_cmd:
            mock_cmd.side_effect = _repondeur_lecture_puis_ecriture(
                tags_avant=["fixed", "garde"],
                tags_apres=["garde", "neuf"],
            )
            reponse = client.put(
                "/api/task/1/modify",
                json={"tags": ["garde", "neuf"]},
            )

        assert reponse.status_code == 200
        commandes = [appel.args[0] for appel in mock_cmd.call_args_list]

        # Plus jamais -TAGS, sous aucune forme.
        assert not any("-TAGS" in c for c in commandes), commandes

        # Une seule commande modify doit porter des tokens +tag/-tag.
        commandes_modify_avec_tags = [
            c for c in commandes if _est_commande_modify(c) and _tokens_tag(c)
        ]
        assert len(commandes_modify_avec_tags) == 1, (
            f"attendu exactement une commande modify portant le diff de tags, "
            f"recu : {commandes_modify_avec_tags!r} (toutes commandes : {commandes!r})"
        )

        tokens = _tokens_tag(commandes_modify_avec_tags[0])
        assert "-fixed" in tokens, f"le tag retire doit apparaitre en -fixed, tokens={tokens}"
        assert "+neuf" in tokens, f"le tag ajoute doit apparaitre en +neuf, tokens={tokens}"
        assert "-garde" not in tokens, f"tag inchange, ne doit pas ressortir : {tokens}"
        assert "+garde" not in tokens, f"tag inchange, ne doit pas ressortir : {tokens}"

    def test_reponse_reflete_les_tags_apres_retrait(self):
        """La tache renvoyee par l'endpoint doit porter les tags apres retrait,
        pas les tags d'avant (preuve que le retrait a bien ete pris en compte,
        pas seulement que la commande a la bonne forme)."""
        with patch('main_fastapi.run_task_command') as mock_cmd:
            mock_cmd.side_effect = _repondeur_lecture_puis_ecriture(
                tags_avant=["fixed"],
                tags_apres=[],
            )
            reponse = client.put("/api/task/1/modify", json={"tags": []})

        assert reponse.status_code == 200
        donnees = reponse.json()
        assert donnees["success"] is True
        assert donnees["task"]["tags"] == []


# --- S2 : tags absent (None) -> aucun -t/+t -----------------------------

class TestS2TagsNonTouches:
    def test_tags_none_ne_produit_aucun_token_de_tag(self):
        """task_data.tags absent (None) : la description seule change. Aucune
        commande ne doit porter de token +tag/-tag, et -TAGS ne doit jamais
        apparaitre."""
        with patch('main_fastapi.run_task_command') as mock_cmd:
            mock_cmd.side_effect = _repondeur_lecture_puis_ecriture(
                tags_avant=["fixed"],
                tags_apres=["fixed"],
                description_apres="Nouvelle description",
                description_avant="Ancienne description",
            )
            reponse = client.put(
                "/api/task/1/modify",
                json={"description": "Nouvelle description"},
            )

        assert reponse.status_code == 200
        commandes = [appel.args[0] for appel in mock_cmd.call_args_list]

        assert not any("-TAGS" in c for c in commandes), commandes
        commandes_modify = [c for c in commandes if _est_commande_modify(c)]
        assert commandes_modify, "aucune commande modify n'a ete emise"
        for c in commandes_modify:
            assert not _tokens_tag(c), f"tags=None ne doit toucher aucun tag, commande={c!r}"


# --- S3 : securite, shell=True --------------------------------------------

TAGS_INVALIDES = ["a b", "x;del", "$(rm)", "a\n", '"q"', "", "+x", "-x"]


class TestS3SecuriteTags:
    @pytest.fixture(autouse=True)
    def mock_jamais_appele(self):
        """Aucune commande ne doit jamais partir pour un tag invalide : le
        mock leve si on l'appelle, pour distinguer un vrai refus en amont
        (400) d'un refus accidentel de Taskwarrior lui-meme."""
        def jamais_appele(commande):
            raise AssertionError(
                f"run_task_command ne doit pas etre appele pour un tag invalide : {commande!r}"
            )
        with patch('main_fastapi.run_task_command') as m:
            m.side_effect = jamais_appele
            yield m

    @pytest.mark.parametrize("tag_invalide", TAGS_INVALIDES)
    def test_tag_invalide_refuse_en_400_avant_toute_commande(self, tag_invalide):
        reponse = client.put(
            "/api/task/1/modify",
            json={"tags": [tag_invalide]},
        )
        assert reponse.status_code == 400, (
            f"tag {tag_invalide!r} aurait du etre refuse en 400, recu "
            f"{reponse.status_code} : {reponse.text}"
        )

    def test_tag_accentue_unicode_est_accepte(self, mock_jamais_appele):
        """fullmatch(r'[\\w.-]+') : \\w est unicode par defaut en Python 3, donc
        un tag accentue comme 'reunion' (avec accent) doit passer -- ce n'est
        pas un tag dangereux, seulement non-ASCII."""
        mock_jamais_appele.side_effect = _repondeur_lecture_puis_ecriture(
            tags_avant=[],
            tags_apres=["réunion"],
        )
        reponse = client.put(
            "/api/task/1/modify",
            json={"tags": ["réunion"]},
        )
        assert reponse.status_code == 200, reponse.text


# --- Integration reelle : un vrai `task`, une base jetable ----------------
#
# Ne tourne que si le binaire `task` est present (dev-pc uniquement en
# pratique -- ce depot n'a pas de dependance Taskwarrior sous pytest sinon).
# Base creee dans tmp_path, jetable a chaque test, jamais dans les vraies
# donnees de l'utilisateur (cf. AGENTS.md §3).
#
# Deux garde-fous locaux, en plus de tmp_path :
# - `_TW_ENV` (main_fastapi.py) est fige une seule fois a l'IMPORT du module
#   (`{**os.environ, 'TW_WEB': '1'}`) : y ecrire apres coup dans os.environ
#   ne le changerait pas. On patche donc directement le dict `_TW_ENV` avec
#   patch.dict, plutot que de tenter de fixer TASKRC avant l'import (fragile :
#   d'autres fichiers de test peuvent importer main_fastapi avant celui-ci).
# - DEVELOPER_MODE vaut toujours True sous pytest (config.py) : sans lever ce
#   drapeau pour la duree du test, run_task_command se contenterait de
#   journaliser la commande sans jamais l'executer.
#
# MESURE, PAS SEULEMENT UN CALCUL : ce test passe DEJA, avant toute
# correction du bug -TAGS. Ce n'est pas que le bug n'existe pas -- la commande
# `task rc.confirmation=off <id> modify -TAGS` est bien un NO-OP en 3.5
# (verifie a la main : "Modified 0 tasks", tags inchanges), et le test
# mocke TestS1RetraitDeTag le montre au niveau des commandes envoyees.
# Mais l'endpoint appelle ENSUITE repair_text_fields() (main_fastapi.py,
# ~ligne 108), concu pour reparer la corruption d'accents Windows sur les
# champs texte -- et son text_field_gaps() compare aussi les tags demandes
# aux tags reellement stockes. En cas d'ecart (exactement le symptome du bug
# -TAGS), il fait un `task import` du payload complet avec les tags forces a
# la valeur demandee, ce qui MASQUE le bug cote reponse HTTP et cote base
# reelle : le tag est bel et bien retire a la fin, mais par ce canal de
# secours, pas par le mecanisme -t/+t vise par ce contrat. D'ou :
# - S1 (mocke) reste la preuve du bug reel, sur la commande envoyee ;
# - ce test d'integration reste vert avant correction : il verifie l'etat
#   final reel, qui se trouve deja correct par ce chemin detourne. Il reste
#   utile comme non-regression une fois S1 corrige (repair_text_fields ne
#   trouvera alors plus d'ecart a reparer, et le resultat restera correct).
@pytest.mark.skipif(shutil.which("task") is None, reason="binaire task absent")
class TestIntegrationRetraitTagReel:
    def test_task_export_confirme_le_retrait_du_tag(self, tmp_path):
        taskdata = tmp_path / "data"
        taskdata.mkdir()
        taskrc = tmp_path / "taskrc"
        taskrc.write_text(f"data.location={taskdata}\n", encoding="utf-8")

        env_reel = {
            **os.environ,
            "TASKRC": str(taskrc),
            "TASKDATA": str(taskdata),
            "TW_WEB": "1",
        }

        creation = subprocess.run(
            'task rc.confirmation=off add "Test retrait tag reel" +fixed +garde',
            shell=True, capture_output=True, text=True, encoding="utf-8", env=env_reel,
        )
        assert creation.returncode == 0, creation.stderr

        # La tache creee est forcement la 1 : base fraiche, vide avant cet ajout.
        avant = subprocess.run(
            "task rc.confirmation=off 1 export",
            shell=True, capture_output=True, text=True, encoding="utf-8", env=env_reel,
        )
        tache_avant = json.loads(avant.stdout)[0]
        assert sorted(tache_avant.get("tags", [])) == ["fixed", "garde"]

        with patch.dict(main_fastapi._TW_ENV, {"TASKRC": str(taskrc), "TASKDATA": str(taskdata)}), \
                patch.object(main_fastapi, "DEVELOPER_MODE", False):
            reponse = client.put("/api/task/1/modify", json={"tags": ["garde"]})

        assert reponse.status_code == 200, reponse.text
        donnees = reponse.json()
        assert donnees["success"] is True, donnees

        apres = subprocess.run(
            "task rc.confirmation=off 1 export",
            shell=True, capture_output=True, text=True, encoding="utf-8", env=env_reel,
        )
        tache_apres = json.loads(apres.stdout)[0]
        # Le point du bug : "fixed" doit avoir vraiment disparu, "garde" rester.
        assert tache_apres.get("tags", []) == ["garde"], (
            f"tags apres modification : {tache_apres.get('tags')!r} -- "
            "'fixed' aurait du etre retire (task modify -TAGS est un NO-OP en 3.5)"
        )
