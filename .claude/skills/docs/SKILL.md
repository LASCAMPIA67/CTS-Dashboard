---
name: docs
description: Index des technologies du dépôt et de leur documentation officielle. À ouvrir avant toute modification touchant Scriptable, le widget, iCloud, PDF.js, les bancs d'essai Node ou la chaîne GitHub, et avant de répondre à une question portant sur l'une d'elles.
---

# Documentation des technologies

Ne réponds jamais de mémoire sur une technologie listée ici : ouvre sa
page, puis dis laquelle tu as lue. Quand une adresse est marquée ●, elle
n'a pas été vérifiée — dis-le au mainteneur plutôt que de t'y fier.
Toutes celles marquées ✓ ont été ouvertes le 18/09/2026, et leur titre
relevé.

Les contraintes déjà établies, citées et datées, sont dans les fichiers
annexes : [`scriptable.md`](scriptable.md), [`pdfjs.md`](pdfjs.md) et
[`node22.md`](node22.md). Lis l'annexe avant d'aller en ligne, elle
répond peut-être déjà. `node22.md` sert aussi au dépôt admin, qui n'en
tient pas de copie.

## Sur l'iPhone du collègue

| Technologie | Version figée | Où | Documentation |
|---|---|---|---|
| Scriptable — l'app qui exécute les scripts et rend le widget | iOS 15.5+ | tout le dépôt | ✓ `docs.scriptable.app` |
| JavaScript, exécuté par JavaScriptCore | — | 19 scripts à la racine, dont 17 au manifeste | ✓ `developer.mozilla.org/fr/docs/Web/JavaScript` |
| iOS / iPadOS — cibles iOS 18 et 26 | — | `README.md:45-47` | ✓ `developer.apple.com/documentation` |
| Widget grand format (WidgetKit, via Scriptable) | — | `CTS Widget Engine.js`, `CTS Widget Renderer.js`, `CTS Widget Theme.js` | ✓ `developer.apple.com/documentation/widgetkit` |
| iCloud Drive | — | `CTS Config.js:5` | ✓ `support.apple.com/en-us/108922` · guide Mac `mchle5a61431` (voir l'annexe) |
| Trousseau iOS | — | `CTS Analytics Client.js` | ✓ `docs.scriptable.app/keychain` |
| PDF.js — lecture de la carte agent | **6.1.200**, build `legacy` | `CTS PDF Engine.js:9` | ✓ `mozilla.github.io/pdf.js/api` |
| HTML / CSS / DOM en WebView | — | `CTS PDF Engine.js:785-1390` | ✓ `developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model` |
| Streams API — un correctif maison compense son absence | — | `CTS PDF Engine.js:789` | ✓ `developer.mozilla.org/en-US/docs/Web/API/Streams_API` |
| HASTUS (Giro) — le format de la carte agent | — | `CTS Parser.js` | format propriétaire, aucune doc publique |

La bibliothèque PDF.js arrive par deux chemins : `pdf.min.mjs` et
`pdf.worker.min.mjs` versionnés à la racine, que l'installateur pose
d'après `version.json` dans la bibliothèque locale de Scriptable — hors
d'iCloud depuis CTS Installer 1.0.32 —, et la même version prise chez
jsDelivr par le moteur quand le fichier manque sur l'appareil.

**API Scriptable réellement employée**, chacune a sa page :
`Font`, `Color`, `UITable` / `UITableRow`, `SFSymbol`, `Size`, `Script`,
`Keychain`, `Alert`, `Request`, `WebView`, `Timer`, `ListWidget`, `Data`,
`FileManager`, `Device`, `UUID`, `Safari`, `Point`, `Pasteboard`,
`LinearGradient`, `args`, `config`, `console`, `importModule` et
`module.exports`.

## L'outillage, hors iPhone

| Technologie | Version | Où | Documentation |
|---|---|---|---|
| Node.js, modules ES | **22** | 20 bancs joués en CI, `validate.mjs` | ✓ `nodejs.org/docs/latest-v22.x/api` |
| `node:vm` — exécute les scripts sur des doublures | — | `tools/preview/*.mjs` | ✓ `nodejs.org/docs/latest-v22.x/api/vm.html` |
| `node:fs`, `node:path`, `node:child_process`, `node:url`, `node:os` | — | bancs et `validate.mjs` | ✓ même adresse |

`latest-v22.x` est un pointeur mouvant, et la branche 22 a une date de
fin : l'annexe [`node22.md`](node22.md) porte les deux.

`tools/preview/installer-bench.mjs` est le seul banc que la CI ne joue
pas : c'est une mesure, pas un contrôle.

Aucun cadriciel de test : les bancs sont des scripts Node nus.

## La chaîne GitHub et la distribution

| Technologie | Version | Documentation |
|---|---|---|
| GitHub Actions | `actions/checkout@v4`, `actions/setup-node@v4` | ✓ `docs.github.com/en/actions` |
| GitHub raw — les trois bases | — | ✓ `docs.github.com` |
| jsDelivr — d'où vient PDF.js | — | ✓ `www.jsdelivr.com/documentation` |
| Shields.io — les deux badges du README | — | ✓ `shields.io/docs` |
| Markdown GitHub, Mermaid, encarts `[!NOTE]` | — | ✓ `github.github.com/gfm` · `mermaid.js.org` |
| Licences MIT et Apache 2.0 (PDF.js) | — | ✓ `opensource.org/licenses` |

## L'environnement Claude Code

| Technologie | Où | Documentation |
|---|---|---|
| Claude Code — consignes, rythme, sessions | `CLAUDE.md` | ✓ `code.claude.com/docs` |
| MCP — le serveur `claude-code-docs` | `.mcp.json` | ✓ `code.claude.com/docs/en/mcp.md` |
| Hooks | `.claude/hooks/pdf-tools.sh` | ✓ `code.claude.com/docs/en/hooks.md` |
| Skills — dont celui-ci | `.claude/skills/` | ✓ `code.claude.com/docs/en/skills.md` |
| Commandes slash | `.claude/commands/` | ✓ `code.claude.com/docs/en/commands.md` |
| poppler-utils / `pdftoppm` — lecture des captures | script d'environnement | ✓ `poppler.freedesktop.org` |

L'index complet des pages Claude Code se prend à
`code.claude.com/docs/llms.txt`, et une page se lit en ajoutant `.md` à
son adresse.

**Un serveur déclaré dans `.mcp.json` ne se connecte pas tout seul dans
une session distante.**

> « A cloned repository can't approve its own servers:
> `enableAllProjectMcpServers` or `enabledMcpjsonServers` committed to
> the project's `.claude/settings.json` is ignored in an untrusted
> folder, and the server stays at `⏸ Pending approval` instead of being
> connected and health-checked. »

`code.claude.com/docs/en/mcp.md`, section « Project server approvals and
workspace trust » · lu le 19/09/2026

L'approbation doit donc venir d'ailleurs — `~/.claude/settings.json`, que
seul le script de configuration de l'environnement écrit avant le
démarrage. Si l'outil `search_claude_code_docs` manque, c'est là qu'il
faut regarder, pas dans le dépôt. Voir l'entrée du 19 septembre dans
`DECISIONS.md`.

## Ce qui ne vit pas ici

Le serveur, la base et la console web sont dans le dépôt admin, et leur
documentation y est indexée : Cloudflare Workers, D1, Wrangler,
limiteurs de débit, déclencheurs cron, Web Crypto, WebGL, CSP.
