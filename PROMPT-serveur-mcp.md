# Prompt — serveur MCP Taskwarrior

Implémente le serveur MCP décrit dans `openspec/changes/serveur-mcp-taskwarrior/proposal.md`,
en suivant `tasks.md` du même dossier. Lis les deux avant de commencer, ainsi que `AGENTS.md`
(§3 isolation des données, §4 tests) et `tools/wtm.py`, que le serveur réutilise.

## Règles de cette session

- **Aucun accès à la prod** (`C:/Users/irpaui/taskwarrior-prod`), même en lecture : tests et essais
  sur des bases jetables ou sur `taskwarrior-dev`. Ne touche pas au worktree `WebTaskManager-prod`.
- Tests d'abord : écris `test_mcp_taskwarrior.py`, montre-les rouges, puis implémente.
- Réutilise `wtm.py` ; si une fonction doit changer, garde les tests `test_wtm*.py` verts.
- N'installe rien hors du `venv` du projet.
- Ne modifie pas mes réglages Claude Code (`~/.claude/settings.json`, enregistrement MCP en portée
  utilisateur) : **propose**-les à la fin, je les appliquerai.
- Commits locaux, un par étape de `tasks.md`, message en français. Pas de `push`.
- Disjoncteur : après 2 échecs sur la même étape, arrête et rapporte.
- Si un point de la spec te paraît faux ou trop coûteux (par exemple `annuler_lot` sur un
  découpage), dis-le et propose une alternative avant de t'écarter de la spec.

## Ce que tu me rends (20 lignes au plus)

1. L'état de chaque case de `tasks.md`, et le résultat de `pytest` (nombre de tests, verts / rouges).
2. Le résumé réel produit par `proposer_lot` sur un lot d'essai, recopié tel quel.
3. Les écarts avec la spec, et pourquoi.
4. Les deux blocs à appliquer de mon côté : la commande d'enregistrement du serveur (portée
   utilisateur, worktree `WebTaskManager-prod`) et les règles `allow` / `ask`.
