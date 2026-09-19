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
