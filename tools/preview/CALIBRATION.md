# Banc de prévisualisation — portée et limites

## À quoi il sert

`node tools/preview/preview.mjs <dossier>` charge le **vrai**
`CTS Widget Renderer.js` et son thème dans un contexte muni d'une émulation
de l'API Scriptable, construit plusieurs services réalistes, produit la mise
en page et en fait une capture avec Chromium.

`PREVIEW_MODE=measure` remplace la capture par une mesure de la hauteur
occupée, comparée à la hauteur réelle du widget « large ».

`PREVIEW_MODE=images` écrit une image par vignette, sans légende et
transparente hors des coins arrondis : ce sont les images du README.

Variables d'environnement : `PREVIEW_SCENARIOS`, `PREVIEW_SCREENS`
(séparateur `|`), `PREVIEW_LINE_HEIGHT`, `PREVIEW_TRACKING`.

## Ce qu'il reproduit fidèlement

- l'imbrication des piles, les ressorts souples et fixes, les largeurs
  imposées et leur propagation — c'est-à-dire **la géométrie** ;
- la symétrie, le centrage, l'alignement des colonnes ;
- la réduction de police avant troncature (`minimumScaleFactor`), mesurée
  après mise en page comme le fait iOS ;
- les couleurs, dégradés, rayons et bordures.

## Ce qu'il ne reproduit pas

**San Francisco n'existe pas dans cet environnement.** Le banc utilise
Liberation Sans, plus large et plus haute. Les hauteurs mesurées sont donc
**systématiquement surestimées** : le banc annonce un débordement là où
l'iPhone d'Emilio affiche le widget entier.

C'est vérifié : sur la capture réelle d'un service à trois tranches, le
widget tient ; le banc annonce 15 pt de marge sur Pro Max mais un
débordement sur les écrans plus petits, ce qu'aucun collègue n'a signalé.

**Le centrage dans une colonne ne se fait que par des ressorts.** Le banc a
déjà laissé passer une régression en production sur ce point, et elle
mérite d'être racontée : le bloc Travail / Amplitude de la 1.3.5 centrait
ses deux lignes avec `centerAlignContent()` sur une pile verticale de
largeur imposée, plus `centerAlignText()`. Le banc l'annonçait centré au
dixième de point près. Sur l'iPhone, les deux lignes étaient collées à
gauche de leur colonne.

Deux traductions du shim se combinaient pour produire cette fiction :
`centerAlignContent()` devenait `align-items:center`, dont l'axe est
horizontal quand la pile est verticale ; et `centerAlignText()` étirait le
texte à la largeur du parent avant de centrer les glyphes dedans. Les deux
sont désormais neutralisées dans une pile verticale, et le banc reproduit
le défaut — 120 pt d'asymétrie là où il annonçait 0.

La seule construction éprouvée sur appareil pour centrer dans une colonne
est donc `addCenteredLine`, qui enveloppe chaque ligne dans une pile
horizontale entre deux ressorts souples. C'est ce qu'emploient le bandeau
horaires et la colonne des horaires du programme, tous deux visiblement
centrés sur les captures.

## Comment s'en servir malgré tout

**En différentiel, jamais en absolu.** On mesure avant la modification, on
mesure après, et on compare. Une hauteur qui n'augmente pas ne peut pas
introduire de rognage là où il n'y en avait pas ; une hauteur qui augmente
de N points doit être justifiée par la marge réellement observée sur
iPhone.

Le sens de l'erreur joue en notre faveur : le banc étant pessimiste, une
modification qu'il valide est sûre.

## Les images du README

Elles ne servent pas à juger une mise en page, mais à montrer le widget à
qui ne l'a pas encore. La police des mesures leur nuisait : plus haute que
San Francisco, elle faisait rogner le bas d'un widget qui tient entier sur
le téléphone, et ses chiffres à chasse fixe ne ressemblaient pas à ceux de
l'iPhone.

Le mode `images` prend donc Inter et JetBrains Mono, et une hauteur de
ligne de 1,05 au lieu de 1,2. Le réglage vient d'une capture iPhone réelle
d'un service de deux tranches, en service, rejoué par le banc : à 1,2 le
contenu dépassait le cadre de 15 pt, à 1,05 il tient avec une marge, et
l'iPhone en garde encore davantage. Les proportions des blocs se lisent
alors comme sur la capture, et les chiffres ont une allure plus proche.

Ce que ce mode ne change pas : la mise en page, les couleurs et les
symboles sont ceux des mesures. Les symboles restent des silhouettes
dessinées pour le banc, les symboles SF n'existant pas hors iOS. Ce mode
ne mesure rien : une hauteur qui tient dans une image ne dit pas qu'elle
tient sur un petit écran.

## Ce qui reste à confirmer sur iPhone

Tout ce qui touche à la métrique fine du texte : longueur exacte à laquelle
un nom d'arrêt commence à se réduire, et hauteur totale sur les petits
écrans. Une capture d'écran reste le seul juge.
