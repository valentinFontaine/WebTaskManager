"""
Configuration settings for the TaskWarrior Web UI
"""

import os
import sys

# Developer mode settings
# Automatically enable in test environments to prevent production database modifications
# Can be explicitly set via DEVELOPER_MODE environment variable
if 'pytest' in sys.modules or any(arg.startswith(('pytest', '-m')) for arg in sys.argv):
    DEVELOPER_MODE = True
else:
    DEVELOPER_MODE = os.environ.get('DEVELOPER_MODE', 'false').lower() == 'true'
DEBUG_FILE = 'command.debug'

# Delai maximal d'une commande TaskWarrior, en secondes.
# Sans ce garde-fou, un hook qui attend une saisie au terminal bloque la requete
# indefiniment : le serveur n'a aucun moyen de repondre a ce hook, et le client
# attend pour rien. Mieux vaut une erreur explicite au bout de 15 s.
TASK_TIMEOUT = 15

# Colonnes du tableau Kanban, de gauche a droite.
# Ces valeurs sont celles attendues dans l'UDA `state` des taches ; une tache
# dont l'etat est vide ou inconnu apparait dans une colonne "Sans etat".
# Declarer l'UDA dans le taskrc, sinon TaskWarrior ignore le champ :
#   uda.state.type=string
#   uda.state.label=State
KANBAN_COLUMNS = ['backlog', 'todo', 'doing', 'review', 'done']

# Duree d'affichage des notifications du frontend, en millisecondes.
# 0 desactive la disparition automatique : la notification porte alors une croix.
NOTIFICATION_TIMEOUT = 3000

# Duree de vie du cache de la liste des contextes, en secondes.
# `task _show` est couteux et la liste des contextes ne bouge quasiment jamais.
CONTEXT_CACHE_TTL = 30


# --- Ordonnanceur (depot voisin) -----------------------------------------
# Decision du 23/09/2026 : sous-processus plutot qu'import, avec un chemin
# CONFIGURABLE et non une constante. Les deux depots restent independants et
# ortools ne rentre pas dans le venv de l'application web. L'installer comme
# dependance sera plus propre le jour ou l'on voudra reutiliser le code ; c'est
# note au carnet (RESTE-A-FAIRE.md).
_RACINE = os.path.dirname(os.path.abspath(__file__))

PLANIFICATEUR_RACINE = os.environ.get(
    'PLANIFICATEUR_RACINE',
    os.path.normpath(os.path.join(_RACINE, '..', 'TaskWarriorPlanner')))

PLANIFICATEUR_PYTHON = os.environ.get(
    'PLANIFICATEUR_PYTHON',
    os.path.join(PLANIFICATEUR_RACINE, 'venv', 'Scripts', 'python.exe'))

#: Ou l'ordonnanceur ecrit son plan : c'est l'URL que calendar-planner.js
#: demande (`/plan.json`), servie par la route catch-all.
PLAN_SORTIE = os.path.join(_RACINE, 'plan.json')

#: Plafond large : une resolution prend 30 s a 2 min, mais un horizon etendu ou
#: une machine chargee peuvent aller plus loin. Au-dela, on interrompt et on le
#: dit -- le plan precedent reste en place.
PLAN_TIMEOUT = 600
