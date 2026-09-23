#!/usr/bin/env python3
"""Lance l'ordonnanceur et republie `plan.json`. E1 du carnet.

## La garantie centrale

**Rien n'est jamais ecrit dans Taskwarrior par ce module.**

L'ordonnanceur n'ecrit que sur demande explicite (`--ecrire-scheduled`,
`--ecrire-due`) ; sans ces drapeaux, il se contente de produire son JSON. La
ligne de commande construite ici ne les porte pas, et un test verifie cette
ligne elle-meme -- sans rien executer, donc sans dependre d'un mock. La base de
l'utilisateur est synchronisee sur trois machines : une ecriture involontaire n'y
serait pas rattrapable depuis ici.

## Pourquoi un sous-processus

L'ordonnanceur vit dans un autre depot, avec son propre `venv` et `ortools`.
Decision du 23/09 : sous-processus avec un chemin **configurable**, pour que les
deux depots restent independants et qu'`ortools` ne rentre pas dans le venv de
l'application web. L'installer comme dependance sera plus propre le jour ou l'on
voudra que le code se reutilise -- c'est au carnet, ce n'est pas pour aujourd'hui.

Le chemin etant configurable, il peut etre faux : c'est verifie avant de lancer,
et un planificateur introuvable se dit au lieu de remonter en trace d'appel.

## Pourquoi une tache de fond

La resolution prend de 30 s a 2 minutes. Un appel HTTP synchrone figerait
l'interface et pourrait etre coupe par un navigateur ou un proxy avant la fin.
L'appel rend donc la main tout de suite, et l'etat s'interroge.

Un seul calcul a la fois : deux resolutions simultanees ecriraient le meme
fichier en meme temps. Le second appel est refuse, pas mis en file -- on veut le
plan d'aujourd'hui, pas deux fois celui d'il y a dix secondes.
"""
import os
import subprocess
import threading
import time

from config import (PLANIFICATEUR_PYTHON, PLANIFICATEUR_RACINE, PLAN_SORTIE,
                    PLAN_TIMEOUT)

__all__ = ["commande_planification", "lancer", "etat", "attendre",
           "reinitialiser"]

#: Rendus modifiables pour les tests, qui doivent pouvoir simuler un chemin faux.
PYTHON = PLANIFICATEUR_PYTHON
RACINE = PLANIFICATEUR_RACINE

_verrou = threading.Lock()
_fil = None
_etat = None


def _au_repos():
    return {"statut": "inactif", "message": None, "duree_s": None,
            "fini_a": None}


def reinitialiser():
    """Remet le lanceur au repos. Reserve aux tests."""
    global _etat, _fil
    with _verrou:
        _etat = _au_repos()
        _fil = None


_etat = _au_repos()


def commande_planification(sortie=None):
    """La ligne de commande, isolee pour etre verifiable sans rien executer.

    Aucun drapeau d'ecriture : voir la garantie centrale en tete de module.
    """
    return [PYTHON, "-m", "planif", "--sortie",
            os.path.abspath(sortie or PLAN_SORTIE)]


def _executer(commande, delai):
    """Execute et rend (code, sortie, erreur). Point de substitution des tests."""
    fini = subprocess.run(commande, cwd=RACINE, capture_output=True, text=True,
                          encoding="utf-8", errors="replace", timeout=delai)
    return fini.returncode, fini.stdout, fini.stderr


def _travail(commande, depart):
    global _etat
    try:
        code, _, erreur = _executer(commande, PLAN_TIMEOUT)
        duree = round(time.time() - depart, 1)
        if code == 0:
            _etat = {"statut": "termine", "message": None, "duree_s": duree,
                     "fini_a": time.time()}
        else:
            _etat = {"statut": "echec", "duree_s": duree, "fini_a": time.time(),
                     "message": (erreur or "").strip()
                                or "code de retour {}".format(code)}
    except subprocess.TimeoutExpired:
        _etat = {"statut": "echec", "duree_s": PLAN_TIMEOUT,
                 "fini_a": time.time(),
                 "message": "le calcul a depasse {} s et a ete interrompu ; "
                            "le plan precedent est inchange".format(PLAN_TIMEOUT)}
    except OSError as erreur:
        _etat = {"statut": "echec", "duree_s": None, "fini_a": time.time(),
                 "message": "le planificateur n'a pas pu etre lance : "
                            "{}".format(erreur)}


def _planificateur_absent():
    """Rend un message si le planificateur configure n'est pas la, sinon None."""
    if not os.path.exists(PYTHON):
        return ("planificateur introuvable : aucun interpreteur a « {} ». "
                "Corrigez PLANIFICATEUR_PYTHON.".format(PYTHON))
    if not os.path.isdir(RACINE):
        return ("planificateur introuvable : aucun depot a « {} ». "
                "Corrigez PLANIFICATEUR_RACINE.".format(RACINE))
    return None


def lancer(sortie=None):
    """Demarre un calcul en tache de fond. Rend (accepte, etat_ou_message)."""
    global _fil, _etat

    absent = _planificateur_absent()
    if absent:
        return False, absent

    with _verrou:
        if _etat["statut"] == "en_cours":
            return False, ("un calcul est deja en cours ; attendez qu'il "
                           "finisse avant d'en relancer un")
        _etat = {"statut": "en_cours", "message": None, "duree_s": None,
                 "fini_a": None}
        _fil = threading.Thread(
            target=_travail, args=(commande_planification(sortie), time.time()),
            daemon=True)
        _fil.start()

    return True, dict(_etat)


def etat():
    return dict(_etat)


def attendre(secondes=None):
    """Attend la fin du calcul en cours. Reserve aux tests."""
    fil = _fil
    if fil is not None:
        fil.join(secondes)
    return etat()
