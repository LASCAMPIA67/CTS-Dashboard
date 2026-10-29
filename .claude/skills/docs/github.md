# GitHub — contraintes vérifiées

Chaque entrée porte sa citation, son adresse et la date de lecture. Ce
qui est ici a déjà été vérifié : n'y retourne que si la date est vieille
ou si le doute porte sur autre chose.

Cette annexe sert **aux deux dépôts** : chacun a ses workflows, publie
ses Releases par `.github/workflows/release.yml` et fait relever ses
actions par `.github/dependabot.yml`.

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

## Ce que publie le jeton ne relance aucun workflow, à deux exceptions près

> « When you use the repository's `GITHUB_TOKEN` to perform tasks, events
> triggered by the `GITHUB_TOKEN` will not create a new workflow run,
> with the following exceptions: »

> « `workflow_dispatch` and `repository_dispatch` events always create
> workflow runs. »

> « when a workflow using `GITHUB_TOKEN` creates or updates a pull
> request, the resulting `pull_request` event creates workflow runs in an
> **approval-required** state. The pull request displays a banner in the
> merge box, and a user with write access to the repository can start the
> runs by selecting **Approve workflows to run**. »

`docs.github.com/en/actions/concepts/security/github_token`, section
« When `GITHUB_TOKEN` triggers workflow runs » · lu le 28/10/2026, et
relu en entier le 29/10/2026 : la citation du 28 s'arrêtait avant les
exceptions.

Un tag posé par `release.yml` ne déclenche donc rien d'autre. La pull
request de la veille PDF.js, elle, attend qu'on approuve sa validation :
la même page n'offre pour l'éviter qu'un jeton d'application GitHub ou un
jeton personnel, soit un secret d'écriture de plus dans un dépôt public,
pour une approbation à chaque version de PDF.js.

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

Depuis la v6, le jeton conservé ne vit plus dans `.git/config` :

> « `persist-credentials` now stores credentials in a separate file
> under `$RUNNER_TEMP` instead of directly in `.git/config` »

> « No workflow changes required — `git fetch`, `git push`, etc.
> continue to work automatically »

Même `README.md`, au commit de la v7.0.1, section « Checkout v6 » · lu le
29/10/2026. La veille PDF.js, qui pousse sa branche avec ce jeton, n'a
donc rien à changer.

## GitHub CLI est déjà sur les machines de GitHub

> « GitHub CLI is preinstalled on all GitHub-hosted runners. For each
> step that uses GitHub CLI, you must set an environment variable called
> `GH_TOKEN` to a token with the required scopes. »

`docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-github-cli`
· lu le 28/10/2026

## Node 20 a quitté les machines de GitHub

> « This is the final notification that Node 20 is no longer available
> on GitHub Actions runners. Runners now use Node 24 for JavaScript
> actions. »

> « If you use JavaScript actions in your workflows, update to the
> latest versions of those actions that support Node 24. »

`github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions`
· lu le 29/10/2026

Les v4 de `actions/checkout` et `actions/setup-node` déclaraient Node 20.
Leurs v7 déclarent `using: node24` dans leur `action.yml`, lu au commit
épinglé le 29/10/2026. Ce runtime est celui de l'action elle-même : la
version de Node qui exécute les bancs reste celle que `setup-node` pose,
voir `node.md`.

## Faute de fichier de verrouillage, une action s'épingle à son commit

> « The best measure is to **lock your workflow dependencies** with a
> lockfile. […] This is the strongest protection available, and
> supersedes SHA pinning for repositories that adopt it. »

> « For repositories that **cannot** adopt a lockfile, you can: […] Pin
> references to actions to a commit SHA in your workflow files. […]
> When selecting a SHA, you should verify it is from the action's
> repository and not a repository fork. »

`docs.github.com/en/actions/reference/security/secure-use`, section
« Using third-party actions » · lu le 29/10/2026

Les deux dépôts sont de ceux qui ne peuvent pas, pour deux raisons :

> « It's generated by `gh actions-lock`, a GitHub CLI extension, and
> should never be edited by hand. »

`docs.github.com/en/actions/concepts/security/workflow-dependency-lockfiles`
· lu le 29/10/2026

> « Run `gh actions-lock` again whenever you add a workflow that has
> `uses` dependencies, or add or remove `uses` dependencies in an
> existing workflow. »

`docs.github.com/en/actions/how-tos/secure-your-work/lock-workflow-dependencies`
· lu le 29/10/2026

Et l'extension « Requires an authenticated `gh` »
(`github.com/github/gh-actions-lock`, `README.md`, commit `113f91d` · lu
le 29/10/2026). Ce qui suit est une mesure : le 29/10/2026, dans une
session cloud, `gh api repos/actions/checkout` répond HTTP 403, l'accès
de la session étant borné aux deux dépôts du projet. L'iPhone, lui, n'a
pas de `gh`. Personne ne peut donc régénérer le fichier.

Les SHA épinglés ont été lus par `git ls-remote --tags` sur le dépôt de
l'action elle-même, jamais sur une copie : `refs/tags/v7.0.1` et
`refs/tags/v7.1.0` sont des tags légers, qui désignent directement le
commit.

Le prix de l'épingle :

> « Dependabot only creates alerts for vulnerable actions that use
> semantic versioning and will not create alerts for actions pinned to
> SHA values. »

Même page `secure-use` · lu le 29/10/2026. La relève mensuelle ci-dessous
en tient lieu.

## Dependabot relève les épingles, commentaire compris

> « You enable Dependabot version updates by committing a
> `dependabot.yml` configuration file to your repository. »

`docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuring-dependabot-version-updates`
· lu le 29/10/2026

> « The `directory` must be set to `"/"` to check for workflow files in
> `.github/workflows`. »

`docs.github.com/en/code-security/dependabot/working-with-dependabot/keeping-your-actions-up-to-date-with-dependabot`
· lu le 29/10/2026

> « Dependabot will now update the semver version in comments when
> updating Actions workflows with a commit SHA version. »

`github.blog/changelog/2022-10-31-dependabot-now-updates-comments-in-github-actions-workflows-referencing-action-versions`
· lu le 29/10/2026. D'où le `# v7.0.1` en fin de ligne : il dit ce que le
SHA désigne, et Dependabot le tient à jour.

> « Use `monthly` to run on the first day of each month. »

> « All updates for dependencies that match a rule are combined in a
> single pull request. »

> « Apply a **default cooldown period of 3 days** to version updates,
> even when `cooldown` is not configured. »

`docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference`,
sections `schedule`, `groups` et `cooldown` · lu le 29/10/2026

## Un workflow lancé par Dependabot n'a ni secrets ni écriture

> « By default, GitHub Actions workflow runs that are triggered by
> Dependabot from `push`, `pull_request`, `pull_request_review`, or
> `pull_request_review_comment` events are treated as if they were
> opened from a repository fork. Unlike workflows triggered by other
> actors, this means they receive a read-only `GITHUB_TOKEN` and do not
> have access to any secrets that are normally available. »

`docs.github.com/en/code-security/dependabot/troubleshooting-dependabot/troubleshooting-dependabot-on-github-actions`
· lu le 29/10/2026

La validation des deux dépôts ne lit aucun secret et n'écrit rien : elle
tourne normalement sur une pull request de Dependabot. Le déploiement du
Worker, lui, lit les secrets Cloudflare. La même page reconnaît un
passage de Dependabot à `github.actor` — `if: github.actor !=
'dependabot[bot]'` —, et la poussée qui suit une fusion a pour auteur la
personne qui fusionne : c'est une déduction, pas une citation, et elle
tient tant que personne ne laisse Dependabot fusionner seul dans le dépôt
admin.

## `ubuntu-latest` passe à Ubuntu 26.04 en novembre 2026

> « [Ubuntu] `ubuntu-latest` label will use Ubuntu 26.04 in November
> 2026 »

`github.com/actions/runner-images`, `images/ubuntu/Ubuntu2604-Readme.md`,
encadré « Announcements » · lu le 29/10/2026

La même page liste, pour l'image `20261026.180.1`, Git 2.56.0 et GitHub
CLI 2.103.2. Les workflows des deux dépôts n'emploient rien d'autre de la
machine : Node vient de `setup-node`. Ils gardent donc `ubuntu-latest`.

## Sans authentification, l'API compte soixante appels par heure et par adresse

> « Unauthenticated requests are associated with the originating IP
> address, not with the user or application that made the request. »

> « The primary rate limit for unauthenticated requests is 60 requests per
> hour. »

> « If you exceed your primary rate limit, you will receive a `403` or
> `429` response, and the `x-ratelimit-remaining` header will be `0`. You
> should not retry your request until after the time specified by the
> `x-ratelimit-reset` header. »

> « If the `retry-after` response header is present, you should not retry
> your request until after that many seconds has elapsed. […] Otherwise,
> wait for at least one minute before retrying. »

`docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api`
· lu le 29/10/2026

CTS Installer appelle l'API une fois par lancement, pour la révision du
dépôt (`fetchRepositoryRevision`) ; les fichiers viennent de
`raw.githubusercontent.com`, que la page ne couvre pas. Constat de
lecture du code. Les collègues d'un même Wi-Fi se partagent donc les
soixante appels de l'heure.

Depuis la 1.0.34, l'installateur respecte `retry-after` — il attend sur
place jusqu'à neuf secondes, et au-delà s'arrête en donnant l'heure — et
s'arrête sur un compte à zéro jusqu'à `x-ratelimit-reset`. Reste un
écart : une limite secondaire sans `retry-after` ni compte à zéro, que la
page ne reconnaît qu'à son message d'erreur, n'est pas traitée comme
telle, et un 429 sans en-tête est retenté au bout d'une seconde et demie,
non d'une minute. Un appel par lancement ne devrait pas atteindre une
limite secondaire : c'est une estimation, pas une citation.
