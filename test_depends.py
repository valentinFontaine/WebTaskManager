#!/usr/bin/env python3
"""
Contrat de test pour POST /api/task/{uuid}/depends (edition des dependances
depuis le graphe). Route et implementation NON ECRITES a la date de ce
fichier : ces tests doivent echouer AVANT l'implementation, avec un 404
(route absente), pas avec une erreur de mock ou d'import.

Forme de run_task_command (mesuree dans main_fastapi.py) : la fonction NE
renvoie PAS un tuple, elle renvoie une instance du modele pydantic
CommandResult (fastapi_models.py), avec quatre champs :
    success   : bool   (True si returncode == 0)
    stdout    : str
    stderr    : str
    returncode: int
Les tests mockent donc 'main_fastapi.run_task_command' pour qu'il renvoie
directement des CommandResult(...), comme le fait test_fastapi.py et
test_graphe.py -- jamais un objet subprocess.CompletedProcess brut.

Faits Taskwarrior 3.5 mesures sur base jetable, traites comme la verite (voir
le prompt d'origine, non duplique ici en detail) :
    task <uuid> modify depends:X        ajoute X (n'ecrase pas la liste)
    task <uuid> modify depends:-X       retire X
    task <uuid> modify depends:X,-Y     ajout et retrait en une commande
    depends:+X                          REFUSE par Taskwarrior
    cycle (direct ou indirect)          returncode 2, stderr contient
                                         "Circular dependency detected and disallowed."

Choix documente : un cycle detecte par Taskwarrior est traduit en 409, avec
un message lisible en francais mentionnant la dependance circulaire. 409
(Conflict) plutot que 400 : la requete est syntaxiquement valide, c'est
l'etat du graphe de dependances qui rend l'operation impossible.

{uuid} dans le chemin est la tache DEPENDANTE (celle qui porte le depends).
"""

import re
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import main_fastapi
from main_fastapi import app
from fastapi_models import CommandResult

client = TestClient(app)


# --- Identifiants de test ---------------------------------------------------

TACHE = "11111111-1111-1111-1111-111111111111"
DEP_X = "22222222-2222-2222-2222-222222222222"
DEP_Y = "33333333-3333-3333-3333-333333333333"

UUID_CANONIQUE_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)


def _est_uuid_canonique(valeur):
    return bool(UUID_CANONIQUE_RE.match(valeur))


# Verification de coherence des fixtures elles-memes : si ces identifiants ne
# sont plus des uuid canoniques (faute de frappe future), les tests de
# securite deviendraient trivialement vrais pour de mauvaises raisons.
for _u in (TACHE, DEP_X, DEP_Y):
    assert _est_uuid_canonique(_u)


def _forme_commande(commande):
    """Extrait (uuid_tache, valeur_depends) d'une commande Taskwarrior de la
    forme 'task [rc.xxx=yyy ...] <uuid> modify depends:<valeur>'.

    Renvoie None si la commande ne correspond pas a cette forme -- notamment
    si elle contient un '+' (refuse par Taskwarrior pour depends).
    """
    m = re.match(
        r"^task(?:\s+rc\.[\w.]+=\S+)*\s+"
        r"([0-9a-f-]+)\s+modify\s+depends:(\S+)$",
        commande.strip(),
    )
    if not m:
        return None
    return m.group(1), m.group(2)


def _poster(ajouter=None, retirer=None, tache=TACHE):
    corps = {"ajouter": ajouter or [], "retirer": retirer or []}
    # Encode l'identifiant comme le ferait un vrai client : httpx refuse un
    # caractere de controle brut dans une URL, et la requete n'atteindrait
    # jamais le serveur (faux rouge). Le serveur decode %0A en saut de ligne.
    from urllib.parse import quote
    return client.post(f"/api/task/{quote(tache, safe='')}/depends", json=corps)


# --- 1. Ajout d'un seul uuid -------------------------------------------------

class TestAjoutUnique:
    @pytest.fixture(autouse=True)
    def mock(self):
        with patch("main_fastapi.run_task_command") as m:
            m.return_value = CommandResult(success=True, stdout="Modified 1 task.", stderr="", returncode=0)
            yield m

    def test_une_seule_commande_forme_attendue(self, mock):
        reponse = _poster(ajouter=[DEP_X])

        assert mock.call_count == 1
        commande = mock.call_args_list[0][0][0]
        forme = _forme_commande(commande)
        assert forme is not None, f"commande inattendue : {commande!r}"
        uuid_tache, valeur = forme
        assert uuid_tache == TACHE
        assert valeur == DEP_X
        assert "+" not in commande


# --- 2. Ajout de plusieurs (selection multiple -> fleche) -------------------

class TestAjoutMultiple:
    @pytest.fixture(autouse=True)
    def mock(self):
        with patch("main_fastapi.run_task_command") as m:
            m.return_value = CommandResult(success=True, stdout="Modified 1 task.", stderr="", returncode=0)
            yield m

    def test_une_seule_commande_depends_liste_virgules(self, mock):
        _poster(ajouter=[DEP_X, DEP_Y])

        assert mock.call_count == 1
        commande = mock.call_args_list[0][0][0]
        forme = _forme_commande(commande)
        assert forme is not None, f"commande inattendue : {commande!r}"
        _, valeur = forme
        assert valeur == f"{DEP_X},{DEP_Y}"


# --- 3. Retrait, puis ajout + retrait combines -------------------------------

class TestRetraitEtCombinaison:
    @pytest.fixture(autouse=True)
    def mock(self):
        with patch("main_fastapi.run_task_command") as m:
            m.return_value = CommandResult(success=True, stdout="Modified 1 task.", stderr="", returncode=0)
            yield m

    def test_retrait_seul(self, mock):
        _poster(retirer=[DEP_X])

        assert mock.call_count == 1
        commande = mock.call_args_list[0][0][0]
        forme = _forme_commande(commande)
        assert forme is not None, f"commande inattendue : {commande!r}"
        _, valeur = forme
        assert valeur == f"-{DEP_X}"

    def test_ajout_et_retrait_en_une_commande(self, mock):
        _poster(ajouter=[DEP_X], retirer=[DEP_Y])

        assert mock.call_count == 1
        commande = mock.call_args_list[0][0][0]
        forme = _forme_commande(commande)
        assert forme is not None, f"commande inattendue : {commande!r}"
        _, valeur = forme
        assert valeur == f"{DEP_X},-{DEP_Y}"


# --- 4. Securite : shell=True, tout identifiant doit etre un uuid canonique -

IDENTIFIANTS_MALVEILLANTS = [
    "abc",
    TACHE + "; del x",
    TACHE + "$(rm -rf /)",
    TACHE + " x",
    '"' + TACHE + '"',
    "+" + DEP_X,
    "-" + DEP_X,
    # En Python, `$` d'une expression reguliere accepte un saut de ligne final :
    # re.match(r"^...$", uuid + "\n") reussit. Un saut de ligne dans une
    # commande passee au shell peut en separer deux.
    TACHE + "\n",
    TACHE + "\ndel x",
]


class TestSecuriteIdentifiants:
    @pytest.fixture(autouse=True)
    def mock(self):
        with patch("main_fastapi.run_task_command") as m:
            m.return_value = CommandResult(success=True, stdout="", stderr="", returncode=0)
            yield m

    @pytest.mark.parametrize("mauvais", IDENTIFIANTS_MALVEILLANTS)
    def test_identifiant_invalide_dans_le_chemin(self, mock, mauvais):
        reponse = _poster(ajouter=[DEP_X], tache=mauvais)

        # Dans le chemin, un identifiant a saut de ligne ne correspond meme pas
        # a la route (404) : c'est un refus aussi sur. La propriete gardee est
        # "refuse, et aucune commande", pas un code precis.
        assert not (200 <= reponse.status_code < 300), reponse.text
        assert mock.call_count == 0

    @pytest.mark.parametrize("mauvais", IDENTIFIANTS_MALVEILLANTS)
    def test_identifiant_invalide_dans_ajouter(self, mock, mauvais):
        reponse = _poster(ajouter=[mauvais])

        assert reponse.status_code in (400, 422), reponse.text
        assert mock.call_count == 0

    @pytest.mark.parametrize("mauvais", IDENTIFIANTS_MALVEILLANTS)
    def test_identifiant_invalide_dans_retirer(self, mock, mauvais):
        reponse = _poster(retirer=[mauvais])

        assert reponse.status_code in (400, 422), reponse.text
        assert mock.call_count == 0


# --- 5. Listes vides des deux cotes ------------------------------------------

class TestListesVides:
    @pytest.fixture(autouse=True)
    def mock(self):
        with patch("main_fastapi.run_task_command") as m:
            m.return_value = CommandResult(success=True, stdout="", stderr="", returncode=0)
            yield m

    def test_rien_a_faire_rejete(self, mock):
        reponse = _poster(ajouter=[], retirer=[])

        assert reponse.status_code == 400, reponse.text
        assert mock.call_count == 0


# --- 6. Auto-dependance -------------------------------------------------------

class TestAutoDependance:
    @pytest.fixture(autouse=True)
    def mock(self):
        with patch("main_fastapi.run_task_command") as m:
            m.return_value = CommandResult(success=True, stdout="", stderr="", returncode=0)
            yield m

    def test_une_tache_ne_peut_pas_dependre_d_elle_meme(self, mock):
        reponse = _poster(ajouter=[TACHE], tache=TACHE)

        assert reponse.status_code == 400, reponse.text
        assert mock.call_count == 0


# --- 7. Taskwarrior refuse un cycle ------------------------------------------

class TestCycleRefuse:
    def test_cycle_detecte_par_taskwarrior_donne_409_message_lisible(self):
        with patch("main_fastapi.run_task_command") as mock:
            mock.return_value = CommandResult(
                success=False,
                stdout="",
                stderr="Circular dependency detected and disallowed.",
                returncode=2,
            )
            reponse = _poster(ajouter=[DEP_X])

        assert reponse.status_code == 409, reponse.text
        corps = reponse.text.lower()
        assert "circulaire" in corps


# --- 8. Autre echec Taskwarrior (non cycle) ----------------------------------

class TestAutreEchecTaskwarrior:
    def test_echec_non_cycle_remonte_le_message_sans_500(self):
        with patch("main_fastapi.run_task_command") as mock:
            mock.return_value = CommandResult(
                success=False,
                stdout="",
                stderr="Task does not exist.",
                returncode=1,
            )
            reponse = _poster(ajouter=[DEP_X])

        assert reponse.status_code >= 400
        assert reponse.status_code != 500
        assert reponse.status_code not in (200, 201, 204)
        assert "Task does not exist." in reponse.text


# --- 9. Succes ----------------------------------------------------------------

class TestSucces:
    def test_succes_200_corps_indique_le_succes(self):
        with patch("main_fastapi.run_task_command") as mock:
            mock.return_value = CommandResult(success=True, stdout="Modified 1 task.", stderr="", returncode=0)
            reponse = _poster(ajouter=[DEP_X])

        assert reponse.status_code == 200, reponse.text
        donnees = reponse.json()
        assert donnees.get("success") is True
