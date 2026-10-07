# NOTES — état au 2026-10-07

Historique des sessions précédentes : `docs/archive/notes-2026-10-07.md`.

## État
- Commits locaux uniquement, rien poussé. Prod du PC (`../WebTaskManager-prod`, :1875) à jour
  jusqu'à `4793af0`, redémarrée, graphe multi-projets et redessin sans flash validés par
  l'utilisateur.
- pytest : 313 verts, 13 ignorés. Playwright `tests/graphe*` : 81/81, `tests/import.spec.js` : 19/19.

## Prochaine session : implémenter le découpage (split) d'une tâche
Conception arrêtée le 2026-10-07 avec l'utilisateur. Rien d'implémenté.

**Modèle : la tâche découpée devient un jalon de fin.**
- Elle garde son UUID et son historique, prend `+milestone`, perd son `estTime` et ne dépend
  plus que de ses sous-tâches. Ses successeurs ne sont **pas modifiés** : ils dépendent
  toujours du même UUID.
- Les sous-tâches reprennent les `depends` d'origine, ainsi que le projet, les tags et la
  `due` ; chacune a son propre `estTime`.
- Pourquoi pas « supprimer puis recréer » : mesuré le 2026-10-07 (base temporaire, binaire du
  PC), une tâche dont le prédécesseur est **supprimé** n'est plus `+BLOCKED` et devient
  `+READY`. Un remplacement non atomique débloquerait la suite sans prévenir.
- Clôture : fermer le jalon automatiquement quand sa dernière sous-tâche est terminée
  (préférence exprimée, à confirmer à l'implémentation).
- Pas de jalon de début (« prepare … ») dans les données : il bloquerait les sous-tâches tant
  qu'on ne l'a pas fermé, et gênerait l'appariement. Le cadre du sous-projet dans le graphe
  joue ce rôle visuellement.
- Pas d'UDA pour le lien parent → enfants : « le jalon et ce dont il dépend » suffit.
  Ne pas utiliser `parent`, qui est réservé par Taskwarrior à la récurrence.
- Appariement : quand on découpe le successeur (« Consulter les pièces »), chaque nouvelle
  sous-tâche dépend par défaut du jalon précédent. Une option « apparier » la relie à la
  sous-tâche correspondante (Consulter APM → Plan APM).
- Le découpage peut se répéter : une sous-tâche peut elle-même devenir un jalon.

**Sous-projet optionnel** (case à cocher dans la fenêtre de découpage, nom proposé et modifiable).
- Les sous-tâches vont dans `Projet.Sous`, mais **le jalon reste dans le projet d'origine**.
  Choix de l'utilisateur : le jalon doit rester visible quand on consulte le projet lui-même
  dans Taskwarrior (`project.is:Projet`), en point de sortie vers la suite. À revoir à
  l'usage : on pourra le ranger dans le sous-projet si cela ne plaît pas.
- Mesuré le 2026-10-07 : `project:Pre` retient `Pre`, `Pre.Plans` **et `Preparation`**
  (simple comparaison du début du texte, sans s'arrêter au point). Seul `project.is:Pre` est
  exact. Le backend (`_dans_projet`) et les filtres JS s'arrêtent au point et ne sont pas
  concernés. Tout filtre `project:` envoyé à Taskwarrior (planificateur, `twplanner.py`) l'est.
- Les sous-projets sont déjà gérés : graphe (cadres imbriqués), liste, filtre de navigation.
  Reste à gérer un nom de sous-projet déjà pris.

**À faire ailleurs** : TaskWarriorPlanner doit ignorer les tâches `+milestone`, qui n'ont pas de
travail propre. `+milestone` est documenté dans `docs/tags.md`.

## Autres points en attente
- Défaut connu, non corrigé : après un import réussi, le bouton reste actif (un second clic
  réimporte le même fichier, sans doublon : mise à jour des mêmes tâches).
- Non vérifié sous Firefox : affichage de l'import, fenêtre de suppression du graphe.
- Piège d'instrument : Node n'est pas dans le PATH des shells de l'agent, et `npx` échoue même
  sous PowerShell. Playwright :
  `$env:Path='C:\Users\irpaui\AppData\Local\node-v24.17.0-win-x64;'+$env:Path` puis
  `node node_modules/@playwright/test/cli.js test …`, avec `TASKRC` sur taskwarrior-dev. Les
  suites du graphe dépassent 60 s : en arrière-plan, sans modifier les fichiers servis pendant
  le run (le serveur les sert en direct : run contaminé).
- Piège d'instrument : svg-pan-zoom applique le zoom à l'image suivante ; lire la
  transformation juste après un clic donne une valeur périmée (`expect.poll`).
- Piège d'instrument : lire l'export Taskwarrior en Python avec `PYTHONUTF8=1`, sinon les
  accents s'affichent en `Ã©` (cp1252) alors que la base est saine.
- Piège de déploiement : après `git merge master` en prod, **redémarrer :1875**. Le frontend
  est servi en direct, pas le Python : une page à jour peut parler à un backend ancien.
- PATH de Node : session dédiée, prompt `PROMPT-node-path.md` (non suivi par git).

## Plus tard (pas les prochaines sessions)
- Stratégie planificateur `+delegation` → `+monitoring` : la tâche `+monitoring` dépend de la
  `+delegation`, mais sa due date dépend de la tâche externe. À concevoir avec l'utilisateur.

## Reste
- Correctif accents **non validé sur staging** : téléphone toujours en panne (2026-10-06).
- `plan.json` dans le worktree de prod : pas encore tout à fait réglé selon l'utilisateur.
- Lot E (boucle planifier / ajuster / valider) : l'utilisateur le teste lui-même, hors session.
- Lot H : graphe jugé satisfaisant. Carnet `../TaskWarriorPlanner/RESTE-A-FAIRE.md` l. 427 note
  « impossible de modifier une tâche depuis le graphe » (25/09) ; `fa32e1d` (bouton Modifier)
  semble l'avoir réglé, carnet non mis à jour : à confirmer. Gantt et chemin critique non faits.
- Récurrences : occurrences en double sur le même `imask` (modèles appeler mamy/maman, message
  ondine/Riri ; probablement plusieurs pairs qui génèrent). Signalé, non traité.
- Graphe niveau 2 (mise à jour sans relayout, autre bibliothèque que Mermaid) : plus tard.
