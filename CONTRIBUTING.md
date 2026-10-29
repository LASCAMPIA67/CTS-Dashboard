# Contribuer

Ce dépôt est public parce que les conducteurs qui installent CTS Dashboard
doivent pouvoir lire ce qui tourne sur leur iPhone. Il n'est pas ouvert aux
contributions de code : un seul mainteneur le tient, et tout ce qui y est
publié part sur des téléphones consultés avant une prise de service.

Ce fichier dit donc d'abord où aller. Il décrit ensuite comment le dépôt se
tient : ses [numéros de version](#numéros-de-version) et ses
[vérifications automatiques](#vérifications-automatiques).

## Vous êtes conducteur, et quelque chose ne marche pas

N'ouvrez pas d'issue ici. Le chemin est plus court et plus sûr :

1. le **dépannage rapide** du [README](README.md#en-cas-de-problème) règle
   la plupart des cas ;
2. sinon, **CTS Installer → Diagnostic**, puis copier le rapport ;
3. transmettre ce rapport dans le groupe WhatsApp du projet.

Le rapport de diagnostic est conçu pour ne contenir ni votre nom, ni votre
matricule, ni vos horaires, ni le contenu de vos PDF. Il se transmet tel
quel, sans relecture.

## Vous passez par là, et vous avez vu quelque chose

Une issue est bienvenue. Dites ce que vous avez vu et où, plutôt que ce
qu'il faudrait faire : le contexte du projet — un widget Scriptable, des
cartes d'agent HASTUS, vingt-quatre utilisateurs — décide souvent de la
réponse.

Une pull request non annoncée a peu de chances d'être fusionnée telle
quelle. Ouvrez une issue d'abord.

## Vous avez trouvé une faille

Elle ne s'écrit pas dans une issue. [`SECURITY.md`](SECURITY.md) dit par où
la signaler.

## Si une pull request est ouverte quand même

Elle part du [gabarit du dépôt](.github/pull_request_template.md), qui
rappelle ce que fusionner déclenche, et la validation doit passer au vert :
les commandes sont listées plus bas, dans
[Vérifications automatiques](#vérifications-automatiques).

Deux règles ne se négocient pas, et la validation les fait respecter :
aucun secret n'entre dans le dépôt, et aucun outil de maintenance du
mainteneur n'y réapparaît. Un dépôt public publie définitivement ce qu'on y
met, l'historique Git compris.

## Numéros de version

Deux numéros vivent dans [`version.json`](version.json), et ils n'ont pas le
même métier. Augmenter l'un d'eux, c'est publier : CTS Installer compare le
numéro du manifeste à celui qui est installé pour proposer une mise à jour.
Un fichier modifié sans numéro nouveau atteint tout de même les iPhone, mais
sans rien annoncer : à la prochaine opération de CTS Installer, vérification
comprise, dès que la révision du dépôt a bougé.

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
`CTS Installer.js` change, sans mineur ni majeur. La reconstruction complète
des trois écrans d'accueil, comme la suppression du bouton qui permettait de
refuser une mise à jour, ne l'ont fait monter que d'un cran.

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

### Les Releases

Chaque numéro publié a sa
[Release](https://github.com/LASCAMPIA67/CTS-Dashboard/releases), que
[le workflow des Releases](.github/workflows/release.yml) publie dès que la
fusion arrive sur `main`, sans autre geste :

| Numéro | Tag | Titre |
|---|---|---|
| `version` | `v1.4.8` | CTS Dashboard 1.4.8, marquée « Latest » |
| `installerVersion` | `installer-v1.0.33` | CTS Installer 1.0.33 |

Seule celle du Dashboard porte « Latest » : GitHub donne cette étiquette à
la dernière Release publiée, et une version de l'installateur la prendrait
sinon à celle qui parle.

Le tag est posé sur le commit de `main` où le numéro est arrivé, et désigne
l'état que ce numéro a publié. Un correctif fusionné ensuite sans numéro
atteint les iPhone sans figurer dans la Release.

Les Releases du dépôt sont immuables depuis le 29 octobre 2026 : une fois
publiée, une Release garde son tag, qui ne se déplace ni ne se supprime, et
un nom de tag ne resert jamais, même après suppression. Seuls son titre et
sa note restent modifiables. Les deux Releases du rattrapage, publiées
avant ce réglage, ne le sont pas.

La note commence par le message pour la communauté, tel qu'il part sur
WhatsApp. GitHub y ajoute la liste des pull requests fusionnées depuis la
Release précédente du même numéro. Le message s'écrit donc dans la pull
request qui écrit le numéro, sous `messages/` — `MESSAGES.md` dit sous quel
nom —, et la validation refuse un numéro sans le sien : après la fusion, il
serait trop tard, le numéro étant déjà parti.

Une Release ne livre rien. CTS Installer lit la révision de `main`, jamais un
tag : une Release en échec ne retarde aucune mise à jour. Elle se relance
depuis l'onglet Actions, par « Run workflow », et le workflow ne publie que
ce qui manque aux numéros en cours. Une Release qu'un numéro suivant a déjà
dépassée ne se rattrape plus par lui.

Le suivi commence à CTS Dashboard 1.4.8 et CTS Installer 1.0.33, les numéros
en service le jour où il a été mis en place. Les précédents n'ont pas de
Release : leur histoire se lit dans Git, et elle compte des numéros publiés
deux fois. Le message de l'installateur 1.0.33, qui n'avait pas été
conservé, est reconstitué, et le dit en tête.

## Vérifications automatiques

Tout est rejoué par
[le workflow de validation](.github/workflows/validate.yml) à chaque poussée
et à chaque pull request : la validation statique, puis les vingt bancs
d'essai. Les mêmes commandes tournent en local, avec Node 26.

Les actions de ces workflows sont épinglées à un commit, qui ne bouge
jamais seul. Le premier de chaque mois, Dependabot propose de les relever,
toutes dans une même pull request. La fusionner fait bouger la révision
comme toute autre fusion : à sa prochaine opération, CTS Installer
retélécharge chez chaque collègue les fichiers du manifeste, identiques à
ceux qu'il a déjà. C'est pourquoi la relève n'a lieu qu'une fois par mois.

### La validation statique

```bash
node .github/scripts/validate.mjs
```

Elle contrôle le manifeste, la syntaxe, les métadonnées Scriptable, la
cohérence des versions, l'ordre des planchers, le message de la dernière
publication, les libellés d'arrêts, le contraste de la palette, la taille
minimale de PDF.js, la même partout, et l'absence d'outil de maintenance.

Deux de ces contrôles méritent d'être connus. Le **contraste** est mesuré
dans le pire cas de chaque état — le coin le plus clair du dégradé, sous le
voile d'une carte — parce que le widget se lit debout, dehors, souvent en
plein soleil. Le contrôle du **point d'entrée** refuse une constante
déclarée après l'appel de premier niveau : la syntaxe est valide, mais la
constante reste inaccessible à l'exécution, et ce piège a déjà tué
l'installateur 1.0.7 sur l'iPhone d'un collègue.

### Les vingt bancs d'essai

Ils complètent la CI parce qu'une vérification statique ne voit pas ce qui
casse à l'exécution. **Chacun est né d'un défaut réel.**

<details>
<summary>Les vingt bancs, et ce que chacun empêche</summary>

| Banc | Ce qu'il empêche |
|---|---|
| `modules-smoke` | une fonction appelée d'un module à l'autre, ou empruntée par CTS Installer, qui n'existe pas |
| `dashboard-smoke` | un widget blanc, vide, ou rendu dans une taille non prévue, un réveil trop tardif en service ou après une panne |
| `scan-smoke` | une carte agent détectée mais jamais importée, un verrou écrit dans iCloud, une carte lue de travers jamais relue, ou relue à chaque réveil |
| `selection-smoke` | le mauvais service retenu à cheval sur minuit |
| `storage-smoke` | un fichier lisible qu'iCloud refuse de confirmer, une écriture interrompue ou posée incomplète, un journal d'import qui perd son histoire, une patience iCloud trop courte ou trop longue pour un widget, un verrou périmé qui bloque encore, un index qu'iCloud n'a pas encore rendu annoncé corrompu |
| `cleanup-smoke` | un PDF jamais archivé, un cache effacé trop tôt, un service importé pendant l'entretien effacé de l'index |
| `residue-smoke` | une copie de sécurité orpheline effacée alors qu'elle était le dernier exemplaire |
| `removal-smoke` | un service retiré qui emporte les fichiers d'un autre, ou qu'iCloud fait disparaître à tort, un service importé pendant le retrait qui disparaît avec lui |
| `interruption-smoke` | une interruption nommée « pause » par le programme et « coupure » par la pastille d'état, un service d'après minuit mal compté, un tram dessiné comme un bus |
| `version-gate-smoke` | un widget bloqué à tort parce qu'il est hors ligne, ou qu'un plancher a été publié de travers |
| `database-smoke` | un arrêt affiché sous forme de code, une ligne de tram oubliée |
| `parser-smoke` | une tranche disparue sans un mot, un arrêt ignoré parce que son heure lui est collée, un pied de page affiché comme direction, l'arrêt de relève à la place du terminus, ou la direction d'une tranche donnée à la suivante quand la voiture est la même |
| `import-smoke` | une étape d'import qui n'a pas tourné rapportée « 0 ms » dans le Diagnostic, un lieu inconnu perdu entre la carte et le widget |
| `layout-smoke` | une grille horaires qui déborde selon l'appareil |
| `utils-smoke` | une attente sans borne, une date jugée valide par un seul module |
| `installer-smoke` | une constante inaccessible à l'exécution, un Diagnostic ou un retrait de service coupé par une fonction retirée d'un module, une limite de GitHub prise pour une coupure réseau, ou retentée avant la pause qu'il demande |
| `repair-smoke` | un dépannage qui laisse l'iPhone sans installateur, ou avec un installateur tronqué |
| `telemetry-smoke` | un jour de repos compté comme une panne dans le taux de succès de la flotte |
| `pdf-engine-smoke` | un fichier que personne ne lit qui empêche toute lecture de carte agent, un moteur qui attend iCloud plus longtemps que le reste du widget |
| `incident-smoke` | une même panne rapportée deux fois, sous deux codes et à deux gravités, un lieu inconnu qui ne remonte pas ou qui emporte son code, un index en attente d'iCloud présenté comme une carte agent en cause |

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
| `preview.mjs` | rend les états du widget en images, pour juger le rendu sans iPhone, et fabrique les images du README |
| `installer.mjs` | rend les pages de CTS Installer de la même façon |
| `installer-bench.mjs` | mesure une installation complète : requêtes, octets, temps |

Les images du README se refabriquent ainsi, quand le rendu du widget a
changé :

```bash
PREVIEW_MODE=images PREVIEW_SCREENS="Pro Max" \
PREVIEW_SCENARIOS="En service · 2 tranches|Avant le service · 2 tranches|Pause · 2 tranches|Coupure · 2 tranches|Service terminé · 2 tranches|Service dans 3 jours · 2 tranches|Carte agent en attente · 2 tranches" \
node tools/preview/preview.mjs docs/images
```

Ce mode exige Chromium et les polices Inter et JetBrains Mono, et refuse
d'écrire une image sans elles. Ce qu'il reproduit, et ce qu'il ne reproduit
pas, est dit dans [`CALIBRATION.md`](tools/preview/CALIBRATION.md).

Tous, bancs et outils, montent leur bac à sable par `sandbox.mjs` : le
langage, une console muette, un `Timer` conforme à Scriptable, et les
façons d'exécuter un script. Une doublure fausse s'y corrige une fois pour
tous.

`references.mjs` porte la règle qui vérifie ce qu'un script emprunte aux
modules. `modules-smoke` l'applique aux modules et à CTS Installer, et elle
vaut aussi pour les outils du mainteneur, qui vivent ailleurs : ils
empruntent aux mêmes modules, et une seconde copie de la règle finirait par
ne plus voir la même chose.
