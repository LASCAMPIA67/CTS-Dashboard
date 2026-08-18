# Messages de mise à jour

Modèle des messages envoyés dans la communauté WhatsApp à chaque
publication. Il existe parce que les premiers messages étaient trop longs :
un conducteur les lit sur un quai, entre deux services, sur un écran de
téléphone. S'il doit faire défiler pour savoir ce qui a changé, il ne le
lit pas.

La référence est celle des notes de version d'une application grand
public — App Store, Slack, Notion : **un titre, une phrase, trois points,
la marche à suivre.** Rien d'autre.

## Règles

1. **Une phrase de résumé** sous le titre. Elle dit le bénéfice, pas la
   cause. Un coup d'œil doit suffire.
2. **Trois points maximum**, un par changement visible. Chacun commence
   par deux ou trois mots en gras qui nomment la chose, puis une phrase.
   Un changement invisible pour le conducteur ne mérite pas un point.
3. **Aucune explication technique.** Ni cause, ni mécanisme, ni nom de
   fichier, ni « GitHub », ni « iCloud » sauf si le conducteur doit agir
   dessus. Le pourquoi appartient au message de commit, pas à WhatsApp.
4. **La marche à suivre reste entière** et numérotée. C'est la seule
   partie que personne ne doit avoir à deviner.
5. **Pas de retours à la ligne artificiels** : WhatsApp coupe les lignes
   selon la largeur de l'écran. Les sauts de ligne séparent les blocs,
   jamais les phrases.
6. **Pas de question.** Un message de mise à jour informe ; les questions
   se posent dans un message séparé.
7. **Ne jamais répéter** ce qu'un message précédent a déjà dit, sauf une
   ligne de rappel quand une version intermédiaire n'a pas été annoncée.
8. **Markdown WhatsApp** : `*gras*`, `_italique_`. Le message est livré
   dans un bloc de code, prêt à copier.

## Gabarit

```
*CTS DASHBOARD 1.0.X*

Une phrase qui dit ce que le conducteur y gagne.

✅ *Le changement* — Ce qu'il fait, en une phrase.
✅ *Le changement* — Ce qu'il fait, en une phrase.
✅ *Le changement* — Ce qu'il fait, en une phrase.

*METTRE À JOUR*
1. Ouvrez *Scriptable*
2. Lancez *CTS Installer*
3. _« Mettre à jour vers 1.0.X »_
4. Attendez _« 22/22 fichiers valides »_

Vos cartes agent et vos archives sont conservées.

_Une erreur ? Coupez le Wi-Fi, puis relancez CTS Installer._
```

La dernière ligne n'est là que tant que le refus temporaire de GitHub
peut se produire. Elle disparaîtra quand plus personne ne sera concerné.

Quand CTS Installer change lui aussi de version, ajouter une étape 3 :
`S'il propose « Installer la version 1.0.X », acceptez, puis relancez`.
