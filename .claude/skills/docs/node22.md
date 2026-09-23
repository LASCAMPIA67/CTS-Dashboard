# Node 22 — contraintes vérifiées

Chaque entrée porte sa citation, son adresse et la date de lecture. Ce
qui est ici a déjà été vérifié : n'y retourne que si la date est vieille
ou si le doute porte sur autre chose.

Cette annexe sert **aux deux dépôts** : le public y tient 20 bancs et son
validateur, l'admin 5 bancs et le sien. Elle vit ici comme
`scriptable.md`, pour n'exister qu'en un seul exemplaire.

## Node 22 s'arrête le 30 avril 2027

La branche 22 est entrée en maintenance le 21 octobre 2025 et se termine
le 30 avril 2027.

`raw.githubusercontent.com/nodejs/Release/main/schedule.json` —
`"maintenance": "2025-10-21"`, `"end": "2027-04-30"` · lu le 18/09/2026

Maintenance veut dire correctifs de sécurité et de régression, rien de
plus. Rien n'est urgent, mais la date est connue : c'est un déménagement
prévisible, pas une surprise.

## `latest-v22.x` est un pointeur, pas une version

L'adresse `nodejs.org/docs/latest-v22.x/api` servait la documentation de
**v22.23.2** au 18/09/2026. Le conteneur de session, lui, exécute
**v22.22.2**.

Relevé le 18/09/2026, par lecture de la page et par `node --version`.

Les deux dépôts ne figent que la branche majeure, dans leurs workflows.
Une citation prise à cette adresse peut donc décrire une version plus
récente que celle qui tourne. Quand la nuance compte, prends la page
numérotée.

## `node:vm` n'est pas une barrière de sécurité

> « The `node:vm` module is not a security mechanism. Do not use it to
> run untrusted code. »

`nodejs.org/docs/latest-v22.x/api/vm.html` · lu le 18/09/2026

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

`nodejs.org/docs/latest-v22.x/api/vm.html`, sections `vm.createContext()`
et `importModuleDynamically` · lu le 23/09/2026

C'est pourquoi `tools/preview/sandbox.mjs` passe au contexte les
constructeurs de l'hôte — `Array`, `Date`, `Object`… : un banc qui
compare ce que rend un script à ses propres objets doit parler des
mêmes classes.

## `node:sqlite` n'a plus besoin de son drapeau, et reste expérimental

> « SQLite is no longer behind `--experimental-sqlite` but still
> experimental. »

`nodejs.org/docs/latest-v22.x/api/sqlite.html`, ligne `v22.13.0` du
tableau d'historique · lu le 18/09/2026

Le module est annoncé `Stability: 1.1 - Active development` : son
interface peut changer d'une version à l'autre sans que ce soit un
défaut.

Mesuré ici, sur v22.22.2 : `--experimental-sqlite` est toujours accepté
et sans effet, et `import("node:sqlite")` fonctionne sans lui, en
émettant un `ExperimentalWarning`. Le dépôt admin passe encore le
drapeau dans son workflow et dans `worker/test/worker-test.mjs` — inutile
depuis v22.13.0, inoffensif, et à lire comme une trace d'époque.
