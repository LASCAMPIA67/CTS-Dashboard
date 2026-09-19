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
- 2026-09-06 — Un correctif dont rien n'est visible pour le conducteur
  attend la prochaine version qui aura quelque chose à annoncer : publier
  un numéro oblige à un message pour la communauté, et celui-là n'aurait
  rien à dire.
- 2026-09-06 — Le README énonce champ par champ ce que le widget
  transmet, le nom et le matricule compris : un collègue qui l'apprendrait
  autrement le prendrait mal, et le dépôt qui distribue le code est le
  seul endroit où cette information ne se perd pas.
- 2026-09-06 — Le dépôt est publié sous licence MIT, d'abord pour ce
  qu'elle dit du risque : un outil consulté avant une prise de service
  doit énoncer qu'il est fourni sans garantie.
- 2026-09-06 — Le README ne cite aucun numéro de version en dur, et lit
  ceux qu'il affiche dans `version.json` : un chiffre recopié finit
  toujours par diverger de ce qu'il décrit.
- 2026-09-10 — Le README suit les conventions que GitHub documente, comme
  celui du dépôt admin depuis le même jour : aucun sommaire écrit à la main,
  puisque GitHub en génère un dès deux titres, et deux encarts au plus —
  ceux dont l'ignorance coûte quelque chose au conducteur. Tient la
  charpente commune décidée le 6 septembre, que l'alignement du dépôt admin
  avait laissée en défaut.
- 2026-09-10 — Le trajet d'une carte d'agent, du dépôt jusqu'aux archives,
  est montré par un diagramme : la règle de l'heure d'attente vaut à la fois
  pour l'arrivée et pour le retrait, et s'expliquait jusqu'ici en quatre
  endroits sans jamais se voir d'un coup.
- 2026-09-10 — Le dépôt ne prend des standards de communauté de GitHub que
  ceux qui servent à quelqu'un ici — politique de sécurité, guide de
  contribution, gabarit de pull request, sujets de classement — et laisse
  les autres. Un code de conduite suppose une communauté à arbitrer et des
  gabarits d'issues un formulaire que personne n'ouvre : un fichier posé
  pour compléter une liste ne se lit pas, et donne à croire qu'un chemin
  existe là où il n'y en a pas.
- 2026-09-10 — Une faille se signale par le signalement privé de GitHub, et
  jamais par une issue ni par le groupe WhatsApp : le dépôt est public, et
  une faille décrite avant d'être corrigée est une faille offerte.
- 2026-09-10 — Une pull request de ce dépôt part d'un gabarit, parce que
  fusionner un numéro qui a monté publie sur les vingt-quatre iPhone : le
  seul geste irréversible du dépôt méritait sa liste devant les yeux, au
  moment de l'ouvrir.
- 2026-09-12 — Une session de travail sait afficher un PDF dès son
  ouverture, sans qu'on le demande : une capture d'écran est le seul moyen
  de montrer ce que le mainteneur a sous les yeux sur son iPhone, et une
  capture illisible fait répondre de mémoire.
- 2026-09-12 — Un message qui demande quelque chose à la communauté n'est
  pas une note de version : il garde le ton de `MESSAGES.md` et ses dix
  interdits, jamais son gabarit, dont la règle « pas de question » le
  rendrait muet. Le gabarit reste à ce qu'une publication doit annoncer.
- 2026-09-14 — La lecture des PDF tient au script de configuration de
  l'environnement, et non plus au seul script du dépôt : une session
  ouverte sur les deux dépôts démarre dans leur dossier parent, où aucun
  réglage de dépôt n'est lu, et le dépôt seul ne peut donc plus rien
  garantir. Complète la décision du 12 septembre, qui la tenait pour
  acquise.
- 2026-09-14 — Une exécution n'enregistre qu'un incident par cause, et la
  gravité retenue est la plus forte que cette cause ait values. Deux
  sous-systèmes butent sur une même panne dans la même exécution — iCloud
  injoignable arrête l'inspection de la carte agent et l'archivage du même
  fichier, un index corrompu arrête la sélection du service et l'entretien
  — et le dédoublonnage portait sur le module, qui diffère par
  construction : la console recevait deux lignes pour un fait unique,
  l'une rouge et l'autre orange. Ce que le collègue a perdu ne dépend pas
  du sous-système qui l'a constaté. Applique à l'émission la règle de
  gravité du 9 septembre, qui ne valait jusqu'ici qu'à la lecture.
- 2026-09-15 — L'index des services ne se lit que par `CTS Storage`, et cette
  lecture refuse un index illisible plutôt que d'en rendre un vide. Elle
  existait en trois exemplaires : deux copies dans l'importeur et dans son
  pipeline, et une troisième dans `CTS Storage` que rien n'appelait — celle-là
  avalait un fichier corrompu en silence. Un index cassé lu comme une liste
  vide devient « aucun service aujourd'hui » chez le collègue, quand c'est un
  incident que l'administration doit voir. Elle ne passe pas par le pipeline
  d'importation, bien que l'audit du 11 septembre l'ait proposé : le widget
  emprunte cette lecture pour afficher le service du jour, et un pipeline
  absent aurait alors éteint l'affichage d'un service déjà importé. Aucun banc
  n'éprouvait ce refus ; il en a un désormais.
- 2026-09-15 — Les deux codes iCloud du moteur PDF — la bibliothèque et son
  worker — ne rejoignent pas la table des causes du widget, bien que ce soit
  le même iCloud qui refuse de rendre un fichier. La carte agent se télécharge
  avant la bibliothèque : un iCloud muet arrête donc l'import sur la carte, et
  ces deux codes-là ne sortent que lorsqu'elle est déjà locale. Là où ils se
  rencontrent quand même — deux PDF d'une même exécution — ce sont deux gestes
  différents, une carte à redéposer et une installation à refaire, et la
  fusion garde le premier code vu : elle nommerait parfois la carte pour une
  bibliothèque absente, et enverrait chercher dans le dossier Services un
  fichier qui n'a rien. Complète la règle du 14 septembre, qui disait une
  cause un incident sans dire où une cause s'arrête.
- 2026-09-16 — Le Diagnostic certifie une installation sur le contenu de ses
  fichiers, comparé à ce que le dépôt publie, et jamais sur la note écrite par
  l'installateur. Un collègue a gardé des semaines un Dashboard qui n'avait
  jamais importé une seule carte agent, sous un rapport annonçant « snapshot à
  jour » et « 22/22 fichiers locaux valides » : les deux étaient exacts et ne
  disaient rien, l'un recopiant une note posée à la dernière installation,
  l'autre vérifiant seulement qu'un fichier existe, n'est pas vide et n'est pas
  une page d'erreur GitHub. Un script resté un mois en arrière coche ces trois
  cases. Le rapport nomme désormais les fichiers qui diffèrent, et distingue
  « je n'ai pas pu vérifier » de « ce fichier diffère » : une coupure réseau ne
  doit envoyer réparer personne. Les deux bibliothèques PDF.js restent hors de
  cette comparaison, trop lourdes à retélécharger pour un rapport, et le
  contrôle des ressources dit qu'il ne les juge que sur leur taille — ce qu'on
  ne vérifie pas doit s'annoncer, sinon c'est le silence qui trompe.
- 2026-09-16 — Une mesure absente ne s'écrit jamais zéro. Number(null) vaut
  zéro, et les six étapes d'un import qui n'en avait commencé aucune se
  rapportaient « 0 ms » : six mesures instantanées là où il n'y en avait
  aucune, sur le seul bloc du rapport qui dise où un import s'est arrêté.
  C'est la règle que l'administration s'est donnée le 14 septembre — un nombre
  faux vaut moins qu'un nombre absent — appliquée au rapport lui-même, qui se
  lit toujours loin de la panne qu'il décrit.
- 2026-09-16 — Le gabarit de message ne vaut que pour une publication du
  Dashboard ; quand seul le numéro de l'installateur monte, le message porte
  son titre et sa propre marche à suivre, écrite dans `MESSAGES.md`. Le
  gabarit envoie chercher « Mettre à jour vers 1.0.X » puis « 22/22 fichiers
  valides », deux écrans qui n'apparaissent pas tant que la version du
  Dashboard n'a pas bougé, et un collègue qui cherche un bouton absent conclut
  que la mise à jour a échoué. Complète la décision du 12 septembre, qui
  réservait le gabarit à ce qu'une publication doit annoncer sans prévoir
  qu'une publication puisse ne pas concerner le Dashboard.
- 2026-09-18 — Le Dashboard garde sa dépendance à iCloud, et ne cherchera pas
  à s'en passer : c'est le geste du conducteur qui commande l'emplacement des
  fichiers, et non l'inverse. Déposer une carte agent doit rester aussi simple
  que glisser un PDF dans un dossier, donc le dossier `Services` doit rester
  visible dans l'app Fichiers — et la documentation de Scriptable énonce que
  le dossier local d'un script n'y paraît jamais : « Files stored in the local
  documents directory will not appear in the Files app ». Un signet de dossier
  ne rattrape rien, Scriptable réservant les siens à l'application, hors
  d'atteinte d'un widget. Écarte le passage au stockage local, étudié le même
  jour parce que des collègues dont le stockage iCloud est saturé voient leur
  widget échouer ; ce qu'iCloud coûte à ceux-là se paiera donc ailleurs qu'en
  changeant de rangement.
- 2026-09-18 — L'attente que le widget accorde à iCloud — une tentative, une
  seconde et demie — est tenue pour un défaut à corriger et non pour un
  réglage, alors que l'application en accorde quatre sur douze secondes pour
  le même fichier. Un téléphone dont la synchronisation iCloud est à l'arrêt
  ne rend aucun fichier dans ce délai, et le widget rend alors une erreur là
  où il n'y avait qu'un retard : un collègue du parc n'a vu aboutir aucune de
  ses onze exécutions utiles d'une semaine. La correction reste due
  indépendamment de la décision ci-dessus, qui ne change rien à ce que le
  widget fait d'un fichier qui tarde.
- 2026-09-19 — L'approbation des serveurs MCP de documentation appartient au
  script de configuration de l'environnement, et jamais au dépôt : Claude Code
  énonce qu'un dépôt cloné ne peut pas approuver ses propres serveurs, et
  ignore `enabledMcpjsonServers` versionné tant que personne n'a accepté la
  boîte de confiance — ce que nul ne fait dans une session distante, qui
  n'a pas d'humain devant elle au démarrage. Le serveur `claude-code-docs`
  restait donc en attente d'approbation à chaque session distante depuis le
  2 septembre, sans que rien ne le signale, et les réponses sur Claude Code se
  donnaient sans lui. Ce n'est pas un défaut à contourner : un dépôt qui
  pourrait s'accorder l'accès à un service externe par un simple fichier
  versionné serait un danger. Complète la décision du 2 septembre, qui voulait
  cette documentation consultable sans réglage propre à un appareil : le
  réglage existe bel et bien, il appartient à l'environnement.
