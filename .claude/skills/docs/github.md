# GitHub — contraintes vérifiées

Chaque entrée porte sa citation, son adresse et la date de lecture. Ce
qui est ici a déjà été vérifié : n'y retourne que si la date est vieille
ou si le doute porte sur autre chose.

Cette annexe sert **aux deux dépôts** : chacun a ses workflows, et le
dépôt public publie ses Releases par `.github/workflows/release.yml`.

## Une Release est un tag, et le tag désigne un commit

> « Releases are based on Git tags, which mark a specific point in your
> repository's history. »

`docs.github.com/en/repositories/releasing-projects-on-github/about-releases`
· lu le 28/10/2026

C'est ce qui accorde les Releases à la règle du 4 septembre : un numéro
publié désigne un seul état des fichiers. Semantic Versioning dit la
même chose :

> « Once a versioned package has been released, the contents of that
> version MUST NOT be modified. Any modifications MUST be released as a
> new version. »

> « No, “v1.2.3” is not a semantic version. However, prefixing a semantic
> version with a “v” is a common way (in English) to indicate it is a
> version number. »

`semver.org`, Semantic Versioning 2.0.0, règle 3 et FAQ · lu le
28/10/2026

D'où les tags `v1.4.8` et `installer-v1.0.33` : le numéro reste semver,
le préfixe sépare deux familles qui ont toutes deux connu des 1.0.x.

## `contents: write` suffit pour publier

> « `contents: write` allows the action to create a release. »

`docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax`,
section `permissions` · lu le 28/10/2026

La même page rappelle que toute permission non nommée tombe à `none` dès
qu'une seule est nommée.

## Le jeton d'un workflow ne publie pas sur un commit qui change un workflow

> « If the commit identified by target_commitish (or, when
> target_commitish is omitted, the latest commit on the default branch)
> adds or modifies any file under .github/workflows/ relative to the
> repository's default branch, the authenticating token must be
> authorized to modify workflows. […] The GITHUB_TOKEN available to
> GitHub Actions cannot be authorized for this »

`docs.github.com/en/rest/releases/releases`, section « Create a
release » · lu le 28/10/2026

Une Release publiée à la fusion vise le commit de `main` lui-même, qui ne
diffère en rien de `main` : elle n'est pas concernée. La page ne dit pas
comment se compare un commit plus ancien que `main`.

Ce qui suit vient d'une mesure et non de la page. Le 29/10/2026, le jeton
du workflow a créé sans refus `installer-v1.0.33` sur `69d9090`, dont
`validate.yml` diffère de celui de `main`, et `v1.4.8` sur `d91a274`, où
`release.yml` n'existe pas encore. Un commit plus ancien que `main` n'est
donc pas refusé pour autant, du moins ce jour-là. La page n'en donne pas la
raison, et rien ne garantit que la règle ne change pas.

Poser le tag d'abord, puis la Release sur ce tag, ne contourne rien :
`POST /repos/{owner}/{repo}/git/refs` figure lui aussi dans la table de la
permission « Workflows », avec la mention de permissions supplémentaires.

`docs.github.com/en/rest/authentication/permissions-required-for-github-apps`,
section « Repository permissions for "Workflows" » · lu le 28/10/2026

## Ce que publie le jeton ne relance aucun workflow

> « When you use the repository's `GITHUB_TOKEN` to perform tasks, events
> triggered by the `GITHUB_TOKEN` will not create a new workflow run »

`docs.github.com/en/actions/concepts/security/github_token` · lu le
28/10/2026

Un tag posé par `release.yml` ne déclenche donc rien d'autre.

## « Latest » va par défaut à la dernière Release publiée

> « `make_latest` […] Defaults to true for newly published releases. »

`docs.github.com/en/rest/releases/releases`, section « Create a
release » · lu le 28/10/2026

Avec deux familles dans un même dépôt, une version de l'installateur
prendrait l'étiquette à celle du Dashboard. `release.yml` la donne
explicitement : `--latest=true` pour le Dashboard, `--latest=false` pour
l'installateur.

## La liste générée part de la Release précédente, toutes familles confondues

> « Automatically generated release notes include a list of merged pull
> requests, a list of contributors to the release, and a link to a full
> changelog. »

`docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes`
· lu le 28/10/2026

Le point de départ se choisit par `--notes-start-tag`
(`cli.github.com/manual/gh_release_create` · lu le 28/10/2026). Ce que
`gh` fait alors vient de son code et non d'une documentation : il demande
la liste à GitHub, puis la place après le texte fourni par `--notes` ou
`--notes-file`, séparés par un saut de ligne.

`github.com/cli/cli`, `pkg/cmd/release/create/create.go`, branche
`trunk` · lu le 28/10/2026, `gh` 2.89.0 dans le conteneur de session

Le fichier `.github/release.yml` ne fait que trier cette liste par
libellés ; aucun des deux dépôts n'en pose, faute de libellés.

## Une Release immuable verrouille son tag, jusqu'à son nom

> « Once an immutable release is published, its associated Git tag is
> locked to a specific commit, cannot be changed, and cannot be deleted
> while the release exists. If you delete the immutable release, you can
> delete the tag, but you cannot reuse the same tag name. »

> « Only the assets and tag are locked. You can still edit the title and
> release notes of a published immutable release »

`docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases`
· lu le 28/10/2026

Le réglage vit dans les Settings du dépôt, section « Releases » :
« Enable release immutability », et « immutability will only apply to
future releases »
(`…/establish-provenance-and-integrity/prevent-release-changes` · lu le
28/10/2026). Un tag posé par erreur est donc perdu pour toujours : c'est
pourquoi `release.mjs` refuse de tourner hors de GitHub Actions.

## Un groupe de concurrence ne garde qu'un passage en attente

> « By default, any existing `pending` job or workflow in the same
> concurrency group will be canceled and the new queued job or workflow
> will take its place. »

> « Jobs or workflow runs in the same concurrency group are processed in
> first-in-first-out (FIFO) order […] ordering is not guaranteed. »

`docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax`,
section `concurrency` · lu le 28/10/2026

`queue: max` garderait jusqu'à cent passages en attente, mais sans ordre
garanti : deux numéros publiés coup sur coup pourraient partir dans le
désordre. `release.yml` garde le comportement par défaut, et chaque
passage publie ce que l'état de `main` qu'il lit attend encore.

## `actions/checkout` : l'historique, les tags et le jeton

> « Set `fetch-depth: 0` to fetch all history for all branches and
> tags. »

> « The auth token is persisted in the local git config. […] Set
> `persist-credentials: false` to opt-out. »

`github.com/actions/checkout`, `README.md` · lu le 28/10/2026

## GitHub CLI est déjà sur les machines de GitHub

> « GitHub CLI is preinstalled on all GitHub-hosted runners. For each
> step that uses GitHub CLI, you must set an environment variable called
> `GH_TOKEN` to a token with the required scopes. »

`docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-github-cli`
· lu le 28/10/2026
