/*
 * Contrôle de la version publiée.
 *
 * Ce mécanisme a le pouvoir de cacher son service à un conducteur. La
 * règle qui prime sur toutes les autres est donc négative : hors du cas
 * où une version supérieure est **certaine**, il ne doit rien bloquer.
 * Réseau coupé, GitHub en panne, réponse illisible, version farfelue,
 * fichier de cache corrompu — chacun de ces cas doit rendre la main et
 * laisser le service s'afficher.
 *
 * CTS Resources est donc chargé avec de vraies doublures, et interrogé
 * dans chacune de ces situations.
 */

import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, "..", "..")

const HOUR = 60 * 60 * 1000

const failures = []

function check(condition, message) {
  if (!condition) failures.push(message)
}

function loadResources({
  installed,
  response,
  cache = null,
  now = new Date(),
  readable = true,
  writable = true
}) {
  const source = fs.readFileSync(path.join(repository, "CTS Resources.js"), "utf8")
  const module = { exports: {} }
  const disk = new Map()
  let requests = 0

  if (cache) disk.set("/data/version-check.json", JSON.stringify(cache))

  /*
   * Un vrai système de fichiers en mémoire, et deux interrupteurs :
   * `readable` simule un fichier qu'iCloud refuse de rendre, `writable`
   * un disque qui n'accepte pas l'écriture. Ce sont ces deux situations,
   * absentes du premier banc, qui ont laissé passer la rafale de requêtes.
   */
  const fm = {
    joinPath: (a, b) => `${a}/${b}`,
    fileExists: target => disk.has(target),
    readString: target => {
      if (!readable) throw new Error("fichier indisponible")
      return disk.get(target) ?? ""
    },
    writeString: (target, content) => {
      if (!writable) throw new Error("écriture refusée")
      disk.set(target, String(content))
    }
  }

  const utils = loadUtils()

  const loaded = {
    "CTS Config": {
      fm,
      files: { lines: "/l", stops: "/s", places: "/p" },
      paths: { data: "/data" },
      dashboardVersion: installed,
      repository: { owner: "o", name: "n", branch: "main" },
      ensureDirectories: () => {}
    },
    "CTS Storage": {
      readJson: async (_, fallback = null) => fallback,
      writeJson: () => {},
      writeTextSafely: async () => {},
      ensureDownloaded: async () => true
    },
    "CTS Utils": utils
  }

  const sandbox = {
    module,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Date, Math, JSON, Number, String, Boolean, Array, Object, Promise, RegExp, Error,
    isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, setTimeout,
    importModule: name => loaded[String(name)],
    Request: class {
      constructor(url) {
        this.url = url
        this.headers = {}
        this.response = { statusCode: response.statusCode ?? 200 }
        requests++
      }
      async loadJSON() {
        if (response.throws) throw new Error("réseau indisponible")
        return response.body
      }
      async loadString() {
        if (response.throws) throw new Error("réseau indisponible")
        return JSON.stringify(response.body)
      }
    }
  }

  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: "CTS Resources.js" })

  return { RESOURCES: module.exports, disk, requests: () => requests, now }
}

function loadUtils() {
  const source = fs.readFileSync(path.join(repository, "CTS Utils.js"), "utf8")
  const module = { exports: {} }

  const sandbox = {
    module,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Date, Math, JSON, Number, String, Boolean, Array, Object, Promise, RegExp, Error,
    isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, setTimeout,
    args: { plainTexts: [] },
    config: {},
    Timer: class { static schedule(_, __, cb) { setTimeout(cb, 0) } invalidate() {} }
  }

  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: "CTS Utils.js" })
  return module.exports
}

const manifest = { version: "1.0.16" }

/* Le seul cas où le service doit céder la place. */
{
  const { RESOURCES } = loadResources({
    installed: "1.0.12",
    response: { body: manifest }
  })

  const outdated = await RESOURCES.checkPublishedVersion(new Date())

  check(Boolean(outdated), "une version en retard n'est pas signalée")
  check(
    outdated?.installed === "1.0.12" && outdated?.published === "1.0.16",
    "les deux versions ne sont pas rapportées correctement"
  )
}

/*
 * Tous les cas suivants doivent rendre null : le conducteur voit son
 * service. Un seul faux positif ici et quelqu'un se retrouve sans son
 * horaire un matin.
 */
const mustNotBlock = [
  ["installation à jour", { installed: "1.0.16", response: { body: manifest } }],
  ["installation en avance", { installed: "1.0.17", response: { body: manifest } }],
  ["réseau coupé", { installed: "1.0.12", response: { throws: true } }],
  ["GitHub en panne", { installed: "1.0.12", response: { body: {}, statusCode: 503 } }],
  ["réponse sans version", { installed: "1.0.12", response: { body: { name: "x" } } }],
  ["version farfelue", { installed: "1.0.12", response: { body: { version: "abc" } } }],
  ["version vide", { installed: "1.0.12", response: { body: { version: "" } } }],
  ["version installée inconnue", { installed: "", response: { body: manifest } }],
  [
    "cache corrompu",
    {
      installed: "1.0.12",
      response: { throws: true },
      cache: { checkedAt: "pas une date", published: "1.0.16" }
    }
  ]
]

for (const [label, options] of mustNotBlock) {
  const { RESOURCES } = loadResources(options)
  const outdated = await RESOURCES.checkPublishedVersion(new Date())

  check(outdated === null, `${label} : le service serait caché à tort`)
}

/* Le cache évite le réseau pendant six heures, puis le reprend. */
{
  const now = new Date()

  const fresh = loadResources({
    installed: "1.0.12",
    response: { body: manifest },
    cache: {
      checkedAt: new Date(now.getTime() - 2 * HOUR).toISOString(),
      published: "1.0.16"
    }
  })

  const outdated = await fresh.RESOURCES.checkPublishedVersion(now)

  check(Boolean(outdated), "le cache frais ne signale plus la version en retard")
  check(fresh.requests() === 0, "le cache frais interroge quand même le réseau")

  const stale = loadResources({
    installed: "1.0.12",
    response: { body: manifest },
    cache: {
      checkedAt: new Date(now.getTime() - 7 * HOUR).toISOString(),
      published: "1.0.14"
    }
  })

  await stale.RESOURCES.checkPublishedVersion(now)

  check(stale.requests() === 1, "un cache périmé n'est pas rafraîchi")
  check(
    JSON.parse(stale.disk.get("/data/version-check.json")).published === "1.0.16",
    "la réponse fraîche n'est pas mémorisée"
  )
}

/*
 * Le défaut qui a réellement atteint deux iPhones : le cache existe mais
 * le stockage refuse de le relire. Sans garde-fou, chaque rafraîchissement
 * du widget repartait sur le réseau — toutes les minutes pendant un
 * service — jusqu'au 429 de GitHub, qui bloquait aussi CTS Installer.
 */
{
  const unreadable = loadResources({
    installed: "1.0.12",
    response: { body: manifest },
    readable: false
  })

  for (let index = 0; index < 20; index++) {
    await unreadable.RESOURCES.checkPublishedVersion(new Date(Date.now() + index * 60000))
  }

  check(
    unreadable.requests() === 0,
    `cache illisible : ${unreadable.requests()} requêtes en 20 rafraîchissements ` +
      `au lieu de 0 — c'est la rafale qui a provoqué le 429`
  )

  const readOnly = loadResources({
    installed: "1.0.12",
    response: { body: manifest },
    writable: false
  })

  for (let index = 0; index < 20; index++) {
    await readOnly.RESOURCES.checkPublishedVersion(new Date(Date.now() + index * 60000))
  }

  check(
    readOnly.requests() === 0,
    `écriture impossible : ${readOnly.requests()} requêtes au lieu de 0`
  )
}

/* Un 429 met le contrôle en retrait pour la journée, pas pour six heures. */
{
  const now = new Date()

  const limited = loadResources({
    installed: "1.0.12",
    response: { body: {}, statusCode: 429 }
  })

  await limited.RESOURCES.checkPublishedVersion(now)

  const stored = JSON.parse(limited.disk.get("/data/version-check.json"))

  check(
    stored.retryAfterMs === 24 * 60 * 60 * 1000,
    "un 429 ne déclenche pas le retrait de 24 heures"
  )

  /* Sept heures plus tard, le retrait tient encore. */
  await limited.RESOURCES.checkPublishedVersion(new Date(now.getTime() + 7 * HOUR))

  check(limited.requests() === 1, "le retrait après 429 n'est pas respecté")
}

/* Le comparateur, sur les cas qui comptent pour ce projet. */
{
  const utils = loadUtils()
  const cases = [
    ["1.0.16", "1.0.12", 1],
    ["1.0.9", "1.0.12", -1],
    ["1.0.16", "1.0.16", 0],
    ["1.1", "1.0.99", 1],
    ["2.0", "1.9.9", 1]
  ]

  for (const [left, right, expected] of cases) {
    const result = Math.sign(utils.compareVersions(left, right))
    check(
      result === expected,
      `compareVersions("${left}", "${right}") donne ${result} au lieu de ${expected}`
    )
  }
}

if (failures.length) {
  console.log("ÉCHEC  contrôle de la version publiée")
  for (const failure of [...new Set(failures)]) console.log(`         ${failure}`)
  process.exit(1)
}

console.log(
  `ok     contrôle de la version publiée ` +
    `(1 blocage légitime, ${mustNotBlock.length} refus de bloquer, cache et comparateur)`
)
