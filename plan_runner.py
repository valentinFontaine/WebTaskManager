#!/usr/bin/env python3
"""Lance l'ordonnanceur et republie `plan.json`. E1 du carnet.

## La garantie centrale

**Le CALCUL n'ecrit jamais dans Taskwarrior.** Valider, si.

L'ordonnanceur n'ecrit que sur demande explicite (`--ecrire-scheduled`,
`--ecrire-due`, ou `--appliquer`) ; sans ces drapeaux, il se contente de
produire son JSON. La ligne de commande construite par
`commande_planification` (le CALCUL) ne les porte pas, et un test verifie
cette ligne elle-meme -- sans rien executer, donc sans dependre d'un mock. La
base de l'utilisateur est synchronisee sur trois machines : une ecriture
involontaire n'y serait pas rattrapable depuis ici.

Valider (nuit 3, E4) est le seul chemin qui ecrit : il applique **exactement**
le plan affiche (`plan.json`, sans recalcul) via `--appliquer`, jamais
`--ecrire-scheduled` / `--ecrire-due` qui recalculeraient. Voir
`commande_validation` et `valider`.

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

Nuit 3 : si PLANIFICATEUR_CONFIG, PLANIFICATEUR_ECHEANCES ou
PLANIFICATEUR_REUNIONS sont positionnees, la commande passe les options de
chemin correspondantes, pour viser une base de test sans jamais ajouter de
drapeau d'ecriture.
"""
import hashlib
import os
import subprocess
import threading
import time

from config import (PLANIFICATEUR_CONFIG, PLANIFICATEUR_ECHEANCES,
                    PLANIFICATEUR_PYTHON, PLANIFICATEUR_RACINE,
                    PLANIFICATEUR_REUNIONS, PLAN_SORTIE, PLAN_TIMEOUT)

__all__ = ["commande_planification", "commande_validation", "lancer",
           "valider", "etat", "attendre", "reinitialiser", "empreinte",
           "empreinte_du_calcul"]

#: Rendus modifiables pour les tests, qui doivent pouvoir simuler un chemin faux.
PYTHON = PLANIFICATEUR_PYTHON
RACINE = PLANIFICATEUR_RACINE

#: Chemin de sortie par defaut, modifiable par les tests (voir SORTIE dans
#: `commande_planification`/`commande_validation`/`lancer`).
SORTIE = PLAN_SORTIE

_verrou = threading.Lock()
_fil = None
_etat = None
#: Empreinte de la base au moment du calcul dont l'etat est "termine".
#: Reprise par Valider pour verifier que la base n'a pas change depuis.
_empreinte_calcul = None


def _au_repos():
    return {"statut": "inactif", "message": None, "duree_s": None,
            "fini_a": None}


def reinitialiser():
    """Remet le lanceur au repos et oublie l'empreinte. Reserve aux tests."""
    global _etat, _fil, _empreinte_calcul
    with _verrou:
        _etat = _au_repos()
        _fil = None
        _empreinte_calcul = None


_etat = _au_repos()


def empreinte(taches):
    """SHA-256 hex des lignes `uuid|modified`, triees, jointes par `\\n`.

    Sert a detecter si la base a change entre le calcul et la validation.
    Pure : ne lit rien, ne fait qu'assembler ce qu'on lui donne.
    """
    lignes = sorted("{}|{}".format(t.get("uuid"), t.get("modified"))
                    for t in taches)
    return hashlib.sha256("\n".join(lignes).encode("utf-8")).hexdigest()


def empreinte_du_calcul():
    """L'empreinte memorisee au lancement du dernier calcul accepte."""
    return _empreinte_calcul


def commande_planification(sortie=None):
    """La ligne de commande, isolee pour etre verifiable sans rien executer.

    Aucun drapeau d'ecriture : voir la garantie centrale en tete de module.
    `--config`, `--echeances` et `--reunions` ne sont ajoutes que si les
    variables d'environnement correspondantes (PLANIFICATEUR_CONFIG,
    PLANIFICATEUR_ECHEANCES, PLANIFICATEUR_REUNIONS) sont positionnees --
    pour viser une base de test sans changer le comportement par defaut.
    """
    commande = [PYTHON, "-m", "planif", "--sortie",
               os.path.abspath(sortie or SORTIE)]
    for option, chemin in (("--config", PLANIFICATEUR_CONFIG),
                           ("--echeances", PLANIFICATEUR_ECHEANCES),
                           ("--reunions", PLANIFICATEUR_REUNIONS)):
        if chemin:
            commande += [option, os.path.abspath(chemin)]
    return commande


def commande_validation(plan=None):
    """La ligne de commande de Valider : `--appliquer` sur le plan affiche.

    Jamais `--ecrire-scheduled` ni `--ecrire-due`, qui recalculeraient au lieu
    d'appliquer exactement ce que l'interface montre.
    """
    return [PYTHON, "-m", "planif", "--appliquer",
           os.path.abspath(plan or SORTIE)]


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


def lancer(sortie=None, empreinte=None):
    """Demarre un calcul en tache de fond. Rend (accepte, etat_ou_message).

    `empreinte` est celle de la base, prise par l'appelant juste avant
    l'appel (elle doit dater d'avant le calcul, pas d'apres) ; elle est
    memorisee des l'acceptation et rendue ensuite par `empreinte_du_calcul()`,
    pour que Valider puisse verifier que la base n'a pas bouge depuis.
    """
    global _fil, _etat, _empreinte_calcul

    absent = _planificateur_absent()
    if absent:
        return False, absent

    with _verrou:
        if _etat["statut"] in ("en_cours", "validation"):
            return False, ("un calcul ou une validation est deja en cours ; "
                           "attendez qu'il finisse avant d'en relancer un")
        _etat = {"statut": "en_cours", "message": None, "duree_s": None,
                 "fini_a": None}
        _empreinte_calcul = empreinte
        _fil = threading.Thread(
            target=_travail, args=(commande_planification(sortie), time.time()),
            daemon=True)
        _fil.start()

    return True, dict(_etat)


def valider(plan=None):
    """Applique le plan affiche via `--appliquer`. Rend (code, stdout, stderr).

    A la difference du calcul, ecrit reellement dans Taskwarrior -- voir la
    garantie centrale en tete de module. Le temps de l'execution, l'etat
    bascule sur "validation" sous le verrou (un calcul ou une seconde
    validation concurrents sont alors refuses par `lancer`) ; l'etat
    precedent est restaure ensuite, succes ou echec (try/finally). Le statut
    du calcul (par ex. "termine") et son empreinte sont donc inchanges apres
    un Valider.
    """
    global _etat
    with _verrou:
        ancien = _etat
        _etat = dict(_etat, statut="validation")
    try:
        return _executer(commande_validation(plan), PLAN_TIMEOUT)
    finally:
        with _verrou:
            _etat = ancien


def etat():
    return dict(_etat)


def attendre(secondes=None):
    """Attend la fin du calcul en cours. Reserve aux tests."""
    fil = _fil
    if fil is not None:
        fil.join(secondes)
    return etat()
