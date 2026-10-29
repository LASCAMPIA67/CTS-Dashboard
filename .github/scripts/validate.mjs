import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  MESSAGES_DIRECTORY,
  dashboardAnnouncement,
  dashboardButton,
  installerAnnouncement,
  installerButton
} from './messages.mjs'

const EXPECTED_SCRIPTS = 17
const EXPECTED_RESOURCES = 5
const INSTALLER_FILE = 'CTS Installer.js'
const METADATA_MARKER = '// Variables used by Scriptable.'
const MINIMUM_LIBRARY_BYTES = 100 * 1024

const UNMANIFESTED_SCRIPTS = new Set([INSTALLER_FILE, 'CTS Repair.js'])

const ADMIN_ONLY_SCRIPTS = [
  'CTS Analytics Admin.js',
  'CTS Analytics Test.js',
  'CTS Automation Tester.js',
  'CTS Database Editor.js',
  'CTS PDF Tester.js',
  'CTS Simulator.js'
]

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

const CREDIT_PATTERN = /IPPOLITO|Cré[ée] et d[ée]velopp[ée] par/i

for (const file of scripts) {
  if (!fs.existsSync(file)) continue
  const content = read(file)
  checkScriptableMetadata(content, file)
  checkSyntax(content, file)

  if (CREDIT_PATTERN.test(content)) {
    fail(
      `${file} porte un crédit d'auteur. Le widget doit en rester exempt : ` +
      `ce crédit n'a sa place que dans CTS Installer.`
    )
  }
  checkEntryPoint(content, file)
}

for (const file of fs.readdirSync('.').filter(name => name.endsWith('.json'))) {
  try {
    JSON.parse(read(file))
  } catch (error) {
    fail(`JSON invalide dans ${file} : ${error.message}`)
  }
}

for (const file of ADMIN_ONLY_SCRIPTS) {
  if (fs.existsSync(file)) {
    fail(
      `${file} est un outil réservé au mainteneur et ne doit pas figurer ` +
      `dans ce dépôt public. Retire-le de l'index avant de committer.`
    )
  }
}

const rootScripts = fs.readdirSync('.').filter(name => name.endsWith('.js'))
for (const file of rootScripts) {
  if (!scripts.includes(file) && !UNMANIFESTED_SCRIPTS.has(file)) {
    fail(
      `${file} est présent à la racine sans figurer dans version.json. ` +
      `Ajoute-le au manifeste ou à UNMANIFESTED_SCRIPTS.`
    )
  }
}

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

  checkScriptableMetadata(content, file, { unique: false })
  checkSyntax(content, file)
  checkEntryPoint(content, file)
}

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
  ['minimumInstaller', manifest.minimumInstaller],
  ['minimumDashboard', manifest.minimumDashboard]
]) {
  if (!/^\d+\.\d+\.\d+$/.test(String(value || ''))) {
    fail(`${label} n'est pas au format x.y.z : ${value}`)
  }
}

const floorOrder = compareVersionStrings(manifest.minimumDashboard, manifest.version)

if (floorOrder === null) {
  fail(`minimumDashboard ou version illisible : ${manifest.minimumDashboard} / ${manifest.version}`)
} else if (floorOrder > 0) {
  fail(
    `minimumDashboard (${manifest.minimumDashboard}) dépasse la version publiée ` +
    `(${manifest.version}). Ce plancher bloquerait aussi les installations à jour.`
  )
}

const installerFloorOrder = compareVersionStrings(
  manifest.minimumInstaller,
  manifest.installerVersion
)

if (installerFloorOrder === null) {
  fail(
    `minimumInstaller ou installerVersion illisible : ` +
    `${manifest.minimumInstaller} / ${manifest.installerVersion}`
  )
} else if (installerFloorOrder > 0) {
  fail(
    `minimumInstaller (${manifest.minimumInstaller}) dépasse l'installateur publié ` +
    `(${manifest.installerVersion}). La mise à jour imposée n'aurait alors aucune issue.`
  )
}

function compareVersionStrings(first, second) {
  const parse = value => {
    const parts = String(value ?? '').trim().split('.')

    if (parts.length !== 3 || !parts.every(part => /^\d+$/.test(part))) return null

    return parts.map(Number)
  }

  const a = parse(first)
  const b = parse(second)

  if (!a || !b) return null

  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1
  }

  return 0
}

for (const [product, version, button, announcement] of [
  ['CTS Dashboard', manifest.version, dashboardButton, dashboardAnnouncement],
  ['CTS Installer', manifest.installerVersion, installerButton, installerAnnouncement]
]) {
  if (!announcement(version)) {
    fail(
      `Aucun message de ${MESSAGES_DIRECTORY}/ ne cite « ${button(version)} » : la ` +
      `Release de ${product} ${version} n'aurait pas de note. Le message s'écrit ` +
      `d'après MESSAGES.md, dans la pull request qui écrit le numéro.`
    )
  }
}

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

    const root = code.replace(/_[A-Z0-9]{1,2}$/, '')
    if (root !== code && places[root] && nameOf(places[root]) === label) {
      fail(
        `${code} répète le nom de sa racine ${root} ("${label}") : ` +
        `CTS Database résout déjà les suffixes, cette entrée est inutile`
      )
    }
  }
}

const CONTRAST_TARGETS = { primary: 12, secondary: 7, accent: 7 }
const CARD_WHITE_ALPHA = 0.055
const PROGRAM_WHITE_ALPHA = 0.05

const ACTIVE_ROW_ACCENT_ALPHA = (() => {
  const renderer = read('CTS Widget Renderer.js')
  const match = renderer.match(
    /backgroundColor\s*=\s*active\s*\?\s*accentAlpha\(state,\s*([\d.]+)\)/
  )
  if (!match) fail("L'opacité d'accent de la ligne active est introuvable dans CTS Widget Renderer.js")
  return match ? Number(match[1]) : 0.09
})()

const theme = read('CTS Widget Theme.js')

const palettes = [
  ...theme.matchAll(
    /(\w+):\s*Object\.freeze\(\{\s*gradient:\s*\[([^\]]+)\],\s*accent:\s*"(#[0-9A-Fa-f]{6})"\s*\}\)/g
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

const engine = read('CTS PDF Engine.js')
const pdfjsVersion = engine.match(/const PDFJS_VERSION\s*=\s*\n?\s*"([^"]+)"/)

if (!pdfjsVersion) {
  fail('PDFJS_VERSION est introuvable dans CTS PDF Engine.js')
}

for (const [file, pattern] of [
  ['CTS PDF Engine.js', /const MINIMUM_LIBRARY_SIZE_KB = (\d+)/],
  [INSTALLER_FILE, /const MINIMUM_LIBRARY_KILOBYTES = (\d+)/],
  ['.github/scripts/pdfjs-watch.mjs', /const MINIMUM_LIBRARY_BYTES = (\d+) \* 1024/]
]) {
  const floor = read(file).match(pattern)

  if (!floor || Number(floor[1]) * 1024 !== MINIMUM_LIBRARY_BYTES) {
    fail(`${file} ne juge pas PDF.js sur le plancher de ${MINIMUM_LIBRARY_BYTES / 1024} Ko`)
  }
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
