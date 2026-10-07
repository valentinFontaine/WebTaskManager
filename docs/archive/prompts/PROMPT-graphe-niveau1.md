# Prompt — graphe : redessiner sans flash et sans perdre le zoom (niveau 1)

Lis `NOTES.md` (section « Prochaine session ») et l'en-tête de `graphe.js` avant tout.

## Besoin
Dans `graphe.html`, après chaque modification (créer ou retirer un lien, éditer, supprimer,
ajouter une tâche, changer de bulle Projets ou de filtre nav), le graphe est entièrement vidé,
« Chargement… » s'affiche, puis Mermaid redessine et le zoom/la position reviennent à
« Ajuster ». Je veux :
1. **Pas de flash** : l'ancien graphe reste affiché jusqu'à ce que le nouveau soit prêt, puis on
   remplace d'un coup. « Chargement… » n'apparaît que s'il n'y a encore aucun graphe affiché.
2. **Zoom et position conservés** d'un redessin au suivant (svg-pan-zoom : `getZoom/getPan`
   puis `zoom/pan` après le nouveau rendu). « Ajuster » seulement au tout premier dessin, quand
   la liste des projets choisis change (à discuter : ajouter un projet doit-il réajuster ?), ou
   sur clic du bouton Ajuster.
3. Si le nouveau rendu échoue, l'erreur s'affiche comme aujourd'hui (pas d'ancien graphe trompeur
   laissé sans message).

Hors périmètre : mise à jour partielle sans relayout (Mermaid recalcule tout, des nœuds
peuvent bouger : accepté). Le changement de bibliothèque de rendu sera un autre chantier.

## Points d'appui dans le code
- `graphe.js` : `chargerEtDessiner()` appelle `viderSvg()` et `definirMessage('Chargement...')`
  avant le fetch ; `dessiner()` appelle `viderSvg()` puis `mermaid.render`, `initPanZoom()`,
  `ajusterVue()`. La garde `requeteEnCours` (réponses périmées) doit rester.
- `resetInteractionLiaison()` remet la sélection à zéro à chaque redessin : comportement
  attendu par `tests/graphe-depends.spec.js`, ne pas changer sans le signaler.

## Méthode (AGENTS.md §4)
- Tests d'abord, vus rouges : un spec Playwright qui stubbe `/api/graphe` (voir
  `tests/graphe-projets.spec.js` pour le modèle), zoome (bouton Zoom avant), crée un lien
  (stub `/api/task/*/depends`) et vérifie que le zoom de svg-pan-zoom / la transformation du
  `<g class="svg-pan-zoom_viewport">` est inchangé ; un second où `/api/graphe` est retardé par
  `page.route` (délai explicite) et où l'on vérifie que les nœuds restent visibles pendant le
  rechargement.
- Lancer Playwright (si Node n'est toujours pas dans le PATH) :
  ```
  $env:Path = "C:\Users\irpaui\AppData\Local\node-v24.17.0-win-x64;" + $env:Path
  Remove-Item Env:TASKDATA -ErrorAction SilentlyContinue
  $env:TASKRC = 'C:/Users/irpaui/taskwarrior-dev/taskrc'
  node node_modules/@playwright/test/cli.js test tests/graphe --reporter=line
  ```
  en arrière-plan (plus de 60 s). Ne pas modifier les fichiers servis pendant qu'un run tourne :
  le serveur sert les fichiers en direct, le run serait contaminé.
- État de départ : `tests/graphe*` 77/77 verts, pytest 313 verts / 13 ignorés. Les deux doivent
  le rester. Commit local à la fin, pas de push.
