# CLAUDE.md

Les instructions de ce dépôt sont dans **[AGENTS.md](AGENTS.md)**. Lis-le avant toute modification.

Aucune instruction spécifique à Claude Code ne s'ajoute à ce fichier : tout est dans AGENTS.md,
afin qu'il n'y ait qu'une seule source à maintenir.

Deux points à ne pas découvrir en cours de route :

- **N'exécute jamais de commande Taskwarrior sans `TASKRC` ou `TASKDATA` positionné sur une base
  jetable.** Le backend écrit dans les vraies tâches de l'utilisateur, synchronisées par
  Syncthing sur plusieurs machines. Voir AGENTS.md §3.
- `README.md` et `PROJECT_MEMORY.md` sont périmés : ils décrivent le backend Flask sur le port
  5000. Le backend actuel est FastAPI sur le port 8000. Voir AGENTS.md §7.
