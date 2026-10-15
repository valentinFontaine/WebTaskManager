# Tâches : serveur MCP Taskwarrior

Spécification : `proposal.md` (même dossier).

- [x] 1. Tests rouges (`test_mcp_taskwarrior.py`, bases jetables comme `test_wtm.py`) :
      refus sans `WTM_MCP_TASKRC` ; `lire` ; `proposer_lot` (valide, bloquants, avertissements,
      accents, lot figé et immuable) ; `appliquer_lot` (succès, base changée, lot périmé, déjà
      appliqué, journal écrit) ; `annuler_lot` (création, modification, refus si retouchée) ;
      opérations interdites.
- [x] 2. `tools/mcp_taskwarrior.py` : fonctions pures testables d'abord, puis l'enveloppe MCP.
- [x] 3. Format du résumé : test de rendu sur un lot connu (comparaison texte).
- [x] 4. `mcp` dans `requirements.txt`, installé dans le `venv`.
- [x] 5. Essai de bout en bout : serveur lancé sur `taskwarrior-dev`, enregistré dans Claude Code
      en portée projet de dev, un lot proposé, appliqué et annulé.
- [x] 6. Doc : `docs/skill-gestion-taskwarrior.md`, `AGENTS.md` §5.
- [ ] 7. Proposer à l'utilisateur (sans les appliquer) : l'enregistrement du serveur en portée
      utilisateur sur `WebTaskManager-prod`, et les règles `allow` / `ask` de
      `~/.claude/settings.json`. Le merge vers la prod se fait à sa demande.
