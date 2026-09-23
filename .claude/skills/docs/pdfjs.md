# PDF.js — contraintes vérifiées

Chaque entrée porte sa citation, son adresse et la date de lecture. Ce
qui est ici a déjà été vérifié : n'y retourne que si la date est vieille
ou si le doute porte sur autre chose.

## Le build `legacy` s'adresse aux environnements en retard

> « For usage with older browsers/environments, without native support
> for the latest JavaScript features, please see the `legacy/` folder. »

`registry.npmjs.org/pdfjs-dist` — fichier `README` du paquet publié ·
lu le 18/09/2026

C'est ce qui justifie `/legacy/build` dans `PDFJS_BASE_URL`. La carte
agent se lit dans une WebView servie par iOS, et le dépôt vise encore
iOS 18 : rien ne garantit que le build moderne y trouve ce qu'il
suppose.

Le correctif maison de `CTS PDF Engine.js:757` ne vient pas de cette
page : il est né d'une panne constatée, et complète l'itération
asynchrone sur `ReadableStream`. Aucune documentation PDF.js ne dit
qu'elle est requise. C'est un constat du projet, pas une citation.

## Les deux fichiers vont ensemble, et un seul s'inclut

> « Both scripts are needed but only `pdf.js` needs to be included since
> `pdf.worker.js` will be loaded by `pdf.js`. »

`github.com/mozilla/pdf.js` — fichier `README.md` de la branche
`master` · lu le 18/09/2026

Le moteur installe donc bien les deux, mais c'est la bibliothèque qui
réclame son worker. Les deux doivent venir du même paquet : rien ne
promet qu'une bibliothèque 6.1 sache parler à un worker d'une autre
version, et la documentation ne l'aborde pas.

## La version figée existe toujours, une plus récente aussi

`pdfjs-dist@6.1.200` est publié et téléchargeable. La version portant
l'étiquette `latest` est **6.3.289**.

`registry.npmjs.org/pdfjs-dist` · relevé le 18/09/2026

Mesure, pas citation : les deux nombres viennent du registre npm
interrogé directement, pas d'une page de documentation.

## Le moteur ne revérifie jamais la version installée

Constat de lecture du dépôt, non documenté ailleurs :
`isValidLibraryFile` — `CTS PDF Engine.js:144` — ne contrôle que deux
choses, l'existence du fichier et sa taille minimale de 40 Ko. Le
numéro de version n'entre nulle part dans la décision.

Conséquence : changer `PDFJS_VERSION` ne change rien sur un iPhone où
la bibliothèque est déjà posée. Le fichier existe, il est assez gros,
il est gardé. Seuls trois gestes y touchent aujourd'hui — une
installation neuve, une réparation, ou un fichier perdu.

`writeEngineMetadata` — `CTS PDF Engine.js:239` — écrit pourtant la
version installée dans un fichier de métadonnées, mais son commentaire
dit que rien ne le lit : « Ce fichier n'est lu par personne ».
