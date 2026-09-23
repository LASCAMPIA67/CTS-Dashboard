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
- Quand la conversation est résumée, le résumé garde l'étape en cours,
  ce que j'ai confirmé ou non, les fichiers modifiés, les validateurs
  lancés avec leur résultat et les pull requests ouvertes.

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
- Un défaut se corrige à sa cause : ne masque jamais une erreur et ne
  contourne jamais un validateur pour passer au vert.

## Après modification

- Lance les validateurs du dépôt, ceux de
  `.github/workflows/validate.yml`, et rapporte leur sortie.
- Avant d'ouvrir une pull request, fais relire les modifications par un
  sous-agent (`/code-review`). Ne retiens que ce qui touche la justesse
  ou ma demande.
- Corrige avant de me rendre la main.

## Git

- Jamais de commit direct sur `main` : branche dédiée puis pull request.
- Fusionne toi-même dès que la CI est verte, sans attendre que je le
  demande.
- Dis à chaque fois ce que la fusion a déclenché. Ici elle distribue :
  l'installateur remplace les fichiers du manifeste — scripts, bases et
  bibliothèques PDF.js — dès que la révision du dépôt a bougé, à sa
  prochaine opération quelle qu'elle soit, vérification comprise.
- Une fusion qui publie un numéro de version attend quand même mon
  accord : elle impose la mise à jour au parc, et elle doit son message à
  la communauté.

## Publication

- Tout changement de numéro de version — CTS Dashboard ou CTS Installer —
  donne lieu à un message pour la communauté WhatsApp, sans attendre que
  je le demande.
- Écris-le d'après `MESSAGES.md` : il porte le gabarit, les dix règles
  d'écriture, et dit quand un message est dû.

## Captures d'écran

- Elles arrivent en PDF, et rien ne les affiche sans `poppler-utils`. Le
  script de configuration de l'environnement l'installe avant que la
  session démarre ; `.claude/hooks/pdf-tools.sh` ne prend le relais que
  dans une session ouverte sur ce seul dépôt.
- Ouverte sur les deux dépôts, une session démarre dans leur dossier
  parent, où aucun réglage de dépôt n'est lu : le script du dépôt n'y
  tourne pas. Vérifie `pdftoppm` et installe le paquet d'emblée s'il
  manque.
- Si une capture reste illisible, installe le paquet avant de répondre et
  dis-le. Ne décris jamais une capture que tu n'as pas vue.

## Documentation

Vaut pour **toutes** les technologies du projet, pas seulement celles
d'Anthropic : Scriptable, PDF.js, iOS, Node, GitHub, comme Claude Code.

- Ne réponds jamais de mémoire. Ouvre la documentation d'abord,
  réponds ensuite.
- Commence par la skill `docs` : elle indexe chaque technologie et son
  adresse, et ses annexes portent les contraintes déjà vérifiées,
  citées et datées. L'annexe répond peut-être déjà.
- Dis toujours quelle page tu as lue.
- Une source douteuse se signale, elle ne se devine pas : adresse
  injoignable, page déménagée, citation introuvable, documentation qui
  décrit un autre système que le nôtre. Dis-le-moi et arrête-toi là.
- Ce qui vient du code et non d'une documentation se présente comme
  tel.

Pour Claude Code, sers-toi du serveur MCP `claude-code-docs` s'il est
disponible ; sinon `code.claude.com/docs/llms.txt` donne l'index, et
une page se lit en ajoutant `.md` à son adresse. Pour l'API Anthropic :
`platform.claude.com/llms.txt`.
