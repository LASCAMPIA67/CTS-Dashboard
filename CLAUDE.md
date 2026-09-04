# Consignes de travail

## Réponses

- En français, sans jargon. Tout terme technique inévitable est expliqué
  en une phrase.
- Termine chaque réponse en disant clairement ce que je dois faire.
- Demande ambiguë : pose la question, ne devine pas.

## Rythme

- Procède par étapes numérotées, une seule à la fois.
- Ne passe à la suivante qu'après ma confirmation explicite. Une question
  de ma part ne vaut pas confirmation.
- Annonce les effets de bord avant d'agir.

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

## Documentation Anthropic

Pour toute question sur Claude Code, l'API Anthropic, MCP, les hooks,
les subagents, les skills ou les commandes slash : ne réponds pas de
mémoire. Si le serveur MCP `claude-code-docs` est disponible, utilise
`search_claude_code_docs`. Sinon, consulte
`https://code.claude.com/docs/llms.txt` et lis la page pertinente en
ajoutant `.md` à son URL. Pour l'API :
`https://docs.claude.com/en/docs_site_map.md`. Dis toujours quelle page
tu as consultée.
