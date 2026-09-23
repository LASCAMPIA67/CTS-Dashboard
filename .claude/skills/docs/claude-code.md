# Claude Code — contraintes vérifiées

Chaque entrée porte sa citation, son adresse et la date de lecture. Ce
qui est ici a déjà été vérifié : n'y retourne que si la date est vieille
ou si le doute porte sur autre chose.

Cette annexe sert **aux deux dépôts**, que les sessions de travail
ouvrent seuls ou ensemble. Elle vit ici comme `node22.md`, pour n'exister
qu'en un seul exemplaire.

## Opus 5.5 démarre en effort `medium`

> « Opus 5.5 starts at `medium` unless one of the sources above sets a
> level for it »

`code.claude.com/docs/en/model-config.md`, section « Adjust effort
level » · lu le 23/09/2026

Les autres modèles qui ont un niveau d'effort démarrent en `high`, sauf
Opus 4.7, en `xhigh` : le niveau par défaut dépend du modèle.

## Ultracode, c'est `xhigh` et des workflows, et chaque demande coûte plus

> « Ultracode is a Claude Code setting rather than a model effort level:
> it sends `xhigh` to the model and additionally has Claude orchestrate
> dynamic workflows for substantive tasks. »

`code.claude.com/docs/en/model-config.md`, section « Adjust effort
level » · lu le 23/09/2026

> « This applies to every task in the session, so each request uses more
> tokens and takes longer than at lower effort levels. »

> « Drop back with `/effort high` when you return to routine work. »

`code.claude.com/docs/en/workflows.md`, section « Let Claude decide with
ultracode » · lu le 23/09/2026

## Dans une session cloud, l'appli fixe le modèle et l'effort

Mesure, pas citation. Relevé le 23/09/2026 : l'appli démarre Claude Code
avec `--model` et `--effort`, pris dans le sélecteur de la session au
moment de la créer — la ligne de commande du processus `claude` les
montre. Elle présélectionne Opus 5.5, mais ultracode se choisit à chaque
fois : c'est le constat du mainteneur, et aucune page ne dit si l'appli
peut retenir ce choix.

La documentation donne ce classement pour le modèle, où l'option de
démarrage passe avant le fichier de réglages :

> « 2. **At startup**: launch with `claude --model <alias|name>` […]
> 4. **Settings**: configure permanently in your settings file using the
> `model` field »

`code.claude.com/docs/en/model-config.md`, section « Setting your
model » · lu le 23/09/2026

Pour l'effort, elle ne dit pas qui l'emporte entre `--effort` et la clé
`ultracode`. L'essai du 23/09/2026 a tranché : `"ultracode": true` écrit
dans `~/.claude/settings.json` par le script de configuration, puis une
session ouverte sur les deux dépôts sans choisir ultracode. Le processus
a reçu `--effort medium`, et le journal de la session a noté
`"effort":"medium"`. La ligne a été retirée du script le jour même.

Aucun fichier, de dépôt ou d'environnement, ne rend donc ultracode
permanent. Il se choisit dans l'appli, ou dans la session :

> « Claude Code reads this key but never writes it: `/effort ultracode`
> turns ultracode on for the current session only. »

`code.claude.com/docs/en/settings-reference.md`, section « ultracode » ·
lu le 23/09/2026

Pour vérifier l'effort réellement appliqué, le journal de la session —
le fichier `.jsonl` le plus récent sous `~/.claude/projects/` — porte
une valeur `"effort"` par demande envoyée au modèle. Constat de lecture
du journal, non documenté.

## `CLAUDE_CODE_EFFORT_LEVEL` refuse ultracode et passe devant tout

> « The persisted `effortLevel` setting and the `CLAUDE_CODE_EFFORT_LEVEL`
> environment variable don't accept `ultracode`. When
> `CLAUDE_CODE_EFFORT_LEVEL` is set to a level other than `xhigh`,
> requests run at that level and ultracode's workflow orchestration stays
> inactive. »

`code.claude.com/docs/en/model-config.md`, section « Adjust effort
level » · lu le 23/09/2026

> « Takes precedence over `--effort`, `/effort`, and the `modelSettings`
> and `effortLevel` settings. »

`code.claude.com/docs/en/env-vars.md`, ligne `CLAUDE_CODE_EFFORT_LEVEL`
du tableau « Variables » · lu le 23/09/2026

C'est le seul réglage qui l'emporterait sur l'appli, et il a été écarté
le 23/09/2026 : il ne sait pas dire ultracode, et plus rien — ni
l'appli, ni `/effort` — ne pourrait baisser l'effort d'une session.
Elle n'est pas définie dans l'environnement, et ne doit pas l'être.

## Une session sur les deux dépôts ne lit ni leurs réglages ni leurs serveurs MCP

> « Your repo's `.claude/settings.json` hooks and permission rules — Yes,
> in a session with one repository — […] A session with several
> repositories, including a project thread, starts above the clones and
> doesn't read them »

> « Your repo's `.mcp.json` MCP servers — Yes, in a session with one
> repository »

`code.claude.com/docs/en/cloud-environments.md`, tableau « What carries
over from your setup » · lu le 23/09/2026

Le même tableau répond « Yes » sans réserve pour `CLAUDE.md`,
`.claude/rules/`, `.claude/skills/` et `.claude/commands/` : consignes,
skills et commandes valent dans les deux cas.

Deux conséquences dans une session ouverte sur les deux dépôts. Le hook
`pdf-tools.sh` ne tourne pas, d'où la lecture des PDF confiée au script
de configuration — décision du 14 septembre. Les serveurs
`claude-code-docs` et `cloudflare-docs` ne sont pas chargés : leur
absence y est normale, et les pages se lisent alors directement, en
ajoutant `.md` à leur adresse.

## Ce que le script de configuration écrit est gardé d'une session à l'autre

> « The cache is a filesystem snapshot, so it keeps what the setup script
> writes to disk and loses anything that was only running. »

> « The setup script runs again to rebuild the cache when you change the
> environment's setup script or allowed network hosts, and when the cache
> reaches its expiry after roughly seven days. »

`code.claude.com/docs/en/cloud-environments.md`, section « Environment
caching » · lu le 23/09/2026

`~/.claude/settings.json` survit donc aux sessions quand c'est le script
qui l'écrit ; ce qu'une session y écrit elle-même se perd avec elle.
Modifier le script coûte une reconstruction à la session suivante —
quinze secondes pour le script actuel, mesurées le 19/09/2026 dans le
journal de l'environnement.

## `CLAUDE.md` reste sous 200 lignes

> « target under 200 lines per CLAUDE.md file. Longer files consume more
> context and reduce adherence. »

`code.claude.com/docs/en/memory.md`, section « Write effective
instructions » · lu le 23/09/2026

Les deux `CLAUDE.md` en sont loin. Ce qui se vérifie une fois et se cite
vient ici, pas là-bas.

## La documentation de l'API a déménagé

Mesure, pas citation. Relevé le 23/09/2026 :
`docs.claude.com/en/docs_site_map.md` renvoie vers
`platform.claude.com/docs/en/docs_site_map.md`, qui renvoie vers
`platform.claude.com/llms.txt`. C'est l'index que les deux `CLAUDE.md`
donnent désormais ; ses liens portent déjà leur suffixe `.md`.

La page d'Opus 5.5 y figure — `platform.claude.com/docs/en/models/opus-5-5/overview.md`,
titre « Claude Opus 5.5 » : identifiant `claude-opus-5-5`, « Released
September 22, 2026 ».
