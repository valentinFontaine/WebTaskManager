# Référence des Métadonnées de Gestion des Tâches

## Table des Matières

1. [Introduction](#introduction)
2. [Métadonnées de Base TaskWarrior](#métadonnées-de-base-taskwarrior)
3. [User Defined Attributes (UDAs)](#user-defined-attributes-udas)
4. [Métadonnées Calculées](#métadonnées-calculées)
5. [Métadonnées Frontend](#métadonnées-frontend)
6. [Métadonnées de Calendrier](#métadonnées-de-calendrier)
7. [Métadonnées de Planification](#métadonnées-de-planification)
8. [Mappage entre Composants](#mappage-entre-composants)
9. [Format des Valeurs](#format-des-valeurs)
10. [Exemples d'Utilisation](#exemples-dutilisation)

---

## Introduction

Ce document sert de référence complète pour toutes les métadonnées utilisées dans le système de gestion des tâches TWPlanner. Il documente les attributs TaskWarrior standard, les User Defined Attributes (UDAs) spécifiques, ainsi que les métadonnées calculées et manipulées par l'application.

**Objectif** : Fournir une source unique de vérité pour les développeurs travaillant sur l'évolution du système.

---

## Métadonnées de Base TaskWarrior

Les attributs standard de TaskWarrior utilisés dans le projet :

| Attribut | Type | Description | Source |
|----------|------|-------------|--------|
| `uuid` | string | Identifiant unique de la tâche | TaskWarrior |
| `description` | string | Description/texte de la tâche | TaskWarrior |
| `project` | string | Projet auquel la tâche appartient | TaskWarrior |
| `status` | string | État de la tâche (`pending`, `completed`, `deleted`, `waiting`, etc.) | TaskWarrior |
| `priority` | string | Priorité (`H`, `M`, `L` ou `high`, `medium`, `low`) | TaskWarrior |
| `due` | date | Date d'échéance de la tâche | TaskWarrior |
| `scheduled` | date | Date de planification (verrou) | TaskWarrior |
| `tags` | array | Liste des tags/étiquettes | TaskWarrior |
| `depends` | array | Liste des UUIDs des tâches dépendantes | TaskWarrior |
| `urgency` | float | Coefficient d'urgence calculé | TaskWarrior |
| `start` | date | Date de début (quand `task start` est exécuté) | TaskWarrior |

---

## User Defined Attributes (UDAs)

Les UDAs définis dans `example_taskrc.txt` pour étendre TaskWarrior :

| UDA | Type | Label | Description | Obligatoire |
|-----|------|-------|-------------|------------|
| `estTime` | duration | estimateTime | Durée estimée pour compléter la tâche (en minutes) | **Oui** (pour la planification) |
| `proposed_scheduled` | date | propScheduled | Date de planification proposée par le planificateur | Non |
| `pool` | string | pool | Catégorie de temps (pro, perso, asso, sleep) | **Oui** |
| `assignee` | string | Assignee | Personne à qui la tâche est assignée | Non (défaut: "default") |

### Configuration TaskWarrior requise

```ini
# Definition des UDA (à ajouter dans ~/.taskrc)
uda.estTime.type=duration
uda.estTime.label=estimateTime
uda.proposed_scheduled.type=date
uda.proposed_scheduled.label=propScheduled
uda.pool.type=string
uda.pool.label=pool
uda.assignee.type=string
uda.assignee.label=Assignee
```

---

## Métadonnées Calculées

Métadonnées calculées par le système et non stockées directement dans TaskWarrior :

| Attribut | Type | Description | Calcul | Source |
|----------|------|-------------|--------|--------|
| `scheduled_lock` | datetime | Date de planification verrouillée (équivalent à `scheduled` TaskWarrior) | Récupéré depuis TaskWarrior | `TWTask.py` |
| `scheduled_due_date` | datetime | Date due calculée pour respecter la planification | Calculé via `get_previous_slot_end()` | `TWTask.py` |
| `critical_due_date` | datetime | Date due critique pour respecter les contraintes de pool | Calculé via `set_critical_due_date()` | `TWTask.py` |
| `est_min` | int | Durée estimée en minutes | Converti depuis `estTime` | `TWTask.py`, `TWTime.py` |
| `proposed_scheduled` | datetime | Créneau libre proposé pour la tâche | Calculé via `get_previous_free_slot()` | `twplanner.py` |

---

## Métadonnées Frontend

Métadonnées utilisées spécifiquement dans l'interface web :

### Dans `main.js` et `task-card.js`

| Attribut | Type | Description | Utilisation |
|----------|------|-------------|------------|
| `currentContext` | string | Contexte actuel (`pro`, `perso`, ou vide) | Filtrage des tâches |
| `currentFilters` | object | Filtres appliqués (projet, tags, etc.) | Filtrage dynamique |

### Dans `day-planner.js`

| Attribut | Type | Description | Utilisation |
|----------|------|-------------|------------|
| `id` | number | Identifiant numérique pour le day-planner | Clé primaire locale |
| `title` | string | Titre de la tâche (équivalent à `description`) | Affichage |
| `scheduledTime` | string | Heure de planification (format HH:MM) | Positionnement dans le timeline |
| `scheduledHour` | int | Heure de début | Calcul de conflit |
| `scheduledMinute` | int | Minute de début | Calcul de conflit |

---

## Métadonnées de Calendrier

Structure des calendriers définis dans `TWCalendar.py` :

### PoolCalendar

| Attribut | Type | Description | Valeurs Possibles |
|----------|------|-------------|------------------|
| `pool_name` | string | Nom du pool de temps | `pro`, `asso`, `sleep`, `perso` |
| `weekly_slots` | dict | Créneaux par jour de la semaine | `{0-6: [TimeSlot(...), ...]}` |

### TimeSlot (dans `TWTime.py`)

| Attribut | Type | Description | Format |
|----------|------|-------------|--------|
| `start_time` | string | Heure de début | `HH:MM` |
| `end_time` | string | Heure de fin | `HH:MM` |

### Calendriers par Défaut

| Pool | Description | Créneaux par Défaut |
|------|-------------|---------------------|
| `sleep` | Temps de sommeil | 00:00-08:00, 22:00-23:59 (tous les jours) |
| `pro` | Temps professionnel | Lundi-Vendredi: 08:00-12:00, 14:00-18:00 (Mercredi/Vendredi: 14:00-16:00) |
| `asso` | Temps associatif | Mardi: 18:00-20:00, Mercredi: 16:00-20:00 |
| `perso` | Temps personnel | Aucun (tout le temps restant) |

---

## Métadonnées de Planification

Métadonnées spécifiques au moteur de planification (`twplanner.py`) :

| Attribut | Type | Description | Algorithme |
|----------|------|-------------|------------|
| `GRANULARITY_MIN` | int | Granularité de split autorisée | 30 minutes |
| `NUDGE_THRESHOLD_MIN` | int | Seuil pour calculer le nudge | 24 heures (1440 min) |
| `CALENDARS_BY_ASSIGNEE` | dict | Calendriers par assignee | `{assignee: {pool: PoolCalendar}}` |
| `occupied_periods` | list | Périodes occupées par des tâches planifiées | Calculé depuis les tâches avec `scheduled` ou `proposed_scheduled` |

---

## Mappage entre Composants

### Backend (Python) → Frontend (JavaScript)

| Python (`TWTask.py`) | API (`app.py`) | JavaScript (`task-editor.js`) | JavaScript (`task-card.js`) |
|---------------------|-----------------|-------------------------------|------------------------------|
| `uuid` | `uuid` | `uuid` | `uuid` |
| `description` | `description` | `description` | `description` |
| `project` | `project` | `project` | N/A |
| `due` | `due` | `due` | `due` |
| `scheduled_lock` | `scheduled` | `scheduled` | `scheduled` |
| `est_min` | `estTime` | `duration` | `estTime` |
| `pool` | `pool` | N/A | `pool` |
| `assignee` | `assignee` | N/A | N/A |
| `priority` | `priority` | `priority` | `priority` |
| `status` | `status` | N/A | N/A (via `start`) |
| `urgency` | `urgency` | N/A | `urgency` |
| `depends` | `depends` | N/A | N/A |
| N/A | `tags` | `tags` | `tags` |

### Day Planner → TaskWarrior

| Day Planner (`day-planner.js`) | TaskWarrior |
|--------------------------------|-------------|
| `id` | `uuid` |
| `title` | `description` |
| `description` | (non utilisé) |
| `duration` | `estTime` |
| `priority` | `priority` |
| `scheduledTime` | `scheduled` |

---

## Format des Valeurs

### Formats de Date

| Format | Exemple | Description | Utilisation |
|--------|---------|-------------|------------|
| TaskWarrior compact | `20251212T180000Z` | UTC, format compact | Stockage TaskWarrior |
| TaskWarrior local | `20251212T180000` | Local, format compact | Stockage TaskWarrior |
| ISO 8601 | `2025-12-12T18:00:00` | Standard international | Export/Import |
| HTML datetime-local | `2025-12-12T18:00` | Pour les inputs HTML | Frontend |
| Affichage français | `12/12/2025` | Format local | UI |

### Formats de Durée

| Format | Exemple | Minutes | Description |
|--------|---------|---------|-------------|
| Heures | `2h` | 120 | 2 heures |
| Minutes | `30min` | 30 | 30 minutes |
| Mixte | `2h30m` | 150 | 2 heures 30 minutes |
| ISO 8601 | `PT2H30M` | 150 | Standard international |
| Simple | `90` | 90 | Minutes directes |
| Jours | `1d` | 1440 | 1 jour (24h) |
| Complexe | `1d 2h 30m` | 1650 | 1 jour + 2h30 |

### Formats de Priorité

| Backend (Python) | Frontend (Letters) | Frontend (Words) | Valeur Numérique |
|------------------|-------------------|------------------|------------------|
| N/A | N/A | `None` | 0 |
| `L` | `L` | `low` | 1 |
| `M` | `M` | `medium` | 2 |
| `H` | `H` | `high` | 3 |

---

## Exemples d'Utilisation

### Exemple 1 : Création d'une Tâche Complète

```json
{
  "uuid": "f5a56957-270f-4d44-baee-469157398656",
  "description": "Finaliser le rapport trimestriel",
  "project": "REPORTING.Q3",
  "status": "pending",
  "priority": "H",
  "due": "20251215T170000Z",
  "scheduled": "20251214T090000Z",
  "tags": ["rapport", "urgent", "pro"],
  "depends": [],
  "urgency": 12.5,
  "uda": {
    "estTime": "PT4H",
    "proposed_scheduled": "20251214T080000Z",
    "pool": "pro",
    "assignee": "john.doe"
  }
}
```

### Exemple 2 : Tâche avec Dépendances

```json
{
  "uuid": "d3805c24-52a3-4cc1-b20f-0518dab2110d",
  "description": "Déployer l'application en production",
  "project": "DEPLOYMENT",
  "status": "pending",
  "priority": "H",
  "due": "20251220T180000Z",
  "tags": ["deploy", "production"],
  "depends": ["a1b2c3d4-5678-90ef-ghij-klmnopqrstuv"],
  "uda": {
    "estTime": "PT1H30M",
    "pool": "pro",
    "assignee": "devops-team"
  }
}
```

### Exemple 3 : Calendrier Pool

```python
# Structure PoolCalendar pour le pool "pro"
pro_calendar = PoolCalendar(
    pool_name="pro",
    weekly_slots={
        0: [TimeSlot("08:00", "12:00"), TimeSlot("14:00", "18:00")],  # Lundi
        1: [TimeSlot("08:00", "12:00"), TimeSlot("14:00", "18:00")],  # Mardi
        2: [TimeSlot("08:00", "12:00"), TimeSlot("14:00", "16:00")],  # Mercredi
        3: [TimeSlot("08:00", "12:00"), TimeSlot("14:00", "18:00")],  # Jeudi
        4: [TimeSlot("08:00", "12:00"), TimeSlot("14:00", "16:00")],  # Vendredi
        5: [],  # Samedi (pas de temps pro)
        6: []   # Dimanche (pas de temps pro)
    }
)
```

### Exemple 4 : Données pour le Frontend (day-planner)

```json
{
  "id": 1234567890,
  "title": "Réunion d'équipe",
  "description": "Point hebdomadaire avec toute l'équipe",
  "duration": 60,
  "priority": "high",
  "tags": ["meeting", "team"],
  "project": "TEAM",
  "due": "2025-12-15T17:00:00",
  "scheduled": "2025-12-15T14:00:00",
  "scheduledTime": "14:00",
  "scheduledHour": 14,
  "scheduledMinute": 0
}
```

---

## Workflow de Planification

```
1. Chargement des tâches depuis TaskWarrior (API: /api/tasks)
   └─> Filtres: status:pending, avec UDAs

2. Calcul des métadonnées calculées
   ├─> scheduled_lock (depuis scheduled)
   ├─> est_min (depuis estTime UDA)
   ├─> scheduled_due_date (calculé via PoolCalendar)
   └─> critical_due_date (calculé via get_previous_slot_end)

3. Recherche de créneaux libres (get_previous_free_slot)
   ├─> Récupère les tâches planifiées pour le pool/assignee
   ├─> Construit occupied_periods
   └─> Trouve un créneau libre avant la date due

4. Proposition de planification (set_proposed_scheduled)
   ├─> Met à jour proposed_scheduled dans TaskWarrior
   └─> Retourne True/False selon succès

5. Validation et application
   ├─> Vérification de la disponibilité du créneau
   └─> Application dans TaskWarrior (option --apply)
```

---

## Bonnes Pratiques

### Nommage des Projets

- Utiliser des noms hiérarchiques avec des points : `DOMAINE.SOUS-DOMAINE`
- Exemples : `TEST.TWPlanner`, `DEPLOYMENT.PRODUCTION`, `REPORTING.Q3`

### Gestion des Pools

- Toujours définir un `pool` pour chaque tâche
- Valeurs standard : `pro`, `perso`, `asso`, `sleep`
- Le pool détermine les créneaux disponibles pour la planification

### Estimation du Temps

- Toujours fournir une `estTime` pour les tâches à planifier
- Utiliser des formats clairs : `2h`, `30min`, `1h30m`
- Éviter les durées > 8h (à diviser en sous-tâches)

### Dépendances

- Utiliser `depends` pour les tâches qui doivent être complétées avant
- Les dépendances sont gérées récursivement par `get_dependencies()`
- Planifier les dépendances AVANT la tâche principale

### Priorités

- `H`/high : Tâches critiques, bloquantes, urgentes
- `M`/medium : Tâches importantes mais pas urgentes
- `L`/low : Tâches de fond, améliorations
- Ne pas surutiliser `H` (max 10-20% des tâches)

---

## Dépannage

### Problèmes courants

| Problème | Cause | Solution |
|----------|-------|----------|
| Tâche non planifiée | `estTime` manquant | Ajouter `estTime` UDA |
| Tâche non trouvée | UUID incorrect | Vérifier avec `task export` |
| Créneau introuvable | Pool incorrect ou calendrier vide | Vérifier `pool` et `CALENDARS_BY_ASSIGNEE` |
| Conflit de dépendance | Dépendance non planifiée | Planifier les dépendances d'abord |
| Erreur de format de date | Format non supporté | Utiliser `20251212T180000Z` ou `2025-12-12T18:00:00` |

### Vérification de la Configuration

```bash
# Vérifier que les UDAs sont configurés
TaskWarrior command: `task config | grep uda`

# Vérifier qu'une tâche a les bons attributs
TaskWarrior command: `task <uuid> export`

# Tester la planification
Python command: `python3 twplanner.py --project TEST.TWPlanner --simulate`
```

---

## Historique des Versions

| Version | Date | Auteur | Changements |
|---------|------|--------|-------------|
| 1.0 | 2026-08-05 | TWPlanner Team | Version initiale |

---

## Contacts

Pour toute question ou suggestion concernant ce document, contacter l'équipe de développement TWPlanner.

**Note** : Ce document doit être mis à jour à chaque ajout ou modification de métadonnées dans le système.
