// Validation du dépôt CTS Dashboard.
// Exécutable en CI et en local : node .github/scripts/validate.mjs

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const EXPECTED_SCRIPTS = 17
const EXPECTED_RESOURCES = 5
const INSTALLER_FILE = 'CTS Installer.js'
const METADATA_MARKER = '// Variables used by Scriptable.'
const MINIMUM_LIBRARY_BYTES = 40 * 1024

// Fichiers .js présents à la racine sans faire partie du manifeste.
// CTS Simulator est un outil de maintenance, installé à la main par le
// mainteneur. CTS Repair remplace un installateur cassé et s'installe
// lui aussi à la main. Ni l'un ni l'autre n'est distribué par
// CTS Installer.
const UNMANIFESTED_SCRIPTS = new Set([
  INSTALLER_FILE,
  'CTS Simulator.js',
  'CTS Repair.js'
])

const problems = []
const fail = message => problems.push(message)

const read = file => fs.readFileSync(file, 'utf8').replace(/^﻿/, '')

function checkSyntax(content, label) {
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '--check'],
    { input: content, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  )

  if (result.status !== 0) {
    process.stderr.write(result.stderr || '')
    fail(`Erreur de syntaxe JavaScript dans ${label}`)
    return false
  }
  return true
}

/*
 * Une constante de premier niveau déclarée sous l'appel au point d'entrée
 * reste dans sa zone morte temporelle pendant toute l'exécution : la
 * fonction qui l'utilise lève « Cannot access … before initialization ».
 * La syntaxe est pourtant valide, et le fichier ne révèle le défaut qu'au
 * moment précis où le chemin d'exécution y passe — un piège qui a déjà
 * atteint un utilisateur, avec CTS Installer 1.0.7.
 *
 * Le contrôle vaut pour tout script exécutable de la racine : les scripts
 * du manifeste sont des modules et n'ont pas de point d'entrée await.
 */
function checkEntryPoint(content, label) {
  const lines = content.split('\n')
  const entryLine = lines.findIndex(line => /^await\s+[A-Za-z_$][\w$]*\(/.test(line))

  if (entryLine === -1) return

  lines.forEach((line, index) => {
    const declaration = line.match(/^(?:const|let)\s+([A-Za-z_$][\w$]*)/)
    if (declaration && index > entryLine) {
      fail(
        `${label} déclare ${declaration[1]} ligne ${index + 1}, ` +
        `après l'appel au point d'entrée ligne ${entryLine + 1}. Une constante ` +
        `de premier niveau doit être déclarée avant, sans quoi elle est ` +
        `inaccessible pendant l'exécution.`
      )
    }
  })
}

// unique : impose un seul marqueur dans tout le fichier. Désactivé pour
// CTS Installer, qui écrit des scripts Scriptable et porte donc
// légitimement ce marqueur dans des chaînes de caractères.
function checkScriptableMetadata(content, label, { unique = true } = {}) {
  if (!content.startsWith(METADATA_MARKER)) {
    fail(`Les métadonnées Scriptable doivent être en tête de ${label}`)
    return
  }

  const occurrences = content.split(METADATA_MARKER).length - 1
  if (unique && occurrences !== 1) {
    fail(`${label} contient ${occurrences} blocs de métadonnées Scriptable au lieu d'un seul`)
  }

  const header = content.split('\n').slice(0, 3)
  if (!/^\/\/ icon-color:\s*[^;]+;\s*icon-glyph:\s*[^;]+;\s*$/.test(header[2] || '')) {
    fail(`Ligne icon-color / icon-glyph invalide dans ${label}`)
  }
}

// ---------------------------------------------------------------- manifeste

let manifest
try {
  manifest = JSON.parse(read('version.json'))
} catch (error) {
  console.error(`version.json illisible : ${error.message}`)
  process.exit(1)
}

const scripts = Array.isArray(manifest.scripts) ? manifest.scripts : []
const resources = Array.isArray(manifest.resources) ? manifest.resources : []
const required = [...scripts, ...resources.map(item => item?.name)]

if (scripts.length !== EXPECTED_SCRIPTS || resources.length !== EXPECTED_RESOURCES) {
  fail(
    `Distribution attendue : ${EXPECTED_SCRIPTS} scripts + ${EXPECTED_RESOURCES} ressources, ` +
    `trouvé ${scripts.length} + ${resources.length}. ` +
    `Un changement volontaire doit être répercuté dans version.json, README.md, ` +
    `TEST_PLAN.md et .github/scripts/validate.mjs.`
  )
}

const duplicates = required.filter((name, index) => required.indexOf(name) !== index)
if (duplicates.length) {
  fail(`Doublons dans le manifeste : ${[...new Set(duplicates)].join(', ')}`)
}

if (!manifest.entryPoint || !scripts.includes(manifest.entryPoint)) {
  fail(`Point d'entrée absent des scripts : ${manifest.entryPoint || 'non défini'}`)
}

if (!Array.isArray(manifest.protectedPaths) || !manifest.protectedPaths.length) {
  fail('protectedPaths doit lister au moins un dossier à préserver')
}

const destinations = resources.map(item => item?.destination)
const duplicateDestinations = destinations.filter(
  (value, index) => destinations.indexOf(value) !== index
)
if (duplicateDestinations.length) {
  fail(`Destinations de ressources dupliquées : ${[...new Set(duplicateDestinations)].join(', ')}`)
}

for (const destination of destinations) {
  const value = String(destination || '')
  if (!value || value.startsWith('/') || value.split('/').includes('..')) {
    fail(`Destination de ressource invalide : ${value || '(vide)'}`)
  }
}

for (const file of required) {
  if (!file) {
    fail('Entrée de manifeste sans nom de fichier')
    continue
  }
  if (!fs.existsSync(file)) {
    fail(`Fichier du manifeste absent : ${file}`)
    continue
  }
  if (fs.statSync(file).size <= 0) {
    fail(`Fichier du manifeste vide : ${file}`)
  }
}

// ------------------------------------------------- scripts distribués + JSON

for (const file of scripts) {
  if (!fs.existsSync(file)) continue
  const content = read(file)
  checkScriptableMetadata(content, file)
  checkSyntax(content, file)
}

for (const file of fs.readdirSync('.').filter(name => name.endsWith('.json'))) {
  try {
    JSON.parse(read(file))
  } catch (error) {
    fail(`JSON invalide dans ${file} : ${error.message}`)
  }
}

// -------------------------------------------------- aucun script orphelin

const rootScripts = fs.readdirSync('.').filter(name => name.endsWith('.js'))
for (const file of rootScripts) {
  if (!scripts.includes(file) && !UNMANIFESTED_SCRIPTS.has(file)) {
    fail(
      `${file} est présent à la racine sans figurer dans version.json. ` +
      `Ajoute-le au manifeste ou à UNMANIFESTED_SCRIPTS.`
    )
  }
}

/*
 * Les scripts hors manifeste sont installés à la main, donc jamais
 * remplacés par CTS Installer : une faute y reste sur l'iPhone jusqu'à ce
 * que quelqu'un la remarque. Ils reçoivent donc les mêmes contrôles que
 * les scripts distribués. Le marqueur de métadonnées n'est unique que
 * pour ceux qui n'écrivent pas de scripts Scriptable — CTS Installer et
 * CTS Repair le portent légitimement dans des chaînes.
 */
for (const file of UNMANIFESTED_SCRIPTS) {
  if (!fs.existsSync(file)) {
    fail(`${file} est déclaré comme distribué hors manifeste mais absent du dépôt`)
    continue
  }

  const content = read(file)

  if (!content.trim()) {
    fail(`${file} est vide`)
    continue
  }

  checkScriptableMetadata(content, file, { unique: file === 'CTS Simulator.js' })
  checkSyntax(content, file)
  checkEntryPoint(content, file)
}

// ------------------------------------------------------------ CTS Installer

// Syntaxe, métadonnées et point d'entrée sont déjà contrôlés plus haut,
// avec les autres scripts hors manifeste. Reste la cohérence de version.
if (fs.existsSync(INSTALLER_FILE)) {
  const installer = read(INSTALLER_FILE)
  const declared = installer.match(/const INSTALLER_VERSION = "([^"]+)"/)

  if (!declared) {
    fail(`${INSTALLER_FILE} ne déclare pas INSTALLER_VERSION`)
  } else if (declared[1] !== manifest.installerVersion) {
    fail(
      `Version de l'installateur incohérente : version.json=${manifest.installerVersion}, ` +
      `${INSTALLER_FILE}=${declared[1]}`
    )
  }
}

// ------------------------------------------------------ cohérence de version

const config = read('CTS Config.js')
const configVersion = config.match(/const DASHBOARD_VERSION = "([^"]+)"/)
if (!configVersion || configVersion[1] !== manifest.version) {
  fail(
    `Version incohérente : version.json=${manifest.version}, ` +
    `CTS Config.js=${configVersion?.[1] || 'absente'}. ` +
    `Le changement de version doit être atomique.`
  )
}

for (const [label, value] of [
  ['version', manifest.version],
  ['installerVersion', manifest.installerVersion],
  ['minimumInstaller', manifest.minimumInstaller]
]) {
  if (!/^\d+\.\d+\.\d+$/.test(String(value || ''))) {
    fail(`${label} n'est pas au format x.y.z : ${value}`)
  }
}

// ------------------------------------------------------- libellés de lieux

/*
 * Les limites correspondent au seuil à partir duquel le widget commence à
 * réduire la police. Les respecter garantit que rien n'est jamais rapetissé
 * dans le rendu courant.
 *
 *   places.json alimente le bandeau horaires  → placeSoftLimit  = 18
 *   stops.json  alimente direction et mise en ligne → 21, la même limite
 *               que CTS Database applique au repli quand un arrêt manque
 *
 * Un point de relève est à la fois un lieu et un arrêt : il figure dans les
 * deux bases. Le bandeau horaires le nomme via places.json, la direction via
 * stops.json. Si l'on n'en renomme qu'un, le widget désigne le même endroit
 * de deux façons selon la ligne — d'où le contrôle d'appariement plus bas.
 */
/* Lue dans CTS Database pour que les deux limites ne puissent pas diverger. */
const STOP_LABEL_LIMIT = (() => {
  const match = read('CTS Database.js').match(/const MAX_STOP_LABEL_LENGTH = (\d+)/)
  if (!match) fail('MAX_STOP_LABEL_LENGTH est introuvable dans CTS Database.js')
  return match ? Number(match[1]) : 21
})()

const LABEL_LIMITS = [
  ['places.json', 18, 'bandeau horaires'],
  ['stops.json', STOP_LABEL_LIMIT, 'direction et mise en ligne']
]

const labels = new Map()

for (const [file, limit, usage] of LABEL_LIMITS) {
  if (!fs.existsSync(file)) continue
  try {
    const entries = JSON.parse(read(file))
    labels.set(file, entries)

    for (const [code, entry] of Object.entries(entries)) {
      const label = typeof entry === 'string' ? entry : String(entry?.name || '')
      if (label.length > limit) {
        fail(
          `Libellé trop long pour le ${usage} : ${file} ${code} = ` +
          `"${label}" (${label.length} caractères, maximum ${limit})`
        )
      }
    }
  } catch (_) {
    // Le JSON invalide est déjà signalé plus haut.
  }
}

if (labels.has('places.json') && labels.has('stops.json')) {
  const stopLabels = new Set(
    Object.values(labels.get('stops.json')).map(entry =>
      typeof entry === 'string' ? entry : String(entry?.name || '')
    )
  )

  const places = labels.get('places.json')
  const nameOf = entry =>
    typeof entry === 'string' ? entry : String(entry?.name || '')

  for (const [code, entry] of Object.entries(places)) {
    if (String(entry?.type || '') !== 'relief') continue
    const label = nameOf(entry)
    if (label && !stopLabels.has(label)) {
      fail(
        `Le point de relève ${code} s'appelle "${label}" dans places.json mais ` +
        `aucun arrêt ne porte ce nom dans stops.json — les deux bases ont ` +
        `divergé, le widget nommerait ce lieu de deux façons`
      )
    }

    /*
     * CTS Database ramène ELSA_C à ELSA quand le code exact est absent.
     * Réinscrire un suffixe qui porte le même nom que sa racine n'ajoute
     * donc rien, et laisse croire qu'il faut énumérer les combinaisons —
     * c'est exactement l'illusion qui a produit « Code ELSA_C ». Un
     * suffixe reste légitime s'il nomme un lieu réellement différent.
     */
    const root = code.replace(/_[A-Z0-9]{1,2}$/, '')
    if (root !== code && places[root] && nameOf(places[root]) === label) {
      fail(
        `${code} répète le nom de sa racine ${root} ("${label}") : ` +
        `CTS Database résout déjà les suffixes, cette entrée est inutile`
      )
    }
  }
}

// ------------------------------------------------- contraste de la palette

/*
 * Le widget se lit debout, dehors, souvent en plein soleil. La lumière
 * ambiante réfléchie par la dalle s'ajoute au texte comme au fond et écrase
 * les rapports de contraste ; il faut donc une marge confortable en
 * intérieur pour rester lisible dehors.
 *
 * On mesure le pire cas de chaque état : le coin le plus clair du dégradé,
 * recouvert du voile blanc le plus opaque d'une carte, puis teinté par
 * l'accent comme l'est la ligne de la tranche en cours. Ce sont les deux
 * surfaces qui portent du texte. Les pastilles — numéro de tranche, état,
 * flèche — sont décoratives et volontairement hors périmètre : leur fond
 * plus teinté n'entoure qu'un chiffre ou un pictogramme, jamais une
 * information à lire.
 *
 * Si un réglage de couleur passe sous les seuils, la CI le refuse.
 */
const CONTRAST_TARGETS = { primary: 12, secondary: 7, accent: 7 }
const CARD_WHITE_ALPHA = 0.055
const PROGRAM_WHITE_ALPHA = 0.05

/* Lu dans le moteur de rendu pour que le contrôle suive toute retouche. */
const ACTIVE_ROW_ACCENT_ALPHA = (() => {
  const renderer = read('CTS Widget Renderer.js')
  const match = renderer.match(
    /backgroundColor\s*=\s*active\s*\r?\n?\s*\?\s*accentAlpha\(state,\s*([\d.]+)\)/
  )
  return match ? Number(match[1]) : 0.09
})()

const theme = read('CTS Widget Theme.js')

const palettes = [
  ...theme.matchAll(
    /(\w+): Object\.freeze\(\{ gradient: \[([^\]]+)\], accent: "(#[0-9A-Fa-f]{6})" \}\)/g
  )
].map(match => ({
  state: match[1],
  gradient: match[2].match(/#[0-9A-Fa-f]{6}/g) || [],
  accent: match[3]
}))

const themeColors = Object.fromEntries(
  [...theme.matchAll(/(\w+): "(#[0-9A-Fa-f]{6})"/g)].map(match => [match[1], match[2]])
)

if (!palettes.length) {
  fail('Aucune palette lisible dans CTS Widget Theme.js')
} else if (!themeColors.primaryText || !themeColors.secondaryText) {
  fail('Couleurs de texte introuvables dans CTS Widget Theme.js')
} else {
  for (const palette of palettes) {
    if (palette.gradient.length !== 4) {
      fail(`Le dégradé ${palette.state} ne compte pas quatre couleurs`)
      continue
    }

    const lightest = palette.gradient
      .slice()
      .sort((a, b) => relativeLuminance(b) - relativeLuminance(a))[0]

    const card = blend(lightest, '#FFFFFF', CARD_WHITE_ALPHA)
    const activeRow = blend(
      blend(lightest, '#FFFFFF', PROGRAM_WHITE_ALPHA),
      palette.accent,
      ACTIVE_ROW_ACCENT_ALPHA
    )

    for (const background of [card, activeRow]) {
      checkContrast(palette.state, themeColors.primaryText, background, CONTRAST_TARGETS.primary, 'texte principal')
      checkContrast(palette.state, themeColors.secondaryText, background, CONTRAST_TARGETS.secondary, 'texte secondaire')
      checkContrast(palette.state, palette.accent, background, CONTRAST_TARGETS.accent, 'accent')
    }
  }
}

function checkContrast(state, foreground, background, target, label) {
  const value = contrastRatio(foreground, background)
  if (value + 0.005 < target) {
    fail(
      `Contraste insuffisant en plein soleil — ${state}, ${label} : ` +
      `${foreground} sur ${background} donne ${value.toFixed(2)}:1, minimum ${target}:1`
    )
  }
}

function channels(hex) {
  const raw = hex.replace('#', '')
  return [0, 1, 2].map(index => parseInt(raw.slice(index * 2, index * 2 + 2), 16))
}

function blend(baseHex, overlayHex, alpha) {
  const base = channels(baseHex)
  const over = channels(overlayHex)
  const mixed = base.map((value, index) =>
    Math.round(value * (1 - alpha) + over[index] * alpha)
  )
  return '#' + mixed.map(value => value.toString(16).padStart(2, '0')).join('')
}

function relativeLuminance(hex) {
  const [r, g, b] = channels(hex).map(value => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(first, second) {
  const a = relativeLuminance(first)
  const b = relativeLuminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

// ------------------------------------------------------------------ PDF.js

const engine = read('CTS PDF Engine.js')
const pdfjsVersion = engine.match(/const PDFJS_VERSION\s*=\s*\n?\s*"([^"]+)"/)

if (!pdfjsVersion) {
  fail('PDFJS_VERSION est introuvable dans CTS PDF Engine.js')
}

for (const file of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  if (!fs.existsSync(file)) continue

  if (fs.statSync(file).size < MINIMUM_LIBRARY_BYTES) {
    fail(`${file} est anormalement petit`)
    continue
  }

  const content = read(file)
  if (!checkSyntax(content, file)) continue

  if (pdfjsVersion && !content.includes(`"${pdfjsVersion[1]}"`)) {
    fail(
      `${file} ne correspond pas à PDFJS_VERSION (${pdfjsVersion[1]}) ` +
      `déclarée dans CTS PDF Engine.js`
    )
  }
}

// ------------------------------------------------------------------ verdict

if (problems.length) {
  console.error(`\n${problems.length} problème(s) détecté(s) :\n`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log(
  `CTS Dashboard ${manifest.version} : ${scripts.length} scripts + ` +
  `${resources.length} ressources validés, CTS Installer ${manifest.installerVersion} validé, ` +
  `PDF.js ${pdfjsVersion?.[1] || '?'} cohérent`
)
