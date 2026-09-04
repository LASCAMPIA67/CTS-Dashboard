# Décisions

Une ligne par décision structurante : la date, ce qui a été décidé, et
pourquoi. Le comment se lit dans le code et dans `README.md`.

Les entrées s'ajoutent à la fin, la plus récente en dernier. Une
décision qui change ne s'efface pas : une nouvelle entrée dit ce qu'elle
remplace, pour que l'état d'avant reste lisible.

Les entrées antérieures au 4 septembre 2026 ont été relevées dans
l'historique Git et le README. Elles portent la date du commit qui les a
établies, ou celle du début de l'historique — le 19 août 2026 — quand la
décision lui est antérieure.

- 2026-08-19 — Le dépôt reste public et ne contient que ce que les
  collègues installent ; les outils du mainteneur y sont ignorés par
  `.gitignore` et refusés par la validation, parce qu'un dépôt public
  publie définitivement ce qu'on y met, l'historique Git compris.
- 2026-08-19 — `version.json` fait seul foi sur la distribution : CTS
  Installer n'itère que sur ce manifeste, donc un fichier qui n'y figure
  pas n'est ni installé, ni supprimé.
- 2026-08-19 — CTS Repair vit hors du manifeste et s'installe à la main,
  parce qu'un installateur cassé ne peut pas se remplacer lui-même.
- 2026-08-19 — Le rapport de diagnostic exclut le nom, le matricule, les
  horaires, le numéro de service et le contenu des PDF : il est transmis
  dans un canal d'assistance, où rien de personnel n'a à circuler.
- 2026-08-19 — Chaque défaut réel laisse un banc d'essai dans
  `tools/preview/`, exécuté en CI : une vérification statique ne voit pas
  ce qui casse à l'exécution.
- 2026-08-19 — La cible est l'iPhone avec le widget grand format de
  Scriptable, sur les versions publiques d'iOS ; les bêtas peuvent être
  testées mais ne sont pas une cible de garantie.
- 2026-08-23 — Supprimer la carte agent du dossier `Services` retire le
  service, après une heure d'attente : c'est le délai qui distingue une
  suppression volontaire d'un fichier qu'iCloud n'a pas encore
  synchronisé.
- 2026-08-24 — Dans CTS Installer la mise à jour est obligatoire, mais le
  Diagnostic reste joignable sans elle : c'est la procédure d'assistance
  du projet, et elle doit servir même quand c'est la mise à jour qui
  échoue.
- 2026-08-24 — Dans le widget, seul le plancher `minimumDashboard`
  bloque : couper un conducteur en service parce qu'une correction vient
  de paraître n'aurait pas de sens.
- 2026-08-24 — Le widget ne consulte jamais le réseau pour juger sa
  version ; il lit la politique déposée par l'appel d'activité quotidien,
  et son absence ne bloque jamais — hors ligne ou à la première
  installation, il fonctionne normalement.
- 2026-08-25 — Un fichier téléchargé n'est mis en place qu'une fois
  vérifié, et la copie en place est conservée sinon : une page d'erreur
  GitHub écrite à la place d'un script laisserait l'iPhone sans
  installateur.
- 2026-09-01 — Les questions sur Claude Code, l'API Anthropic, MCP, les
  hooks, les skills et les commandes slash se répondent par la
  documentation, jamais de mémoire : une réponse inventée coûte plus cher
  qu'une page lue.
- 2026-09-02 — Le serveur MCP `claude-code-docs` est déclaré dans le
  dépôt et approuvé pour tout le dépôt, pour que cette documentation soit
  consultable sans réglage propre à un appareil.
- 2026-09-04 — `CLAUDE.md` porte les consignes de travail et
  `DECISIONS.md` le journal des décisions : ce qui est décidé et expliqué
  dans une session disparaît avec elle.
- 2026-09-04 — Un numéro de version est l'acte de publier et non une
  étiquette : il ne monte que lorsqu'une modification doit atteindre les
  iPhone, parce que l'installateur ne livre que ce dont le numéro a bougé.
- 2026-09-04 — Un numéro publié désigne un seul état des fichiers, et une
  correction ultérieure en prend un neuf : un numéro qui désigne deux
  comportements ne vaut rien dans un rapport de diagnostic.
- 2026-09-04 — `version` annonce et `installerVersion` livre : le premier
  suit ce que le conducteur doit apprendre ou gagne à pouvoir faire, le
  second n'a d'autre rôle que de déclencher le remplacement de
  l'installateur et n'annonce rien.
- 2026-09-04 — Une version majeure est celle dont la publication éteint
  des installations en service ; il n'y en a jamais eu, et le plancher
  restera armé sans mordre tant qu'aucune version ne le vaudra.
