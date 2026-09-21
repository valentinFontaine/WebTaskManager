# PROJECT_MEMORY.md

## Contexte du projet

### Description courte
WebTaskManager est une interface web responsive pour TaskWarrior, conçue pour fonctionner localement sur desktop (Ubuntu) et mobile (Android avec Termux). Le projet permet de gérer des tâches via une interface graphique intuitive.

### Architecture logique
```
WebTaskManager
├── Backend (Flask)
│   ├── app.py (API Flask)
│   ├── models.py (Modèles de données)
│   └── config.py (Configuration)
├── Frontend (HTML/CSS/JS)
│   ├── index.html (Page principale)
│   ├── day-planner.html (Planificateur quotidien)
│   ├── calendar-planner.html (Planificateur de calendrier)
│   ├── main.js (Logique principale)
│   ├── day-planner.js (Logique du planificateur quotidien)
│   └── calendar-planner.js (Logique du planificateur de calendrier)
├── Tests
│   └── tests/task-manager.spec.js (Tests Playwright)
└── Outils
    ├── twplanner.py (Script Python pour TaskWarrior)
    └── TWCalendar.py (Gestion du calendrier)
```

## Stack & dépendances

### Langages et frameworks
- **Backend**: Python 3 avec Flask (API REST)
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Tests**: Playwright (tests end-to-end)

### Dépendances clés
- **Python**:
  - Flask==2.3.3
  - Flask-CORS==4.0.0
  - tabulate==0.9.0
- **JavaScript**:
  - @toast-ui/calendar==2.1.3
  - @playwright/test==1.55.0

### Gestion des dépendances
- Python: `requirements.txt`
- JavaScript: `package.json`

## Conventions & règles

### Formatage et style
- **Python**: Pas de linter explicite, mais suivre les conventions PEP 8.
- **JavaScript**: Pas de linter explicite, mais utiliser des conventions modernes (ES6+).
- **HTML/CSS**: Pas de conventions strictes, mais garder une structure claire.

### Zones critiques
Les fichiers suivants nécessitent une attention particulière:
- `app.py`: Point d'entrée du backend Flask.
- `models.py`: Modèles de données.
- `main.js`: Logique principale du frontend.
- `tests/task-manager.spec.js`: Tests end-to-end.

## Workflows & scripts

### Commandes de développement
- **Installer les dépendances Python**:
  ```bash
  pip install -r requirements.txt
  ```
- **Installer les dépendances JavaScript**:
  ```bash
  npm install
  ```
- **Lancer le serveur Flask**:
  ```bash
  python app.py
  ```
- **Lancer les tests Playwright**:
  ```bash
  npm test
  ```

### Workflow Git
- **Branches**:
  - `master`: Branche principale.
  - `main`: Branche principale alternative.
- **Commits**: Utiliser des messages clairs et descriptifs.
- **CI**: Pas de CI configuré actuellement.

## Tests & qualité

### Où sont les tests ?
- Les tests sont situés dans `tests/task-manager.spec.js`.

### Comment lancer les tests ?
```bash
npm test
```

### Critères d'acceptation
- Tous les tests doivent passer avant de valider un patch.
- Le code doit être fonctionnel et ne pas introduire de régressions.

## Limitations connues

### Dettes techniques
- Pas de linter ou de formatter configuré.
- Pas de CI/CD configuré.
- Tests limités (un seul fichier de test).

### Bugs majeurs
- Aucun bug majeur connu actuellement.

### TODO majeurs
- Ajouter plus de tests.
- Configurer un linter et un formatter.
- Configurer un CI/CD.

## Glossaire / chemins importants

### Endpoints clés
- `/`: Page principale (index.html)
- `/day-planner.html`: Planificateur quotidien
- `/calendar-planner.html`: Planificateur de calendrier

### Classes/services clés
- `app.py`: Contient l'API Flask.
- `models.py`: Contient les modèles de données.
- `main.js`: Contient la logique principale du frontend.

### Chemins de configuration
- `config.py`: Configuration du backend.
- `package.json`: Configuration des dépendances JavaScript.

### UDA (User Defined Attributes) Taskwarrior utilisés

Le projet utilise les UDA (User Defined Attributes) suivants dans Taskwarrior :

1. **estTime** : Durée estimée de la tâche en minutes
2. **assignee** : Personne à qui la tâche est assignée
3. ~~**pool**~~ : supprimée le 2026-09-21 (voir AGENTS.md §5)
4. ~~**proposed_scheduled**~~ : supprimée le 2026-09-21 (voir AGENTS.md §5)

Ces UDA sont utilisés dans les fichiers suivants :
- `twplanner.py` : Pour la lecture, le traitement et l'écriture des UDA
- `TWTask.py` : Pour la gestion des tâches avec leurs UDA

Les UDA standards de Taskwarrior utilisés incluent :
- uuid
- description
- project
- depends
- due
- scheduled
- urgency
- status

## Checklists

### Avant d'écrire du code
- [ ] Vérifier que tous les tests passent.
- [ ] Comprendre le contexte et l'architecture du projet.
- [ ] Identifier les zones critiques à ne pas modifier sans validation.

### Avant de valider un patch
- [ ] Tous les tests passent.
- [ ] Le code est fonctionnel et ne introduit pas de régressions.
- [ ] Le code suit les conventions de style.
