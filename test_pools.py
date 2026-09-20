#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Derivation des pools : une tache n'a pas un pool, elle est candidate a des pools.

Ecrit avant `pools.py`. Ces tests ne lancent aucune commande TaskWarrior : la
correspondance contexte -> UUID leur est fournie, parce que trancher sur un
filtre de contexte est le travail du serveur, pas celui d'un moteur
d'expressions reecrit ici.

Rien de tout ceci n'est branche : `twplanner.py` et `TWCalendar.py` continuent
de lire l'UDA `pool` comme avant.
"""

import pytest

import pools


# Correspondance pool -> UUID retenus, telle que la produirait une requete
# TaskWarrior par contexte.
UUIDS = {
    'pro':   {'u-pro', 'u-les-deux'},
    'perso': {'u-perso', 'u-les-deux', 'u-sport'},
    'asso':  {'u-asso'},
}


def tache(uuid, **extra):
    base = {'uuid': uuid, 'description': 'peu importe', 'status': 'pending'}
    base.update(extra)
    return base


# ── Derivation ──────────────────────────────────────────────────────────────

def test_une_tache_sans_pool_candidat_est_non_planifiable():
    """Le pendant de « pas de duree estimee » : elle n'a nulle part ou aller."""
    orpheline = tache('u-inconnue')
    assert pools.pools_candidats(orpheline, UUIDS) == []
    assert not pools.est_planifiable(orpheline, UUIDS)


def test_une_tache_peut_etre_candidate_a_plusieurs_pools():
    """`+sport` peut relever de perso comme d'asso : les deux sont rendus.

    C'est un progres sur l'UDA `pool`, qui n'en retenait qu'un, choisi a la
    main -- et qui mentait par defaut, `task.pool || 'pro'`.
    """
    assert pools.pools_candidats(tache('u-les-deux'), UUIDS) == ['perso', 'pro']


def test_une_tache_dans_un_seul_contexte_ne_rend_que_celui_la():
    assert pools.pools_candidats(tache('u-asso'), UUIDS) == ['asso']
    assert pools.est_planifiable(tache('u-asso'), UUIDS)


def test_le_champ_pool_explicite_force_le_pool():
    """La porte de sortie : une tache peut etre epinglee a la main.

    `u-perso` n'est candidate qu'a perso par derivation ; `pool:asso` gagne.
    """
    epinglee = tache('u-perso', pool='asso')
    assert pools.pools_candidats(epinglee, UUIDS) == ['asso']


def test_un_pool_explicite_inconnu_est_ignore():
    """Une valeur heritee ou mal tapee ne doit pas rendre la tache orpheline."""
    douteuse = tache('u-perso', pool='sleep')
    assert pools.pools_candidats(douteuse, UUIDS) == ['perso']


def test_le_pool_explicite_est_insensible_a_la_casse_et_aux_espaces():
    assert pools.pools_candidats(tache('u-perso', pool='  ASSO '), UUIDS) == ['asso']


# ── La table des pools ──────────────────────────────────────────────────────

def test_chaque_pool_nomme_un_contexte_et_une_grille():
    assert pools.POOLS, "la table des pools est vide"
    for nom, pool in pools.POOLS.items():
        assert pool.contexte, "%s n'a pas de contexte" % nom
        assert pool.grille, "%s n'a pas de grille hebdomadaire" % nom


def test_la_grille_perso_n_est_pas_vide():
    """Sous ce modele, une grille vide veut dire « jamais disponible ».

    `TWCalendar.get_default_calendars` donnait a perso une grille vide avec le
    commentaire « c'est le reste du temps » -- l'exact contraire de ce qu'elle
    signifie desormais. Ces horaires sont un point de depart, a ajuster.
    """
    perso = pools.POOLS['perso']
    assert perso.grille, "perso n'aurait nulle part ou aller"
    # Du lundi au dimanche : sept jours couverts.
    assert sorted(perso.grille) == list(range(7))


def test_il_n_y_a_plus_de_pool_sleep():
    """La semaine est vide par defaut, les pools y decoupent des plages.

    Ce qu'aucun pool ne couvre est indisponible : un pool « sommeil » n'a donc
    plus rien a representer.
    """
    assert 'sleep' not in pools.POOLS


def test_aucune_plage_ne_deborde_sur_une_autre_du_meme_pool():
    """Deux plages qui se chevauchent feraient compter le temps deux fois."""
    for nom, pool in pools.POOLS.items():
        for jour, plages in pool.grille.items():
            minutes = sorted((pools.en_minutes(p.start_time),
                              pools.en_minutes(p.end_time)) for p in plages)
            for (_, fin), (debut_suivant, _) in zip(minutes, minutes[1:]):
                assert fin <= debut_suivant, (
                    "%s, jour %d : plages qui se chevauchent" % (nom, jour))
            for debut, fin in minutes:
                assert debut < fin, "%s, jour %d : plage vide ou inversee" % (nom, jour)


# ── Construction de la correspondance ───────────────────────────────────────

def test_la_correspondance_passe_le_filtre_de_contexte_tel_quel():
    """Le filtre de contexte n'est pas reinterprete ici : on le passe a `task`.

    Une expression TaskWarrior peut etre `+a or +b`, mais aussi `project:X` ou
    `due.before:eom`. La reecrire en Python ferait echouer en silence tout
    contexte sortant du sous-ensemble supporte.

    Un seul appel par pool **dont le contexte est defini** : `asso` n'en a pas
    ici, il n'est donc pas interroge du tout.
    """
    appels = []

    def faux_exportateur(filtre):
        appels.append(filtre)
        return [{'uuid': 'u-' + filtre}]

    correspondance = pools.charger_uuids_par_pool(
        faux_exportateur, {'pro': '+pro', 'perso': '(+perso or +maison)'})

    assert sorted(appels) == ['(+perso or +maison)', '+pro'], (
        "les filtres doivent arriver intacts a TaskWarrior")
    assert correspondance['pro'] == {'u-+pro'}
    assert correspondance['perso'] == {'u-(+perso or +maison)'}
    assert correspondance['asso'] == set()


def test_un_pool_dont_le_contexte_n_existe_pas_reste_vide():
    """Un pool nommant un contexte absent du taskrc ne doit rien retenir."""
    correspondance = pools.charger_uuids_par_pool(
        lambda filtre: [{'uuid': 'u-x'}], {})
    for nom in pools.POOLS:
        assert correspondance[nom] == set(), (
            "%s a retenu des taches sans contexte defini" % nom)


def test_en_minutes():
    assert pools.en_minutes('00:00') == 0
    assert pools.en_minutes('08:30') == 510
    assert pools.en_minutes('22:00') == 1320
    with pytest.raises(ValueError):
        pools.en_minutes('8h30')
