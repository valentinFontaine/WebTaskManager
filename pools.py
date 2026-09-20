#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pools : plages horaires reservees, et les taches qui peuvent s'y loger.

Un pool n'est **pas** un attribut de tache. C'est un objet de configuration :

    pool := { nom, grille hebdomadaire, contexte d'eligibilite }

Une tache n'« a » donc pas de pool : elle est **candidate** a tout pool dont
elle satisfait le contexte. Deux consequences, assumees comme des progres :

  - une tache peut etre candidate a plusieurs pools (`+sport` peut relever de
    perso comme d'asso). Le planificateur prendra le premier creneau libre
    parmi eux, la ou l'UDA `pool` n'en retenait qu'un, choisi a la main ;
  - une tache peut n'etre candidate a aucun pool. Elle est alors
    non-planifiable, au meme titre qu'une tache sans duree estimee.

L'UDA `pool` survit comme **surcharge manuelle** : si une tache la porte et que
la valeur designe un pool connu, elle gagne sur la derivation.

Le modele de la semaine a change, et c'est ce qui fait disparaitre `sleep` :
la semaine est **vide par defaut**, et les pools y decoupent des plages. Ce
qu'aucun pool ne couvre est indisponible. Un pool « sommeil » n'a donc plus
rien a representer -- et `perso`, qui avait une grille vide commentee « c'est
le reste du temps », doit au contraire en recevoir une vraie : vide signifie
desormais « jamais disponible ».

RIEN DE CECI N'EST BRANCHE. `twplanner.py` et `TWCalendar.py` continuent de
lire l'UDA `pool` comme avant. Ce module est teste a cote, en attendant l'aval
de l'utilisateur sur les horaires de `perso` et sur le sort de l'UDA.
"""

from dataclasses import dataclass, field
from typing import Callable, Dict, List, Set

from TWTime import TimeSlot

# Jours : 0 = lundi ... 6 = dimanche, comme `datetime.weekday()`.
LUNDI, MARDI, MERCREDI, JEUDI, VENDREDI, SAMEDI, DIMANCHE = range(7)


@dataclass
class Pool:
    """Un nom, une grille hebdomadaire, et le contexte qui dit qui peut y aller."""
    nom: str
    contexte: str
    grille: Dict[int, List[TimeSlot]] = field(default_factory=dict)


def _grille(**par_jour) -> Dict[int, List[TimeSlot]]:
    """Construit une grille a partir de paires (debut, fin) par jour."""
    jours = {'lun': LUNDI, 'mar': MARDI, 'mer': MERCREDI, 'jeu': JEUDI,
             'ven': VENDREDI, 'sam': SAMEDI, 'dim': DIMANCHE}
    return {jours[cle]: [TimeSlot(d, f) for d, f in plages]
            for cle, plages in par_jour.items() if plages}


# Grille de bureau : les mercredis et vendredis s'arretent a 16h.
_PRO_PLEIN = [('08:00', '12:00'), ('14:00', '18:00')]
_PRO_COURT = [('08:00', '12:00'), ('14:00', '16:00')]

# Grille personnelle : les soirees de semaine, et les journees de week-end.
#
# Point de depart, a ajuster par l'utilisateur. Ce qui compte ici est qu'elle
# ne soit pas vide : sous ce modele, vide veut dire « jamais disponible ».
_PERSO_SOIR = [('18:30', '22:00')]
_PERSO_JOUR = [('09:00', '22:00')]

POOLS: Dict[str, Pool] = {
    'pro': Pool('pro', 'pro', _grille(
        lun=_PRO_PLEIN, mar=_PRO_PLEIN, mer=_PRO_COURT,
        jeu=_PRO_PLEIN, ven=_PRO_COURT,
    )),
    'perso': Pool('perso', 'perso', _grille(
        lun=_PERSO_SOIR, mar=_PERSO_SOIR, mer=_PERSO_SOIR,
        jeu=_PERSO_SOIR, ven=_PERSO_SOIR,
        sam=_PERSO_JOUR, dim=_PERSO_JOUR,
    )),
    'asso': Pool('asso', 'asso', _grille(
        mar=[('18:00', '20:00')], mer=[('16:00', '20:00')],
    )),
}


def en_minutes(heure: str) -> int:
    """'08:30' -> 510. Leve sur toute autre forme, plutot que de deviner."""
    parties = heure.split(':')
    if len(parties) != 2:
        raise ValueError("heure attendue au format HH:MM, recue : %r" % heure)
    heures, minutes = (int(p) for p in parties)
    if not (0 <= heures <= 23 and 0 <= minutes <= 59):
        raise ValueError("heure hors bornes : %r" % heure)
    return heures * 60 + minutes


def charger_uuids_par_pool(
    exporter: Callable[[str], List[dict]],
    filtres_de_contexte: Dict[str, str],
) -> Dict[str, Set[str]]:
    """Renvoie {pool: UUID des taches eligibles}.

    `exporter` recoit un filtre TaskWarrior et rend les taches correspondantes.
    Le filtre n'est jamais reinterprete ici : une expression de contexte peut
    etre `+a or +b`, mais aussi `project:X` ou `due.before:eom`. La reecrire en
    Python ferait echouer **en silence** tout contexte sortant du sous-ensemble
    supporte -- exactement le piege evite cote navigateur.

    Un pool dont le contexte n'est pas defini dans le taskrc reste vide : mieux
    vaut un pool sans candidat qu'un pool qui accepte tout.
    """
    par_pool: Dict[str, Set[str]] = {}
    for nom, pool in POOLS.items():
        filtre = filtres_de_contexte.get(pool.contexte)
        if not filtre:
            par_pool[nom] = set()
            continue
        taches = exporter(filtre) or []
        par_pool[nom] = {t['uuid'] for t in taches if t.get('uuid')}
    return par_pool


def pools_candidats(tache: dict, uuids_par_pool: Dict[str, Set[str]]) -> List[str]:
    """Pools ou cette tache peut se loger, par ordre alphabetique.

    Une surcharge manuelle (`pool:asso`) gagne sur la derivation. Une valeur
    inconnue -- heritee, ou mal tapee -- est ignoree plutot que de rendre la
    tache orpheline.
    """
    force = str(tache.get('pool') or '').strip().lower()
    if force in POOLS:
        return [force]

    uuid = tache.get('uuid')
    return sorted(nom for nom, uuids in uuids_par_pool.items() if uuid in uuids)


def est_planifiable(tache: dict, uuids_par_pool: Dict[str, Set[str]]) -> bool:
    """Une tache sans pool candidat n'a nulle part ou aller."""
    return bool(pools_candidats(tache, uuids_par_pool))
