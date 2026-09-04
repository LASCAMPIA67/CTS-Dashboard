# Consignes de travail

## Réponses

- En français, sans jargon. Tout terme technique inévitable est expliqué
  en une phrase.
- Tutoie-moi.
- Termine chaque réponse en disant clairement ce que je dois faire.
- Demande ambiguë : pose la question, ne devine pas.

## Rythme

- Procède par étapes numérotées, une seule à la fois.
- Ne passe à la suivante qu'après ma confirmation explicite. Une question
  de ma part ne vaut pas confirmation.
- Annonce les effets de bord avant d'agir.
- Quand un travail est terminé et que ma demande suivante porte sur un
  autre sujet, dis-le moi et propose une nouvelle session, après avoir
  consigné dans DECISIONS.md ce qui mérite d'y figurer.

## Décisions

- Lis `DECISIONS.md` au démarrage : il donne en une ligne datée chaque
  décision structurante du projet et sa raison.
- Ajoute une entrée quand une décision structurante est prise. Elle dit
  ce qui est décidé et pourquoi, jamais comment.
- Quand une décision change, ajoute une entrée qui dit ce qu'elle
  remplace. N'efface pas l'ancienne : elle explique l'état d'avant.

## Avant de modifier

- Lis le fichier concerné en entier, jamais un extrait. S'il a déjà été
  lu dans la session, ne le relis pas.
- Suis les conventions déjà en place.

## Code

- Niveau senior : lisible, cohérent avec l'existant, sans complexité
  inutile ni code mort.
- La lisibilité prime sur la brièveté.
- Les commentaires expliquent une contrainte non évidente — le pourquoi,
  jamais le quoi. Aucun ne paraphrase le code.

## Après modification

- Lance les validateurs du dépôt, ceux de
  `.github/workflows/validate.yml`, et rapporte leur sortie.
- Corrige avant de me rendre la main.

## Git

- Jamais de commit direct sur `main` : branche dédiée puis pull request.
- Ne fusionne que si je le demande.

## Publication

- Tout changement de numéro de version — CTS Dashboard ou CTS Installer —
  donne lieu à un message pour la communauté WhatsApp, sans attendre que
  je le demande.
- Écris-le d'après `MESSAGES.md` : il porte le gabarit, les dix règles
  d'écriture, et dit quand un message est dû.

## Documentation Anthropic

Pour toute question sur Claude Code, l'API Anthropic, MCP, les hooks,
les subagents, les skills ou les commandes slash : ne réponds pas de
mémoire. Si le serveur MCP `claude-code-docs` est disponible, utilise
`search_claude_code_docs`. Sinon, consulte
`https://code.claude.com/docs/llms.txt` et lis la page pertinente en
ajoutant `.md` à son URL. Pour l'API :
`https://docs.claude.com/en/docs_site_map.md`. Dis toujours quelle page
tu as consultée.
