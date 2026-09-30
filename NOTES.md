# NOTES — état au 2026-09-30

## Fait (commits locaux, rien poussé)
- `1b2b385` : `PUT /modify` ne renvoie plus à Taskwarrior une description inchangée.
  Bug d'origine : changer le projet de « faire Design outillage de montage 12° … integré »
  donnait « Failed to update task » (l'éditeur renvoie toujours la description, task.exe
  échoue sur certains textes non-ASCII → `success:false`, pas de champ `error`).
- `a2fd0a7`, `cf69723`, `b3f608a` : `tests/modifier-champs.spec.js` (édition réelle de chaque
  champ de la modale, page principale) + `tests/modifier-projet.spec.js`. Corrigé : en édition,
  vider priorité / projet / échéance / durée envoyait `null` (= ne pas toucher) → maintenant `''`
  (= effacer). Planification et tags se vidaient déjà.
- État des tests : pytest 244 verts ; Playwright (champs, projet, tags, graphe) 38 verts.
- Lancer Playwright sur la base test : `TASKRC=C:/Users/irpaui/taskwarrior-test/taskrc`,
  `PW_PORT=8123 PW_SERVER_CMD="python -m uvicorn main_fastapi:app --port 8123"` (le :8000 est
  occupé par le serveur de prod du PC — ne pas y toucher).

## Reste : le défaut des accents (prochain sujet)
- Mesuré sur la base test via `POST /api/task/add` (Windows, task.exe fork 3.5.0.6) :
  - « integré » seul → échec (« Unknown error »), aussi « zzz integré », « montage integré »,
    « hydro integré », « avec Test hydro integré ».
  - « Test hydro integré », « essai é fin », « a 1° b é », « montage 12° pour » → OK.
  - « ° » n'est PAS le coupable. 😀 échoue toujours.
  - Imprévisible selon le texte complet : la corruption des arguments non-ASCII par task.exe
    (cf. AGENTS.md §5, `repair_text_fields`) produit parfois un argument que Taskwarrior rejette.
- Décision de l'utilisateur : **pas de contournement par `task import`** (l'intérêt de
  Taskwarrior comme backend est de l'utiliser). Chercher une autre voie : comprendre ce que
  task.exe reçoit réellement (octets/codepage), tester `chcp 65001`, variables d'env,
  passage sans `shell=True`, etc. Mesurer d'abord, sur la base test.
- Connu, non corrigé : modifier une description qui CHANGE et contient ces accents peut
  encore échouer ; `estTime` non validé (`1h30` rejeté).

## Prochaine commande
Reproduire en isolé : créer une tâche « integré » via `TestClient` (TASKRC test,
`DEVELOPER_MODE=false`) et capturer la commande exacte + stderr de task.exe.
Ne pas oublier : redémarrer le serveur :8000 pour prendre les correctifs.
