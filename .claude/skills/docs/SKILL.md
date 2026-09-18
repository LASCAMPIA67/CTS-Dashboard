---
name: docs
description: Index des technologies du dépôt et de leur documentation officielle. À ouvrir avant toute modification touchant Scriptable, le widget, iCloud, PDF.js, les bancs d'essai Node ou la chaîne GitHub, et avant de répondre à une question portant sur l'une d'elles.
---

# Documentation des technologies

Ne réponds jamais de mémoire sur une technologie listée ici : ouvre sa
page, puis dis laquelle tu as lue. Quand une adresse est marquée ●, elle
n'a pas été vérifiée — dis-le au mainteneur plutôt que de t'y fier.

Les contraintes déjà établies, citées et datées, sont dans les fichiers
annexes : [`scriptable.md`](scriptable.md). Lis l'annexe avant d'aller en
ligne, elle répond peut-être déjà.

## Sur l'iPhone du collègue

| Technologie | Version figée | Où | Documentation |
|---|---|---|---|
| Scriptable — l'app qui exécute les scripts et rend le widget | iOS 15.5+ | tout le dépôt | ✓ `docs.scriptable.app` |
| JavaScript, exécuté par JavaScriptCore | — | 17 scripts | ● `developer.mozilla.org/fr/docs/Web/JavaScript` |
| iOS / iPadOS — cibles iOS 18 et 26 | — | `README.md` | ● `developer.apple.com/documentation` |
| Widget grand format (WidgetKit, via Scriptable) | — | `CTS Widget Renderer.js` | ● `developer.apple.com/documentation/widgetkit` |
| iCloud Drive | — | `CTS Config.js:5` | ✓ `support.apple.com/en-us/108922` et `/102563` |
| Trousseau iOS | — | `CTS Analytics Client.js` | ✓ `docs.scriptable.app/keychain` |
| PDF.js — lecture de la carte agent | **6.1.200**, build `legacy` | `CTS PDF Engine.js:9` | ● `mozilla.github.io/pdf.js/api` |
| HTML / CSS / DOM en WebView | — | `CTS PDF Engine.js:785-1390` | ● `developer.mozilla.org` |
| Streams API — un correctif maison compense son absence | — | `CTS PDF Engine.js:789` | ● `developer.mozilla.org/en-US/docs/Web/API/Streams_API` |
| HASTUS (Giro) — le format de la carte agent | — | `CTS Parser.js` | format propriétaire, aucune doc publique |

**API Scriptable réellement employée**, chacune a sa page :
`FileManager`, `ListWidget`, `UITable` / `UITableRow` / `UITableCell`,
`Request`, `WebView`, `Keychain`, `Device`, `Script`, `Timer`, `Alert`,
`Font`, `Color`, `LinearGradient`, `Size`, `Point`, `Data`, `Safari`,
`Pasteboard`, `UUID`, `args`, `config`, `importModule`.

## L'outillage, hors iPhone

| Technologie | Version | Où | Documentation |
|---|---|---|---|
| Node.js, modules ES | **22** | 17 bancs, `validate.mjs` | ● `nodejs.org/docs/latest-v22.x/api` |
| `node:vm` — exécute les scripts sur des doublures | — | `tools/preview/*.mjs` | ● `nodejs.org/docs/latest-v22.x/api/vm.html` |
| `node:fs`, `node:path`, `node:crypto`, `node:child_process`, `node:url`, `node:os` | — | bancs | ● même adresse |

Aucun cadriciel de test : les bancs sont des scripts Node nus.

## La chaîne GitHub et la distribution

| Technologie | Version | Documentation |
|---|---|---|
| GitHub Actions | `actions/checkout@v4`, `actions/setup-node@v4` | ● `docs.github.com/en/actions` |
| GitHub raw — les trois bases | — | ● `docs.github.com` |
| jsDelivr — d'où vient PDF.js | — | ● `jsdelivr.com/documentation` |
| Shields.io — les badges du README | — | ● `shields.io/docs` |
| Markdown GitHub, Mermaid, encarts `[!NOTE]` | — | ● `github.github.com/gfm` · `mermaid.js.org` |
| Licences MIT et Apache 2.0 (PDF.js) | — | ● `opensource.org/licenses` |

## L'environnement Claude Code

| Technologie | Où | Documentation |
|---|---|---|
| Claude Code — consignes, rythme, sessions | `CLAUDE.md` | ✓ `code.claude.com/docs` |
| MCP — le serveur `claude-code-docs` | `.mcp.json` | ✓ `code.claude.com/docs/en/mcp.md` |
| Hooks | `.claude/hooks/pdf-tools.sh` | ✓ `code.claude.com/docs/en/hooks.md` |
| Skills — dont celui-ci | `.claude/skills/` | ✓ `code.claude.com/docs/en/skills.md` |
| Commandes slash | `.claude/commands/` | ✓ `code.claude.com/docs/en/commands.md` |
| poppler-utils / `pdftoppm` — lecture des captures | script d'environnement | ● `poppler.freedesktop.org` |

L'index complet des pages Claude Code se prend à
`code.claude.com/docs/llms.txt`, et une page se lit en ajoutant `.md` à
son adresse.

## Ce qui ne vit pas ici

Le serveur, la base et la console web sont dans le dépôt admin, et leur
documentation y est indexée : Cloudflare Workers, D1, Wrangler,
limiteurs de débit, déclencheurs cron, Web Crypto, WebGL, CSP.
