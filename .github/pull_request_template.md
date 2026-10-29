# Ce que change cette pull request

<!-- Une ou deux phrases : ce qui est différent, et pourquoi. -->

# Avant de fusionner

CTS Installer lit `version.json` sur `main`. **Fusionner un numéro qui a
monté publie sur les vingt-quatre iPhone**, sans autre geste, et un numéro
publié ne se reprend pas.

- [ ] Les vingt et une commandes de la section **Vérifications automatiques**
      de [`CONTRIBUTING.md`](../blob/main/CONTRIBUTING.md#vérifications-automatiques)
      passent.
- [ ] Aucun secret, et aucun outil de maintenance, n'entre dans le dépôt.
- [ ] Si un numéro bouge, il bouge aux deux endroits dans le même commit —
      `version.json` et `CTS Config.js`, ou `version.json` et
      `CTS Installer.js`.
- [ ] Si le rendu se juge sur l'appareil, il a été vu sur un iPhone avant
      que le numéro soit écrit.
- [ ] Si `minimumDashboard` monte, `minimumVersion` côté Worker est relevé
      **après** cette fusion, jamais avant.
- [ ] Si un numéro est publié, le message pour la communauté est écrit
      d'après [`MESSAGES.md`](../blob/main/MESSAGES.md) et rangé sous
      `messages/` : il devient la note de sa Release.
- [ ] Ce qui doit être constaté sur l'iPhone après fusion est repéré dans
      [`TEST_PLAN.md`](../blob/main/TEST_PLAN.md).
- [ ] [`DECISIONS.md`](../blob/main/DECISIONS.md) porte les décisions
      structurantes prises ici.
