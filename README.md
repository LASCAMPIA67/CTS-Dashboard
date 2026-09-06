# CTS Dashboard

[![Validation](https://github.com/LASCAMPIA67/CTS-Dashboard/actions/workflows/validate.yml/badge.svg)](https://github.com/LASCAMPIA67/CTS-Dashboard/actions/workflows/validate.yml)
[![Dashboard](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FLASCAMPIA67%2FCTS-Dashboard%2Fmain%2Fversion.json&query=%24.version&label=Dashboard&color=1f6feb)](version.json)
[![CTS Installer](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FLASCAMPIA67%2FCTS-Dashboard%2Fmain%2Fversion.json&query=%24.installerVersion&label=CTS%20Installer&color=6e7781)](version.json)

Widget Scriptable pour iPhone permettant aux conducteurs CTS de consulter
leur service depuis l'écran d'accueil.

**Développé et maintenu par Emilio IPPOLITO.**

> [!NOTE]
> CTS Dashboard est un projet indépendant. Les documents de service
> officiels restent la référence.

## Sommaire

- [Ce que fait CTS Dashboard](#ce-que-fait-cts-dashboard)
- [Compatibilité](#compatibilité)
- [Installation](#installation)
- [Au quotidien](#au-quotidien)
- [Mises à jour](#mises-à-jour)
- [En cas de problème](#en-cas-de-problème)
- [Données et confidentialité](#données-et-confidentialité)
- [Numéros de version](#numéros-de-version)
- [Contenu du dépôt](#contenu-du-dépôt)
- [Vérifications automatiques](#vérifications-automatiques)
- [Licence et auteur](#licence-et-auteur)

## Ce que fait CTS Dashboard

Le conducteur dépose sa carte d'agent PDF dans un dossier iCloud. Tout le
reste est automatique : le widget lit la carte, retient le service du jour,
et affiche sur l'écran d'accueil ce qu'il reste à faire.

| | |
|---|---|
| **Import automatique** | les cartes d'agent PDF HASTUS sont lues sans aucune manipulation |
| **Sélection du service** | selon la date, et selon les horaires qui passent minuit |
| **États du service** | Avant le service · En service · Pause · Coupure · Service terminé |
| **Programme détaillé** | tranches, directions, dépôts, mises en ligne, durées |
| **Retrait d'un service** | depuis le dossier `Services`, ou depuis CTS Installer |
| **Archivage** | automatique une heure après la fin du service, puis rétention |
| **Résilience iCloud** | récupération des fichiers non encore synchronisés, avec nouvelles tentatives |
| **Réparation** | vérification et remplacement des fichiers abîmés |
| **Diagnostic** | rapport technique anonymisé, transmissible tel quel |

Le rendu s'adapte aux écrans iPhone plus étroits : il réduit les textes
longs avant d'en tronquer un, et resserre ses espacements plutôt que de
laisser déborder une colonne.

## Compatibilité

CTS Dashboard est conçu exclusivement pour **iPhone** et pour le **widget
grand format de Scriptable**.

| Ce qui est visé | Détail |
|---|---|
| **iOS 18** | sur les iPhone qui en restent à cette branche, dont XR, XS et XS Max |
| **iOS 26 et suivants** | sur le matériel qui les reçoit, à partir de l'iPhone 11 et de l'iPhone SE 2<sup>e</sup> génération |
| **Scriptable** | à jour, ce qui suppose iOS 15.5 ou ultérieur |
| **iCloud Drive** | activé pour Scriptable |
| **Internet** | requis pour l'installation, les mises à jour et la réparation des ressources — jamais pour l'affichage |

Les versions bêta d'iOS ne constituent pas une cible de garantie. Elles
peuvent être testées, mais la compatibilité officielle vise les versions
publiques récentes.

## Installation

### 1. Obtenir CTS Installer

Rien ne s'installe à la main : un seul script, **CTS Installer**, met tout
le reste en place. Il se reçoit de deux façons, au choix.

| Source | Comment |
|---|---|
| **Le mainteneur** | il envoie le fichier `CTS Installer.scriptable` |
| **Un collègue** | qui a déjà le projet peut partager le même fichier depuis son iPhone |

Dans les deux cas, la mise en place est identique : ouvrir le fichier reçu,
puis **Partager → Scriptable → Add to My Scripts**.

### 2. Installer le Dashboard

1. Installer **Scriptable** depuis l'App Store et l'ouvrir une première fois.
2. Ajouter `CTS Installer.scriptable` à Scriptable, comme ci-dessus.
3. Dans Scriptable, exécuter **CTS Installer**.
4. Choisir **Installer la version disponible** et attendre la validation
   complète — l'écran doit finir sur `22/22 fichiers valides`.

> [!TIP]
> Si CTS Installer annonce une version plus récente **de lui-même**, il la
> propose avant tout le reste : acceptez, puis fermez l'écran. Il se rouvre
> seul et poursuit l'installation du Dashboard.

### 3. Ajouter le widget

1. Sur l'écran d'accueil : **Modifier → Ajouter un widget**.
2. Choisir **Scriptable**, format **grand**.
3. Configurer le widget avec **Script : CTS Dashboard** et
   **When Interacting / Open App : Run Script**.

Selon la version d'iOS, le bouton de modification de l'écran d'accueil
porte un libellé ou une icône différente. La procédure qui vaut dans tous
les cas est **Modifier → Ajouter un widget**. Pour reconfigurer un widget
déjà en place : **appui long sur le widget → Modifier le widget**.

## Au quotidien

### Déposer un service

Enregistrer la carte d'agent PDF dans :

```text
iCloud Drive
└── Scriptable
    └── CTS Dashboard
        └── Services
```

Plusieurs cartes peuvent être déposées à l'avance. CTS Dashboard importe et
sélectionne automatiquement le service correspondant à la date utile.

Trois tutoriels détaillent ce dépôt selon le navigateur qui a servi à
télécharger la carte :

| Navigateur | Tutoriel |
|---|---|
| Safari | [Ouvrir le tutoriel](https://www.icloud.com/notes/03b7ney7MO0qzOmwsNGz19FGg) |
| Google | [Ouvrir le tutoriel](https://www.icloud.com/notes/0e4kWSTPvql3PyV_V62pH1lFg) |
| Brave | [Ouvrir le tutoriel](https://www.icloud.com/notes/052duaGDd5AYQILjAeLPS067g) |

### Retirer un service

Quand un service change au dernier moment, l'ancien peut être retiré de
deux façons.

**Supprimer la carte d'agent du dossier `Services` suffit.** CTS Dashboard
le constate, retire le service et efface les fichiers qu'il avait produits.
Il patiente une heure avant de conclure, le temps de distinguer une
suppression volontaire d'un fichier qu'iCloud n'a pas encore synchronisé.

**Pour un retrait immédiat**, exécuter **CTS Installer** puis **Retirer un
service** : la liste indique le service affiché en ce moment, et demande
confirmation avant de supprimer.

Dans les deux cas, seuls les fichiers du service retiré sont supprimés. Les
autres services et les archives ne sont pas touchés.

### Structure créée automatiquement

Aucun de ces dossiers n'est à créer soi-même, et un seul se manipule :
`Services`.

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

## Mises à jour

Relancer **CTS Installer** puis choisir **Mettre à jour** ou **Vérifier les
fichiers**. L'Installer compare les 22 fichiers distribués au snapshot
GitHub courant et conserve les PDF, les archives et les données protégées.

### Deux règles, volontairement différentes

Deux mécanismes encadrent les versions, et ils ne suivent pas la même
logique.

> [!IMPORTANT]
> **Dans CTS Installer, la mise à jour est obligatoire.** Si une version
> plus récente existe, l'installateur la propose avant tout le reste et le
> menu n'est pas accessible tant qu'elle n'est pas faite.

Le **Diagnostic** reste joignable sans mettre à jour : c'est la procédure
d'assistance du projet, et elle doit rester utilisable même quand c'est la
mise à jour qui échoue.

**Dans le widget, seul un plancher bloque.** `minimumDashboard`, dans
[`version.json`](version.json), fixe la version en dessous de laquelle le
widget cesse d'afficher un service et demande une mise à jour. Une version
simplement en retard continue de fonctionner : couper un conducteur en
service parce qu'une correction vient de paraître n'aurait pas de sens.

Le widget ne consulte jamais le réseau pour en décider. Il lit une politique
déposée par l'appel d'activité quotidien, et **l'absence de réponse ne
bloque jamais** : sans réseau, sans politique connue ou à la première
installation, il fonctionne normalement.

### Réparer un installateur bloqué

Si CTS Installer s'arrête sur **Opération impossible** avant d'avoir affiché
sa liste de fichiers, c'est l'installateur lui-même qui est en cause, et il
ne peut pas se remplacer tout seul. Le script **CTS Repair** existe pour ce
seul cas :

1. ouvrir le fichier [`CTS Repair.js`](CTS%20Repair.js) du dépôt, puis
   **Partager → Scriptable → Add to My Scripts** ;
2. exécuter **CTS Repair** : il télécharge la version publiée de CTS
   Installer, la contrôle et la réécrit ;
3. relancer **CTS Installer**, choisir **Vérifier les fichiers** ;
4. supprimer **CTS Repair**, devenu inutile.

CTS Repair ne touche à aucune donnée : ni PDF, ni archives, ni index. Il
refuse d'installer un fichier incomplet ou porteur du même défaut, et remet
l'ancien installateur en place si l'écriture échoue.

## En cas de problème

### Dépannage rapide

| Ce qui se passe | Quoi faire |
|---|---|
| Le widget affiche « aucun service » alors qu'une carte est déposée | attendre qu'iCloud finisse de synchroniser le PDF, puis toucher le widget pour le relancer |
| Le widget demande une mise à jour | lancer CTS Installer et l'accepter : la version installée est passée sous le plancher |
| CTS Installer refuse de se lancer, ou s'arrête sur « Opération impossible » | [réparer un installateur bloqué](#réparer-un-installateur-bloqué) |
| Une carte d'agent n'est jamais importée | vérifier qu'elle est bien dans `Services`, puis lancer **Diagnostic** |
| Un service retiré réapparaît | la carte est encore dans `Services` : la supprimer, ou passer par **Retirer un service** |
| Un refus temporaire de GitHub pendant une mise à jour | couper le Wi-Fi, puis relancer CTS Installer |

### Diagnostic

Quand le dépannage rapide ne suffit pas :

1. exécuter **CTS Installer** ;
2. ouvrir **Diagnostic** ;
3. copier le rapport technique ;
4. transmettre ce rapport dans le canal d'assistance du projet.

Le rapport est conçu pour exclure le nom du conducteur, le matricule, les
horaires, le numéro de service et le contenu des PDF. Il peut donc être
transmis tel quel, sans relecture.

### Où obtenir de l'aide

L'assistance passe par le groupe WhatsApp du projet, celui-là même où sont
publiées les notes de chaque version. Un rapport de diagnostic y suffit
presque toujours à identifier la panne.

## Données et confidentialité

Le widget adresse trois appels à un serveur tenu par le mainteneur. Cette
section dit exactement ce qu'ils emportent, parce qu'un dépôt public destiné
à des collègues n'a pas à le laisser deviner.

### Ce qui sort du téléphone

| Donnée | Quand | Ce que c'est |
|---|---|---|
| `installationId` | à chaque appel | un identifiant tiré au hasard à la première exécution et conservé dans le Keychain. Il ne dit rien de l'appareil ni de son propriétaire. |
| `dashboardVersion` | à chaque appel | la version installée |
| `iosMajorVersion` | à chaque appel | le numéro majeur d'iOS — `18`, `26` — jamais la version complète |
| `driverName`, `driverId` | avec la télémétrie, **depuis la 1.4.0** | le nom et le matricule **tels que la carte d'agent les porte** |
| Le déroulé de l'exécution | à chaque exécution du widget | son état — réussite, avertissement, erreur —, sa durée, et l'issue de cinq étapes : lecture du PDF, analyse, sélection, rendu, archivage |
| Les incidents | quand il y en a | un code (`PDF_NOT_FOUND`), un module, une étape, une gravité. Jamais de message libre, jamais de texte saisi. |

> [!IMPORTANT]
> Le nom et le matricule ne sont **demandés à personne** : ils sont lus sur
> la carte d'agent, que le widget lit déjà. Ils n'avaient jamais quitté
> l'iPhone avant la 1.4.0 ; ils l'accompagnent désormais pour que la console
> du mainteneur nomme un collègue au lieu de le désigner par un code. Un
> poste qui n'importe plus de carte n'en transmet aucun.

### Ce qui n'en sort jamais

Les horaires, le numéro de service, les lignes, les arrêts, le contenu de la
carte d'agent, les archives, la position de l'appareil, et le contenu du
Keychain.

### À quel rythme

| Appel | Quand |
|---|---|
| `/register` | une fois, à la première exécution, puis seulement si le jeton local est perdu |
| `/activity` | une fois par jour au plus, avec au moins une heure entre deux tentatives échouées |
| `/telemetry` | à chaque exécution du widget |

Aucun de ces appels n'est bloquant : un serveur injoignable ne retarde ni
n'empêche l'affichage. C'est aussi par la réponse de `/register` et de
`/activity` que voyage la politique de version — donc sans un seul appel
réseau supplémentaire.

## Numéros de version

Deux numéros vivent dans [`version.json`](version.json), et ils n'ont pas le
même métier. Augmenter l'un d'eux, c'est publier : CTS Installer compare le
numéro du manifeste à celui qui est installé, et n'agit que s'il a monté. Un
fichier modifié sans numéro nouveau reste dans le dépôt et n'atteint aucun
iPhone.

Un numéro publié désigne un seul état des fichiers, définitivement. Une
correction qui arrive après coup prend un numéro neuf, même si elle tient en
une ligne : la 1.1.2 a été publiée deux fois avec deux comportements
différents, et un numéro qui en désigne deux ne vaut rien dans un rapport de
diagnostic.

### `version` — le Dashboard

C'est le numéro qui parle : il s'affiche dans le Diagnostic, voyage avec la
télémétrie, et le serveur le sert comme dernière version publiée.

**Le correctif est le cas normal.** Une correction, un plantage, une
lenteur, une mise en page reprise, un libellé faux, une information de plus
à lire : tout monte d'un cran par défaut.

**Le mineur monte dans quatre cas**, et seulement ceux-là :

| Cas | Précédent |
|---|---|
| le conducteur peut faire ce qu'il ne pouvait pas | 1.2.0, retirer un service |
| il doit apprendre un geste, ou en perd un | 1.1.0, toucher le widget après avoir déposé une carte |
| ce qui sort du téléphone change de nature | 1.4.0, le nom et le matricule partent avec la télémétrie |
| un verrou écrit auparavant atteint les téléphones | 1.3.0, un contrôle n'existe que dans la version qui le porte |

**Le majeur n'a jamais bougé.** C'est la version dont la publication éteint
des installations en service : celle qu'accompagne un `minimumDashboard`
relevé au-dessus de ce que des collègues utilisent encore.

La taille du changement ne décide de rien. Trois publications d'affilée ont
repris le bloc du bas du widget sans quitter le correctif. Nommer
l'intervalle entre deux tranches en est resté un aussi : le conducteur y
gagne à lire, pas à faire. Et revenir à l'habitude d'avant reste un
correctif — la 1.1.1 a annulé le geste que la 1.1.0 demandait.

### `installerVersion` — CTS Installer

C'est un numéro qui livre. Son seul rôle est de déclencher le remplacement
de l'installateur par lui-même : il monte d'un cran chaque fois que
`CTS Installer.js` change, sans mineur ni majeur. Seize publications l'ont
fait ainsi, dont la reconstruction complète des trois écrans d'accueil et la
suppression du bouton qui permettait de refuser une mise à jour.

Quand un changement doit être annoncé, c'est `version` qui l'annonce : la
1.3.0 a annoncé la mise à jour obligatoire pendant que la 1.0.21 se
contentait de la livrer. Un changement qui touche les deux fait monter les
deux dans le même commit.

### Les planchers

`minimumDashboard` et `minimumInstaller` ne suivent pas le rythme des
versions, et ne bougent jamais dans le commit qui en publie une.

Le premier ne monte que pour éteindre, donc avec une majeure. Le second
monte quand une version d'installateur devient incapable de faire son
travail — une seule fois jusqu'ici, à 1.0.23, le jour où la mise à jour est
devenue obligatoire.

### Qui décide, et quand le numéro s'écrit

Le mainteneur décide de chaque numéro. Le numéro s'écrit au moment de
publier, jamais au moment de coder, et toujours à deux endroits dans le même
commit — `version.json` et `CTS Config.js`, ou `version.json` et
`CTS Installer.js`. La validation refuse qu'ils divergent.

Un changement qui se juge sur le dépôt porte son numéro dans la même pull
request. Un changement qui se juge sur l'appareil — un rendu, une mise en
page, un écran — en demande deux : la première change le code sans toucher à
aucun numéro, la seconde n'écrit que le numéro, une fois le rendu vérifié
sur un iPhone. Entre les deux, `main` contient du code non publié, et c'est
l'état normal d'un travail en attente de vérification.

Chaque numéro publié donne lieu à un message pour la communauté, écrit selon
le gabarit de [`MESSAGES.md`](MESSAGES.md).

## Contenu du dépôt

Ce dépôt est **public** et ne contient que ce qui est destiné aux
conducteurs.

### Ce qui est distribué

| | |
|---|---|
| **22 fichiers distribués** | 17 scripts + 5 ressources, listés dans [`version.json`](version.json), installés par CTS Installer |
| **`CTS Installer.js`** | téléchargé depuis l'URL brute, se met à jour lui-même, hors manifeste |
| **`CTS Repair.js`** | remplace un installateur bloqué, installé à la main en cas de besoin |
| **`tools/preview/`** | bancs d'essai et outils de mesure, exécutés hors iPhone |
| **`.github/`** | la validation et le workflow qui la lance |
| **`LICENSE`** | la licence MIT du projet |

<details>
<summary>Les 22 fichiers, et ce que chacun fait</summary>

| Fichier | Rôle |
|---|---|
| `CTS Dashboard.js` | point d'entrée du widget |
| `CTS Config.js` | chemins, arborescence, constantes partagées et `DASHBOARD_VERSION` |
| `CTS Widget Engine.js` | assemble le contexte affiché et décide du prochain rafraîchissement |
| `CTS Widget Renderer.js` | dessine le widget, et choisit sa densité |
| `CTS Widget Theme.js` | palettes et couleurs, un jeu par état |
| `CTS Importer.js` | façade de l'import : délègue au pipeline, lit l'index courant |
| `CTS Import Pipeline.js` | enchaîne lecture, analyse, validation et rangement d'une carte |
| `CTS PDF Engine.js` | lit le PDF, en s'appuyant sur PDF.js |
| `CTS Parser.js` | extrait de la carte HASTUS le service, ses tranches et son conducteur |
| `CTS Service.js` | un service et ses tranches : état courant, statistiques, interruptions |
| `CTS Services Manager.js` | détecte les cartes déposées, tient l'index, choisit le service utile |
| `CTS Services Cleaner.js` | archive, purge, retire un service, classe les résidus d'écriture |
| `CTS Database.js` | résout les codes en noms de lignes, arrêts et lieux |
| `CTS Storage.js` | lit et écrit dans iCloud avec nouvelles tentatives ; porte aussi les préférences et la politique de version |
| `CTS Utils.js` | primitives partagées : temps, dates, texte, et les attentes bornées |
| `CTS Resources.js` | vérifie que les bases et PDF.js sont bien en place |
| `CTS Analytics Client.js` | les trois appels réseau, et eux seuls |
| `lines.json` | noms des lignes |
| `stops.json` | noms des arrêts |
| `places.json` | noms des lieux du bandeau horaires |
| `pdf.min.mjs` | PDF.js |
| `pdf.worker.min.mjs` | PDF.js, moteur de lecture |

</details>

### Les documents de travail

| Fichier | Ce qu'il porte |
|---|---|
| [`DECISIONS.md`](DECISIONS.md) | une ligne datée par décision structurante, et sa raison |
| [`TEST_PLAN.md`](TEST_PLAN.md) | la validation minimale avant diffusion d'une version |
| [`MESSAGES.md`](MESSAGES.md) | le gabarit des messages de publication, et quand ils sont dus |
| [`CLAUDE.md`](CLAUDE.md) | les consignes de travail dans ce dépôt |
| [`tools/preview/CALIBRATION.md`](tools/preview/CALIBRATION.md) | ce que le banc de prévisualisation reproduit fidèlement, et ce qu'il ne reproduit pas |

### Ce qui ne figure pas dans ce dépôt

Les outils de maintenance du mainteneur — console de statistiques,
simulateur, éditeur de base, testeur PDF — **n'y sont pas**. Ils vivent
ailleurs. [`.gitignore`](.gitignore) les ignore et
[`validate.mjs`](.github/scripts/validate.mjs) échoue si l'un d'eux
réapparaît : un dépôt public publie définitivement ce qu'on y met,
l'historique Git compris.

Cette séparation ne protège aucun secret, car il n'y en a aucun dans ces
outils. La capacité d'administration tient à une clé conservée dans le
Keychain du mainteneur et vérifiée par le serveur : sans elle, l'API de
statistiques répond 401, quel que soit le code exécuté.

## Vérifications automatiques

Tout est rejoué par
[le workflow de validation](.github/workflows/validate.yml) à chaque poussée
et à chaque pull request. Les mêmes commandes tournent en local.

### La validation statique

```bash
node .github/scripts/validate.mjs
```

Elle contrôle le manifeste, la syntaxe, les métadonnées Scriptable, la
cohérence des versions, l'ordre des planchers, les libellés d'arrêts, le
contraste de la palette et l'absence d'outil de maintenance.

Deux de ces contrôles méritent d'être connus. Le **contraste** est mesuré
dans le pire cas de chaque état — le coin le plus clair du dégradé, sous le
voile d'une carte — parce que le widget se lit debout, dehors, souvent en
plein soleil. Le contrôle du **point d'entrée** refuse une constante
déclarée après l'appel de premier niveau : la syntaxe est valide, mais la
constante reste inaccessible à l'exécution, et ce piège a déjà tué
l'installateur 1.0.7 sur l'iPhone d'un collègue.

### Les dix-sept bancs d'essai

Ils complètent la CI parce qu'une vérification statique ne voit pas ce qui
casse à l'exécution. **Chacun est né d'un défaut réel.**

<details>
<summary>Les dix-sept bancs, et ce que chacun empêche</summary>

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
| `interruption-smoke` | une interruption nommée « pause » par le programme et « coupure » par la pastille d'état |
| `version-gate-smoke` | un widget bloqué à tort parce qu'il est hors ligne, ou qu'un plancher a été publié de travers |
| `database-smoke` | un arrêt affiché sous forme de code |
| `layout-smoke` | une grille horaires qui déborde selon l'appareil |
| `utils-smoke` | une attente sans borne, une date jugée valide par un seul module |
| `installer-smoke` | une constante inaccessible à l'exécution |
| `repair-smoke` | un dépannage qui laisse l'iPhone sans installateur |
| `telemetry-smoke` | un jour de repos compté comme une panne dans le taux de succès de la flotte |
| `pdf-engine-smoke` | un fichier que personne ne lit qui empêche toute lecture de carte agent |

</details>

Chacun se lance seul, par exemple :

```bash
node tools/preview/modules-smoke.mjs
```

### Les outils qui ne sont pas des bancs

Trois outils du même dossier ne tournent pas en CI : ils s'exécutent à la
demande et **ne doivent pas être pris pour des fichiers orphelins** — rien
ne les référence parce que ce sont des points d'entrée.

| Outil | Usage |
|---|---|
| `preview.mjs` | rend les états du widget en images, pour juger le rendu sans iPhone |
| `installer.mjs` | rend les pages de CTS Installer de la même façon |
| `installer-bench.mjs` | mesure une installation complète : requêtes, octets, temps |

## Licence et auteur

**Emilio IPPOLITO** — projet développé et maintenu indépendamment.

Publié sous licence MIT, dont le texte figure dans [`LICENSE`](LICENSE). Le
choix de cette licence tient d'abord à ce qu'elle dit du risque : le
logiciel est fourni **sans aucune garantie**, ce qu'un outil consulté avant
une prise de service doit énoncer noir sur blanc.

`pdf.min.mjs` et `pdf.worker.min.mjs` sont deux fichiers de **PDF.js**,
distribués tels quels sous licence Apache 2.0 par la Mozilla Foundation. Ils
gardent la leur : la licence de ce dépôt ne couvre pas ce qu'il redistribue.
