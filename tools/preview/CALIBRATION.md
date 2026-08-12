# Banc de prévisualisation — portée et limites

## À quoi il sert

`node tools/preview/preview.mjs <dossier>` charge le **vrai**
`CTS Widget Renderer.js` et son thème dans un contexte muni d'une émulation
de l'API Scriptable, construit plusieurs services réalistes, produit la mise
en page et en fait une capture avec Chromium.

`PREVIEW_MODE=measure` remplace la capture par une mesure de la hauteur
occupée, comparée à la hauteur réelle du widget « large ».

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

## Comment s'en servir malgré tout

**En différentiel, jamais en absolu.** On mesure avant la modification, on
mesure après, et on compare. Une hauteur qui n'augmente pas ne peut pas
introduire de rognage là où il n'y en avait pas ; une hauteur qui augmente
de N points doit être justifiée par la marge réellement observée sur
iPhone.

Le sens de l'erreur joue en notre faveur : le banc étant pessimiste, une
modification qu'il valide est sûre.

## Ce qui reste à confirmer sur iPhone

Tout ce qui touche à la métrique fine du texte : longueur exacte à laquelle
un nom d'arrêt commence à se réduire, et hauteur totale sur les petits
écrans. Une capture d'écran reste le seul juge.
