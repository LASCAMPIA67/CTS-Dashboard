# Node — contraintes vérifiées

Chaque entrée porte sa citation, son adresse et la date de lecture. Ce
qui est ici a déjà été vérifié : n'y retourne que si la date est vieille
ou si le doute porte sur autre chose.

Cette annexe sert **aux deux dépôts** : le public y tient 20 bancs et son
validateur, l'admin 5 bancs et le sien. Elle vit ici comme
`scriptable.md`, pour n'exister qu'en un seul exemplaire.

Elle s'appelait `node22.md` jusqu'au passage des deux dépôts à Node 26,
le 29/10/2026. Son nom ne porte plus de numéro : le prochain passage
n'aura pas à la renommer.

## Node 26 est la LTS active depuis le 28 octobre 2026

> « Production applications should only use Active LTS or Maintenance
> LTS releases. »

`nodejs.org/en/about/previous-releases` · lu le 29/10/2026

| Branche | LTS active | Maintenance | Fin |
|---|---|---|---|
| 22 | 2024-10-29 | 2025-10-21 | 2027-04-30 |
| 24 | 2025-10-28 | 2026-10-20 | 2028-04-30 |
| 26 | 2026-10-28 | 2027-10-20 | 2029-04-30 |

`raw.githubusercontent.com/nodejs/Release/main/schedule.json` · lu le
29/10/2026

Les deux dépôts tournent sous la LTS active, et non sous la 24, déjà en
maintenance : c'est la seule des trois qui reçoive encore autre chose que
des correctifs de sécurité et de régression, et elle repousse le
prochain passage au 30 avril 2029 au plus tard.

La v26.13.0, publiée le 28/10/2026, est la première de la branche à
porter le nom de LTS « Lithium » (`nodejs.org/dist/index.json` · lu le
29/10/2026).

## `latest-v26.x` est un pointeur, pas une version

L'adresse `nodejs.org/docs/latest-v26.x/api` servait la documentation de
**v26.13.0** au 29/10/2026. Le conteneur de session, lui, exécute
**v22.22.0** : la version qu'il fournit tient au conteneur, pas au dépôt.

Relevé le 29/10/2026, par lecture de la page et par `node --version`.

Les deux dépôts ne figent que la branche majeure, dans leurs workflows :
c'est la CI qui fait foi. Une citation prise à cette adresse peut donc
décrire une version plus récente que celle qui tourne. Quand la nuance
compte, prends la page numérotée.

Mesuré le même jour : les 21 commandes de `validate.yml` du dépôt public
et les 7 bancs et validations du dépôt admin passent sous v26.13.0, sans
un avertissement, comme sous la v22 du conteneur. Les scripts des
Releases et de la veille PDF.js n'ont été que compilés, par
`node --check` : le premier refuse de tourner hors de GitHub Actions, le
second interroge npm. Wrangler n'a pas tourné non plus ; sa page dit
qu'il accepte la branche, voir l'annexe `cloudflare-workers.md` du dépôt
admin.

## `node:vm` n'est pas une barrière de sécurité

> « The `node:vm` module is not a security mechanism. Do not use it to
> run untrusted code. »

`nodejs.org/docs/latest-v26.x/api/vm.html` · lu le 29/10/2026

Les bancs des deux dépôts exécutent du code écrit dans le dépôt, sur des
doublures hors ligne. C'est l'usage prévu, et rien ici ne le contredit.

Ce que la phrase interdit : y faire tourner un jour quelque chose reçu
d'ailleurs — une carte agent, une réponse de serveur, un fichier déposé
par un collègue — en comptant sur `node:vm` pour contenir les dégâts. Il
ne contient rien.

## Chaque contexte `node:vm` a ses propres objets intégrés

> « Inside such scripts, the global object will be wrapped by the
> `contextObject`, retaining all of its existing properties but also
> having the built-in objects and functions any standard global object
> has. »

> « be aware that the objects created by modules loaded from the main
> context are still from the main context and not `instanceof`
> built-in classes in the new context. »

`nodejs.org/docs/latest-v26.x/api/vm.html`, sections `vm.createContext()`
et `importModuleDynamically` · lu le 29/10/2026

C'est pourquoi `tools/preview/sandbox.mjs` passe au contexte les
constructeurs de l'hôte — `Array`, `Date`, `Object`… : un banc qui
compare ce que rend un script à ses propres objets doit parler des
mêmes classes.

## `node:sqlite` est une version candidate, et n'a plus de drapeau

> « SQLite is now a release candidate. »

> « SQLite is no longer behind `--experimental-sqlite` but still
> experimental. »

`nodejs.org/docs/latest-v26.x/api/sqlite.html`, lignes `v25.7.0` et
`v22.13.0` du tableau d'historique · lu le 29/10/2026

Le module est annoncé `Stability: 1.2 - Release candidate`, que l'index
de stabilité définit ainsi :

> « No further breaking changes are anticipated but may still occur in
> response to user feedback or the features' underlying specification
> development. »

`nodejs.org/docs/latest-v26.x/api/documentation.html`, section
« Stability index » · lu le 29/10/2026

Mesuré sur v26.13.0, le 29/10/2026 : le banc du Worker passe sans
`--experimental-sqlite` et sans aucun avertissement, là où la v22
émettait un `ExperimentalWarning`. Le drapeau reste accepté, sans effet.
Le dépôt admin a cessé de le passer le même jour.
