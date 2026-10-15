# Serveur MCP Taskwarrior : lire, proposer, appliquer et annuler des lots

Statut : spécification validée par l'utilisateur le 2026-10-15, à implémenter.

## Pourquoi

Aujourd'hui, un agent (skill `gestion-taskwarrior`) qui veut écrire dans Taskwarrior :
copie la base de prod, l'audite, écrit un lot JSON à la main, l'essaie sur la copie, puis
l'applique avec `tools/wtm.py appliquer --cible-prod`. Deux problèmes :

1. **Coût pour l'agent** : beaucoup de commandes et de sorties à lire pour des étapes
   mécaniques, donc des tokens dépensés pour rien.
2. **Friction pour l'utilisateur** : le contrôle automatique de Claude Code bloque les commandes
   composées qui visent la prod, et l'utilisateur doit alors copier-coller la commande lui-même.

On veut garder **une petite sécurité** : rien n'est écrit en prod sans un « oui » de
l'utilisateur. Mais ce oui doit se donner dans la conversation, par une confirmation de Claude Code,
sans ligne de commande.

## Principe

Un serveur MCP (stdio, Python) expose cinq fonctions. Il **réutilise `tools/wtm.py`**
(`copier`, `_exporter`, `empreinte`, `anomalies`, `_importer`, `_split`, `appliquer`) ; il n'en
réécrit pas la logique.

La sécurité est partagée en deux :

| Où | Quoi | Pourquoi là |
|---|---|---|
| **Serveur** | Contrôles mécaniques : formats, tags, projet, doublons, base inchangée, sauvegarde, essai sur copie, opérations interdites | Déterministes, impossibles à contourner pour l'agent, et gratuits en tokens |
| **Claude Code** | Décision humaine : `appliquer_lot` et `annuler_lot` sont réglés en « ask » | Le serveur ne peut pas distinguer un accord de l'utilisateur d'un accord fabriqué par l'agent |

## Fonctions

### `lire(projet=None, statut="pending", filtre=None, limite=50)`

Lecture seule de la base cible (`task export`, seule commande permise sur la prod). Rend du
**texte** court, pas l'export brut :
- en-tête : nombre de tâches correspondantes, empreinte courte de la base ;
- une ligne par tâche (au plus `limite`) : uuid court (8), projet, description, tags, `estTime`,
  `due`, `scheduled`, dépendances (uuid courts) ;
- si la limite tronque : « N autres non affichées ».

`filtre` : filtre Taskwarrior passé tel quel (`+jde`, `due.before:2026-11-01`…), sans les mots de
commande (`modify`, `delete`, `done`… refusés).

### `proposer_lot(titre, operations)`

Ne touche pas la base cible. Étapes :
1. **Valider** chaque opération (voir « Opérations » et « Contrôles »).
2. **Essayer** le lot sur une copie jetable (`wtm.copier` vers un dossier temporaire, application,
   vérification de l'effet attendu, suppression de la copie).
3. **Figer** le lot : enregistré, immuable, sous un identifiant court (`L-xxxx`), avec l'empreinte
   de la base cible au moment de la proposition et le hash de son contenu.
4. **Rendre** le résumé au format ci-dessous (texte prêt à afficher ; l'agent le recopie tel quel).

Un lot qui a un **bloquant** n'est pas figé : le résumé liste les bloquants et il n'y a pas d'id.

### `appliquer_lot(id)` (en « ask » dans Claude Code)

1. Refuse si le lot est inconnu, déjà appliqué, ou périmé (plus de 24 h).
2. Refuse si l'empreinte de la base cible a changé depuis la proposition (« la base a changé,
   reproposez le lot »).
3. Sauvegarde (`task export` complet) dans le dossier d'état.
4. Applique, dans l'ordre. En cas d'échec : s'arrête, dit combien d'opérations sont passées, et
   rappelle que `annuler_lot` peut défaire la partie appliquée.
5. Vérifie l'effet (chaque tâche créée existe avec les bons champs, chaque modification est
   présente).
6. Écrit le **journal** du lot : uuid créés ; pour chaque tâche modifiée, ses valeurs avant et son
   `modified` après.
7. Rend : « Lot L-xxxx appliqué : N créées, M modifiées », avec la liste uuid court + description.

### `annuler_lot(id)` (en « ask » dans Claude Code)

Défait un lot appliqué, **uniquement sur les tâches qu'il a touchées** :
- tâche créée : `delete` de cet uuid précis (seule suppression possible du serveur) ;
- tâche modifiée : remise des valeurs d'avant ;
- découpage : suppression des sous-tâches créées, remise du parent.

Refuse en bloc, sans rien faire, si une tâche touchée a été modifiée depuis l'application
(`modified` différent du journal). Le refus nomme ces tâches. Rend ce qui a été défait.

### `lister_lots(n=10)`

Les derniers lots : id, titre, date, état (proposé / appliqué / annulé / périmé / échec partiel),
nombre d'opérations. Lecture seule.

## Opérations d'un lot

| Op | Champs | Notes |
|---|---|---|
| `creer` | `description`, `project`, `tags`, `estTime`, `due`, `scheduled`, `wait`, `depends` (uuid existants ou `$n` = n-ième tâche créée du lot), `priority`, `annotations` | Écrit par `task import` (UTF-8 : accents sûrs) |
| `modifier` | `uuid` + champs à remplacer ; `tags_ajout` / `tags_retrait` ; `depends_ajout` / `depends_retrait` | Par `task import` avec l'uuid existant, pour que les accents passent (les arguments `modify` non ASCII sont corrompus sous Windows) |
| `decouper` | identique à l'op `split` de `wtm.py` | Réutilise `_preparer_split` / `_split` |
| `annoter` | `uuid`, `texte` | |

**Interdits, refusés avec un message clair** : `delete`, `done`, changement de `status`, `purge`,
`undo`, `sync`, toute modification de config. L'utilisateur termine et supprime ses tâches
lui-même (règle existante : pas de `done` par agent).

## Contrôles

Bloquants (le lot n'est pas figé) :
- `estTime` invalide (formats acceptés : ceux de `wtm.py`, dont `90min`, `1.5h`, `PT1H30M` ;
  `1h30` normalisé en `1h+30min` comme pour `split`) ;
- uuid inconnu, dépendance vers une tâche inconnue, cycle créé par le lot ;
- date illisible ;
- opération interdite ;
- tâche sans contexte (`pro` ou `perso`) ;
- l'essai sur copie échoue ou ne produit pas l'effet attendu.

Avertissements (le lot est figé, l'utilisateur décide) :
- tag hors de `docs/tags.md` ;
- projet qui n'existe pas encore ;
- tâche en attente au libellé très proche (même projet, description normalisée identique ou
  quasi identique) ;
- échéance déjà passée, `scheduled` après `due` ;
- `estTime` absent.

## Format du résumé de `proposer_lot`

Texte brut, à largeur fixe, produit par le serveur :

```
Lot L-0412 — Garnitures US SiC/SiC — 2 à créer, 0 à modifier      (proposé le 15/10 à 09:12)
Base : 258 tâches en attente, empreinte 2dfd948d

 #  Op     Projet           Tâche                                         Tags                Durée  Échéance
 1  créer  NPD.Heliside.US  Corriger la codification JDE des garnitures   jde                 30min  —
                            GMS-0300-00013 à 00015 : faces SiC/SiC
 2  créer  NPD.Heliside.US  Demander à Flexaseal (D. Wolford) de          mail fournisseur    15min  04/11/2026
                            corriger FAS-10521 […]                        sourcing quick

Contrôles : ✔ formats  ✔ tags connus  ✔ projet existant  ✔ essai sur copie (2 créées)
Avertissements : aucun
→ « applique le lot » pour écrire. Le lot expire si la base change ou dans 24 h.
```

Pour `modifier`, la ligne montre `champ : avant → après`. Le contexte (`pro`) n'est pas répété
dans la colonne des tags.

## Configuration et emplacement

- Code : `tools/mcp_taskwarrior.py` (à côté de `wtm.py`). Dépendance : SDK Python `mcp`
  (ajouter à `requirements.txt`, installer dans le `venv` du projet).
- Base cible : variable d'environnement `WTM_MCP_TASKRC`, **obligatoire** (pas de valeur par
  défaut). `TASKDATA` hérité ignoré : le serveur pose lui-même l'environnement de chaque appel
  `task` et vérifie `rc.data.location` au démarrage.
- Dossier d'état (lots, sauvegardes, journaux) : `WTM_MCP_ETAT`, par défaut
  `%LOCALAPPDATA%\wtm-mcp`. **Jamais dans le dossier de données Taskwarrior** : Syncthing le
  répliquerait.
- Enregistrement dans Claude Code, portée utilisateur (le serveur sert SRMix et d'autres dépôts).
  Il pointe sur le worktree **`WebTaskManager-prod`** et son `venv` : la prod ne reçoit le code
  qu'après `git merge master`, à la demande de l'utilisateur.
- Réglages Claude Code (`~/.claude/settings.json`) :
  - `allow` : `mcp__taskwarrior__lire`, `mcp__taskwarrior__proposer_lot`,
    `mcp__taskwarrior__lister_lots` ;
  - `ask` : `mcp__taskwarrior__appliquer_lot`, `mcp__taskwarrior__annuler_lot`.
  L'utilisateur ne doit pas répondre « ne plus demander » sur ces deux-là.

## Limites connues

- Base partagée par Syncthing : l'empreinte détecte une modification locale ou synchronisée avant
  l'application, pas un conflit Syncthing qui arriverait après.
- `annuler_lot` sur un découpage est la partie la plus délicate ; si elle s'avère trop complexe,
  la livrer en refus explicite (« annulation d'un découpage non prise en charge ») et le noter.
- Le serveur ne fait ni `planifier` ni `faisabilite` : ces commandes restent dans `wtm.py`
  (lecture seule, sur copie). Elles pourront devenir des fonctions MCP plus tard.

## Ce qui change ailleurs

- `docs/skill-gestion-taskwarrior.md` : la section 3 décrit les fonctions MCP comme le chemin
  normal pour lire et écrire ; `wtm.py` reste documenté pour l'audit et la planification.
  Recopier ensuite dans `~/.claude/skills/gestion-taskwarrior/SKILL.md`.
- `AGENTS.md` §5 (surface Taskwarrior utilisée) : ajouter le serveur MCP.
