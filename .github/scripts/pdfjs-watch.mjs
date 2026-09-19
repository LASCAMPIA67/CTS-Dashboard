// Veille de PDF.js.
// Exécutable en CI et en local : node .github/scripts/pdfjs-watch.mjs
//
// Elle ne publie rien et ne fusionne rien. Elle compare la version figée
// dans le moteur à celle que npm publie, et si npm est en avance, elle
// dépose les deux fichiers et relève la constante — pour qu'une pull
// request soit lisible d'un coup d'œil.
//
// La décision reste à la main, et ce n'est pas une prudence de principe :
// `pdf-engine-smoke.mjs` tourne dans Node, sur des doublures, et ne peut
// pas ouvrir de WebView. Une CI verte prouve que le moteur charge et que
// les fichiers correspondent au numéro déclaré ; elle ne prouve pas
// qu'une nouvelle version de PDF.js lit une carte agent sur un iPhone.

import fs from 'node:fs'

const ENGINE_FILE = 'CTS PDF Engine.js'
const REGISTRY_URL = 'https://registry.npmjs.org/pdfjs-dist'
const LIBRARY_FILES = ['pdf.min.mjs', 'pdf.worker.min.mjs']

// Le même plancher que celui du validateur : en dessous, ce n'est pas une
// bibliothèque, c'est une page d'erreur.
const MINIMUM_LIBRARY_BYTES = 40 * 1024

// La même adresse que celle du moteur. Les deux doivent rester d'accord :
// le moteur télécharge ici quand un fichier manque sur l'appareil.
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

/*
 * L'en-tête abrégé du registre suffit et pèse mille fois moins que la
 * fiche complète, qui porte l'historique de toutes les versions.
 */
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

/*
 * Le contenu reçu n'est écrit qu'une fois contrôlé, pour la raison qui a
 * déjà coûté un installateur perdu à un collègue : un CDN qui répond une
 * page d'erreur répond quand même 200 de temps en temps.
 */
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

/*
 * Un changement de version majeure ne s'arrête pas ici : les bancs
 * diront eux-mêmes s'ils passent. Il s'annonce seulement, parce qu'il ne
 * se relit pas dans un numéro à trois nombres.
 */
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
