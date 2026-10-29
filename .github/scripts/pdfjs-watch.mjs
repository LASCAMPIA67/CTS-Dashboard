import fs from 'node:fs'

const ENGINE_FILE = 'CTS PDF Engine.js'
const REGISTRY_URL = 'https://registry.npmjs.org/pdfjs-dist'
const LIBRARY_FILES = ['pdf.min.mjs', 'pdf.worker.min.mjs']

const MINIMUM_LIBRARY_BYTES = 100 * 1024

// La même adresse que le moteur, qui y télécharge un fichier manquant sur l'appareil.
const buildUrl = (version, name) =>
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/legacy/build/${name}`

const PINNED_VERSION_PATTERN = /const PDFJS_VERSION\s*=\s*\n?\s*"([^"]+)"/

function readPinnedVersion() {
  const engine = fs.readFileSync(ENGINE_FILE, 'utf8').replace(/^﻿/, '')
  const match = engine.match(PINNED_VERSION_PATTERN)

  if (!match) {
    throw new Error(`PDFJS_VERSION est introuvable dans ${ENGINE_FILE}.`)
  }

  return { engine, version: match[1] }
}

async function readPublishedVersion() {
  const response = await fetch(REGISTRY_URL, {
    headers: { Accept: 'application/vnd.npm.install-v1+json' }
  })

  if (!response.ok) {
    throw new Error(`Le registre npm a répondu ${response.status}.`)
  }

  const version = (await response.json())?.['dist-tags']?.latest

  if (typeof version !== 'string' || !version) {
    throw new Error("Le registre npm ne déclare aucune version « latest ».")
  }

  return version
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

// Contrôlé avant d'être écrit : un CDN sert parfois une page d'erreur avec un code 200.
async function downloadLibrary(version, name) {
  const response = await fetch(buildUrl(version, name))

  if (!response.ok) {
    throw new Error(`${name} en ${version} : jsDelivr a répondu ${response.status}.`)
  }

  const bytes = Buffer.from(await response.arrayBuffer())

  if (bytes.length < MINIMUM_LIBRARY_BYTES) {
    throw new Error(`${name} en ${version} est anormalement petit : ${bytes.length} octets.`)
  }

  if (!bytes.includes(`"${version}"`)) {
    throw new Error(`${name} téléchargé ne porte pas la version ${version}.`)
  }

  fs.writeFileSync(name, bytes)

  return bytes.length
}

function writeOutputs(values) {
  const file = process.env.GITHUB_OUTPUT

  if (!file) return

  fs.appendFileSync(
    file,
    Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join('')
  )
}

const { engine, version: pinned } = readPinnedVersion()
const published = await readPublishedVersion()
const order = compareVersionStrings(published, pinned)

if (order === null) {
  throw new Error(`Versions illisibles : ${pinned} figée, ${published} publiée.`)
}

if (order <= 0) {
  console.log(`PDF.js ${pinned} est à jour — npm publie ${published}.`)
  writeOutputs({ changed: 'false' })
  process.exit(0)
}

console.log(`PDF.js ${pinned} figée, ${published} publiée. Dépôt des fichiers.`)

if (published.split('.')[0] !== pinned.split('.')[0]) {
  console.log(
    `Attention : changement de version MAJEURE, ${pinned.split('.')[0]} → ` +
    `${published.split('.')[0]}. L'interface de PDF.js peut avoir changé.`
  )
}

for (const name of LIBRARY_FILES) {
  const bytes = await downloadLibrary(published, name)
  console.log(`  ${name} : ${bytes} octets`)
}

fs.writeFileSync(
  ENGINE_FILE,
  engine.replace(PINNED_VERSION_PATTERN, `const PDFJS_VERSION = "${published}"`)
)

console.log(`${ENGINE_FILE} relevé à ${published}.`)

writeOutputs({
  changed: 'true',
  pinned,
  published,
  major: published.split('.')[0] !== pinned.split('.')[0] ? 'true' : 'false'
})
