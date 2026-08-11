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
const UNMANIFESTED_SCRIPTS = new Set([INSTALLER_FILE])

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

for (const file of UNMANIFESTED_SCRIPTS) {
  if (!fs.existsSync(file)) {
    fail(`${file} est déclaré comme distribué hors manifeste mais absent du dépôt`)
  }
}

// ------------------------------------------------------------ CTS Installer

if (fs.existsSync(INSTALLER_FILE)) {
  const installer = read(INSTALLER_FILE)

  if (!installer.trim()) {
    fail(`${INSTALLER_FILE} est vide`)
  } else {
    checkScriptableMetadata(installer, INSTALLER_FILE, { unique: false })
    checkSyntax(installer, INSTALLER_FILE)

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
