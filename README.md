# CTS Dashboard

Widget Scriptable pour iPhone permettant aux conducteurs CTS de consulter leur service depuis l’écran d’accueil.

**Développé et maintenu par Emilio IPPOLITO.**

> CTS Dashboard est un projet indépendant. Les documents de service officiels restent la référence.

## Compatibilité

CTS Dashboard est conçu exclusivement pour **iPhone** et pour le **widget grand format de Scriptable**.

Cible de validation actuelle :

- **iOS 18** sur les iPhone encore compatibles avec cette branche, notamment iPhone XR, XS et XS Max ;
- **iOS 26 et versions majeures Apple suivantes prises en charge par le même matériel**, à partir de l’iPhone 11 et de l’iPhone SE 2e génération ;
- Scriptable à jour, qui nécessite iOS 15.5 ou ultérieur ;
- iCloud Drive activé pour Scriptable ;
- connexion Internet requise pour l’installation, les mises à jour et la réparation des ressources.

Les versions bêta d’iOS ne constituent pas une cible de garantie. Elles peuvent être testées, mais la compatibilité officielle du projet vise les versions publiques récentes.

Le rendu du widget adapte automatiquement ses espacements aux écrans iPhone plus étroits et réduit les textes longs avant toute troncature.

## Installation recommandée

1. Installer **Scriptable** depuis l’App Store et l’ouvrir une première fois.
2. Recevoir le fichier **`CTS Installer.scriptable`** fourni par le mainteneur.
3. Ouvrir le fichier puis utiliser **Partager → Scriptable → Add to My Scripts**.
4. Dans Scriptable, exécuter **CTS Installer**.
5. Choisir **Installer la version disponible** et attendre la validation complète.
6. Sur l’écran d’accueil, ajouter un widget **Scriptable grand format**.
7. Configurer le widget avec **Script : CTS Dashboard** et **When Interacting / Open App : Run Script**.

Si CTS Installer annonce une version plus récente, choisir **Installer la version proposée**, puis relancer CTS Installer une seconde fois : l’installateur se met à jour lui-même avant d’installer le Dashboard.

Selon la version d’iOS, le bouton de modification de l’écran d’accueil peut être affiché avec un libellé ou une icône différente. La procédure compatible à retenir est **Modifier → Ajouter un widget**. Pour reconfigurer un widget existant, utiliser **appui long sur le widget → Modifier le widget**.

Les trois tutoriels dédiés Safari, Google et Brave détaillent ensuite le dépôt quotidien des cartes d’agent.

## Déposer un service

Enregistrer la carte d’agent PDF dans :

```text
iCloud Drive
└── Scriptable
    └── CTS Dashboard
        └── Services
```

Plusieurs cartes peuvent être déposées à l’avance. CTS Dashboard importe et sélectionne automatiquement le service correspondant à la date utile.

## Retirer un service

Quand un service change au dernier moment, l’ancien peut être retiré de deux façons.

Supprimer la carte d’agent du dossier `Services` suffit : CTS Dashboard le constate, retire le service et efface les fichiers qu’il avait produits. Il patiente une heure avant de conclure, le temps de distinguer une suppression volontaire d’un fichier qu’iCloud n’a pas encore synchronisé.

Pour un retrait immédiat, exécuter **CTS Installer** puis **Retirer un service** : la liste indique le service affiché en ce moment, et demande confirmation avant de supprimer.

Dans les deux cas, seuls les fichiers du service retiré sont supprimés. Les autres services et les archives ne sont pas touchés.

## Mises à jour

Relancer **CTS Installer** puis choisir **Mettre à jour** ou **Vérifier les fichiers**. L’Installer compare les 22 fichiers distribués au snapshot GitHub courant et conserve les PDF, les archives et les données protégées.

Deux règles encadrent les versions, et elles ne sont volontairement pas les mêmes.

**Dans CTS Installer, la mise à jour est obligatoire.** Si une version plus récente existe, l’installateur la propose avant tout le reste et le menu n’est pas accessible tant qu’elle n’est pas faite. Le **Diagnostic** reste joignable sans mettre à jour : c’est la procédure d’assistance du projet, et elle doit rester utilisable même quand c’est la mise à jour qui échoue.

**Dans le widget, seul un plancher bloque.** `minimumDashboard` dans `version.json` fixe la version en dessous de laquelle le widget cesse d’afficher un service et demande une mise à jour. Une version simplement en retard continue de fonctionner : couper un conducteur en service parce qu’une correction vient de paraître n’aurait pas de sens.

Le widget ne consulte jamais le réseau pour en décider. Il lit une politique déposée par l’appel d’activité quotidien, et **l’absence de réponse ne bloque jamais** : sans réseau, sans politique connue ou à la première installation, il fonctionne normalement.

## Numéros de version

Deux numéros vivent dans `version.json`, et ils n'ont pas le même métier.
Augmenter l'un d'eux, c'est publier : CTS Installer compare le numéro du
manifeste à celui qui est installé, et n'agit que s'il a monté. Un fichier
modifié sans numéro nouveau reste dans le dépôt et n'atteint aucun iPhone.

Un numéro publié désigne un seul état des fichiers, définitivement. Une
correction qui arrive après coup prend un numéro neuf, même si elle tient
en une ligne : la 1.1.2 a été publiée deux fois avec deux comportements
différents, et un numéro qui en désigne deux ne vaut rien dans un rapport
de diagnostic.

### `version` — le Dashboard

C'est le numéro qui parle : il s'affiche dans le Diagnostic, voyage avec
la télémétrie, et le Worker le sert comme dernière version publiée.

**Le correctif est le cas normal.** Une correction, un plantage, une
lenteur, une mise en page reprise, un libellé faux, une information de
plus à lire : tout monte d'un cran par défaut.

**Le mineur monte dans quatre cas**, et seulement ceux-là :

| Cas | Précédent |
|---|---|
| le conducteur peut faire ce qu'il ne pouvait pas | 1.2.0, retirer un service |
| il doit apprendre un geste, ou en perd un | 1.1.0, toucher le widget après avoir déposé une carte |
| ce qui sort du téléphone change de nature | 1.4.0, le nom et le matricule partent avec la télémétrie |
| un verrou écrit auparavant atteint les téléphones | 1.3.0, un contrôle n'existe que dans la version qui le porte |

**Le majeur n'a jamais bougé.** C'est la version dont la publication
éteint des installations en service : celle qu'accompagne un
`minimumDashboard` relevé au-dessus de ce que des collègues utilisent
encore.

La taille du changement ne décide de rien. Trois publications d'affilée
ont repris le bloc du bas du widget sans quitter le correctif. Nommer
l'intervalle entre deux tranches en est resté un aussi : le conducteur y
gagne à lire, pas à faire. Et revenir à l'habitude d'avant reste un
correctif — la 1.1.1 a annulé le geste que la 1.1.0 demandait.

### `installerVersion` — CTS Installer

C'est un numéro qui livre. Son seul rôle est de déclencher le
remplacement de l'installateur par lui-même : il monte d'un cran chaque
fois que `CTS Installer.js` change, sans mineur ni majeur. Seize
publications l'ont fait ainsi, dont la reconstruction complète des trois
écrans d'accueil et la suppression du bouton qui permettait de refuser
une mise à jour.

Quand un changement doit être annoncé, c'est `version` qui l'annonce : la
1.3.0 a annoncé la mise à jour obligatoire pendant que la 1.0.21 se
contentait de la livrer. Un changement qui touche les deux fait monter
les deux dans le même commit.

### Les planchers

`minimumDashboard` et `minimumInstaller` ne suivent pas le rythme des
versions, et ne bougent jamais dans le commit qui en publie une.

Le premier ne monte que pour éteindre, donc avec une majeure. Le second
monte quand une version d'installateur devient incapable de faire son
travail — une seule fois jusqu'ici, à 1.0.23, le jour où la mise à jour
est devenue obligatoire.

### Qui décide, et quand le numéro s'écrit

Le mainteneur décide de chaque numéro. Le numéro s'écrit au moment de
publier, jamais au moment de coder, et toujours à deux endroits dans le
même commit — `version.json` et `CTS Config.js`, ou `version.json` et
`CTS Installer.js`. La validation refuse qu'ils divergent.

Un changement qui se juge sur le dépôt porte son numéro dans la même pull
request. Un changement qui se juge sur l'appareil — un rendu, une mise en
page, un écran — en demande deux : la première change le code sans
toucher à aucun numéro, la seconde n'écrit que le numéro, une fois le
rendu vérifié sur un iPhone. Entre les deux, `main` contient du code non
publié, et c'est l'état normal d'un travail en attente de vérification.

## Réparer un installateur bloqué

Si CTS Installer s’arrête sur **Opération impossible** avant d’avoir affiché sa liste de fichiers, c’est l’installateur lui-même qui est en cause et il ne peut pas se remplacer tout seul. Le script **CTS Repair** existe pour ce seul cas :

1. ouvrir le fichier `CTS Repair.js` du dépôt, puis **Partager → Scriptable → Add to My Scripts** ;
2. exécuter **CTS Repair** : il télécharge la version publiée de CTS Installer, la contrôle et la réécrit ;
3. relancer **CTS Installer**, choisir **Vérifier les fichiers** ;
4. supprimer **CTS Repair**, devenu inutile.

CTS Repair ne touche à aucune donnée : ni PDF, ni archives, ni index. Il refuse d’installer un fichier incomplet ou porteur du même défaut, et remet l’ancien installateur en place si l’écriture échoue.

## Diagnostic

En cas de problème :

1. exécuter **CTS Installer** ;
2. ouvrir **Diagnostic** ;
3. copier le rapport technique ;
4. transmettre ce rapport dans le canal d’assistance prévu.

Le rapport est conçu pour exclure le nom du conducteur, le matricule, les horaires, le numéro de service et le contenu des PDF.

## Fonctions principales

- import automatique des cartes agent PDF HASTUS ;
- sélection automatique du service selon la date et les horaires après minuit ;
- états Avant le service / En service / Pause / Coupure / Service terminé ;
- affichage des tranches, directions, dépôts et mises en ligne ;
- retrait d’un service, depuis le dossier `Services` ou depuis CTS Installer ;
- archivage automatique et rétention des archives ;
- récupération iCloud avec nouvelles tentatives ;
- réparation et vérification automatiques des fichiers ;
- diagnostic anonymisé.

## Structure créée automatiquement

```text
CTS Dashboard
├── Cache
├── Data
├── Database
├── Libraries
└── Services
    ├── Archive
    └── Rejected
```

## Contenu du dépôt

Ce dépôt est **public** et ne contient que ce qui est destiné aux conducteurs :

| | |
|---|---|
| **22 fichiers distribués** | 17 scripts + 5 ressources, listés dans `version.json`, installés par CTS Installer |
| **`CTS Installer.js`** | téléchargé depuis l'URL brute, se met à jour lui-même, hors manifeste |
| **`CTS Repair.js`** | remplace un installateur bloqué, installé à la main en cas de besoin |
| **`tools/preview/`** | bancs d'essai et outils de mesure, exécutés hors iPhone |

Les outils de maintenance du mainteneur — console de statistiques, simulateur,
éditeur de base, testeur PDF — **ne figurent pas dans ce dépôt**. Ils vivent
uniquement sur son iPhone. `.gitignore` les ignore et `validate.mjs` échoue si
l'un d'eux réapparaît : un dépôt public publie définitivement ce qu'on y met,
l'historique Git compris.

Cette séparation ne protège aucun secret, car il n'y en a aucun dans ces
outils. La capacité d'administration tient à la clé `ADMIN_API_KEY`, conservée
dans le Keychain du mainteneur et vérifiée par le serveur : sans elle, l'API de
statistiques répond 401, quel que soit le code exécuté.

## Vérifications automatiques

`node .github/scripts/validate.mjs` contrôle le manifeste, la syntaxe, les
métadonnées Scriptable, la cohérence des versions, les libellés d'arrêts, le
contraste de la palette et l'absence d'outil admin.

Seize bancs d'essai complètent la CI, parce qu'une vérification statique ne
voit pas ce qui casse à l'exécution. Chacun est né d'un défaut réel :

| Banc | Ce qu'il empêche |
|---|---|
| `modules-smoke` | une fonction appelée d'un module à l'autre qui n'existe pas |
| `dashboard-smoke` | un widget blanc, vide, ou rendu dans une taille non prévue |
| `scan-smoke` | une carte agent détectée mais jamais importée |
| `selection-smoke` | le mauvais service retenu à cheval sur minuit |
| `storage-smoke` | un fichier lisible qu'iCloud refuse de confirmer, une écriture interrompue |
| `cleanup-smoke` | un PDF jamais archivé, un cache effacé trop tôt |
| `residue-smoke` | une copie de sécurité orpheline effacée alors qu'elle était le dernier exemplaire |
| `removal-smoke` | un service retiré qui emporte les fichiers d'un autre, ou qu'iCloud fait disparaître à tort |
| `version-gate-smoke` | un widget bloqué à tort parce qu'il est hors ligne, ou qu'un plancher a été publié de travers |
| `database-smoke` | un arrêt affiché sous forme de code |
| `layout-smoke` | une grille horaires qui déborde selon l'appareil |
| `utils-smoke` | une attente sans borne, une date jugée valide par un seul module |
| `installer-smoke` | une constante inaccessible à l'exécution |
| `repair-smoke` | un dépannage qui laisse l'iPhone sans installateur |
| `telemetry-smoke` | un jour de repos compté comme une panne dans le taux de succès de la flotte |
| `pdf-engine-smoke` | un fichier que personne ne lit qui empêche toute lecture de carte agent |

Trois outils du même dossier ne sont pas des bancs et ne tournent pas en CI :
ils s'exécutent à la demande et **ne doivent pas être pris pour des fichiers
orphelins** — rien ne les référence parce que ce sont des points d'entrée.

| Outil | Usage |
|---|---|
| `preview.mjs` | rend les états du widget en images, pour juger le rendu sans iPhone |
| `installer.mjs` | rend les pages de CTS Installer de la même façon |
| `installer-bench.mjs` | mesure une installation complète : requêtes, octets, temps |

## Développeur

**Emilio IPPOLITO**

Projet développé et maintenu indépendamment.
