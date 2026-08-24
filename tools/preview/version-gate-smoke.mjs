/*
 * Test du verrou de version.
 *
 * Un verrou se juge d'abord sur ses faux positifs. Bloquer une version
 * périmée est facile ; ne jamais bloquer un conducteur dont la version
 * est bonne l'est beaucoup moins, et c'est ce qui décide si ce contrôle
 * sécurise le projet ou devient son nouveau point de panne.
 *
 * La règle éprouvée ici est donc dissymétrique : bloquer exige une
 * affirmation, jamais un silence. Pas de politique en cache, fichier
 * illisible, plancher incohérent, réseau absent depuis des semaines,
 * première installation — le widget fonctionne. Seul un plancher
 * lisible, cohérent et réellement au-dessus de la version installée
 * l'arrête.
 *
 * Le banc monte le vrai CTS Widget Engine sur un disque en mémoire et
 * lit ce qu'il renvoie à CTS Dashboard, puisque c'est ce contexte qui
 * décide de l'écran affiché.
 */

import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, "..", "..")

const ROOT = "/docs/CTS Dashboard"
const DATA = `${ROOT}/Data`
const POLICY_PATH = `${DATA}/version-policy.json`

const NOW = new Date(2026, 7, 23, 10, 0, 0)

function loadModule(name, loaded, sandboxExtra = {}) {
  const source = fs.readFileSync(path.join(repository, `${name}.js`), "utf8")
  const module = { exports: {} }

  const sandbox = {
    module,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Date, Math, JSON, Number, String, Boolean, Array, Object, Set, Map,
    Promise, RegExp, Error, isNaN, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent, setTimeout,
    Timer: class {
      static schedule(ms, repeats, callback) {
        setTimeout(callback, 0)
        return new this()
      }
      invalidate() {}
    },
    config: { runsInWidget: true },
    args: { plainTexts: [] },
    UUID: { string: () => Math.random().toString(36).slice(2) },
    importModule: requested => {
      const key = String(requested).replace(/^.*\//, "")
      if (!loaded[key]) throw new Error(`module inattendu : ${key}`)
      return loaded[key]
    },
    ...sandboxExtra
  }

  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: name })
  return module.exports
}

/*
 * Le moteur est monté avec des doublures pour tout ce qui n'est pas le
 * verrou : la résolution de service renvoie toujours un contexte valide,
 * de sorte qu'un blocage observé ne puisse venir que du verrou lui-même.
 */
function buildEngine({ installedVersion, policy }) {
  const files = new Map()

  if (policy !== undefined) {
    files.set(POLICY_PATH, typeof policy === "string" ? policy : JSON.stringify(policy))
  }

  const fm = {
    joinPath: (a, b) => `${a}/${b}`,
    fileExists: target => files.has(target),
    isFileDownloaded: () => true,
    readString: target => files.get(target) ?? "",
    writeString: (target, content) => files.set(target, String(content)),
    createDirectory: () => {},
    remove: target => files.delete(target),
    move: (from, to) => {
      files.set(to, files.get(from))
      files.delete(from)
    },
    isDirectory: () => false,
    listContents: () => []
  }

  const loaded = {}

  loaded["CTS Utils"] = loadModule("CTS Utils", loaded)

  loaded["CTS Config"] = {
    fm,
    paths: { root: ROOT, data: DATA },
    files: { versionPolicy: POLICY_PATH, places: `${ROOT}/Database/places.json` },
    refresh: { activeMs: 60000, unknownMs: 300000, inactiveMs: 21600000, transitionDelaySeconds: 2 },
    pdf: {},
    dashboardVersion: installedVersion,
    ensureDirectories: () => {}
  }

  loaded["CTS Storage"] = {
    loadVersionPolicy: async () => {
      const content = files.get(POLICY_PATH)

      if (content === undefined) return null

      try {
        const value = JSON.parse(content)

        if (!value || typeof value !== "object" || Array.isArray(value)) return null

        const minimumVersion = String(value.minimumVersion || "").trim()

        if (!minimumVersion) return null

        return {
          minimumVersion,
          latestVersion: String(value.latestVersion || "").trim(),
          receivedAt: String(value.receivedAt || "")
        }
      } catch (_) {
        return null
      }
    },
    ensureReadable: async () => true,
    loadPreferences: async () => ({ textScale: 1 })
  }

  /*
   * Si le verrou laisse passer, la résolution rend un service valide :
   * un contexte bloqué ne peut donc venir que du verrou.
   */
  loaded["CTS Services Manager"] = {
    scanServices: async () => ({ success: true, status: "idle", remaining: 0, imported: [], failed: [], knownFailures: [], detectionErrors: [] }),
    resolveServiceForDate: async () => ({
      found: true,
      reason: "today",
      entry: { id: "2026-08-23_EA06", date: "2026-08-23", service: "EA06", cacheFile: "x.json" },
      source: { date: "2026-08-23", service: "EA06", validation: { valid: true }, slices: [] },
      service: "EA06",
      date: "2026-08-23",
      cacheFile: "x.json",
      pdfFile: "x.pdf",
      serviceEndAt: "",
      switchAfter: "",
      displayGraceMs: 3600000,
      withinGracePeriod: false
    }),
    listServicePdfs: async () => [],
    loadScanState: async () => ({ files: {} })
  }

  loaded["CTS Services Cleaner"] = {
    maintainServices: async () => ({ success: true, status: "idle", archived: [], deleted: [], skipped: [], errors: [] }),
    resolveServiceEndDate: () => null
  }

  loaded["CTS Service"] = {
    normalizeService: () => ({ valid: false, error: "doublure : le rendu n’est pas l’objet de ce banc" }),
    computeState: () => ({ type: "WORK" }),
    computeStats: () => ({}),
    getDisplaySlice: () => null
  }

  return loadModule("CTS Widget Engine", loaded)
}

const failures = []

function check(condition, message) {
  if (!condition) failures.push(message)
}

async function contextFor(options) {
  const engine = buildEngine(options)
  return engine.loadContext(NOW)
}

function isBlocked(context) {
  return context?.versionBlocked === true
}

/* ------------------------------------------ ce qui doit être bloqué */

{
  const context = await contextFor({
    installedVersion: "1.1.4",
    policy: { minimumVersion: "1.2.0", latestVersion: "1.2.0" }
  })

  check(isBlocked(context), "version sous le plancher : devrait être bloquée")
  check(context.valid === false, "un contexte bloqué ne doit jamais être valide")
  check(context.errorTitle === "Mise à jour requise", "le titre affiché est inattendu")
  check(
    String(context.errorMessage).includes("CTS Installer"),
    "le message doit indiquer la marche à suivre"
  )
  check(context.service === null, "un contexte bloqué ne doit porter aucun service")
  check(context.displaySlice === null, "un contexte bloqué ne doit porter aucune tranche")
}

{
  const context = await contextFor({
    installedVersion: "1.0.4",
    policy: { minimumVersion: "1.2.0", latestVersion: "1.2.0" }
  })

  check(isBlocked(context), "version très ancienne : devrait être bloquée")
}

/* -------------------------------- ce qui ne doit surtout pas bloquer */

{
  const context = await contextFor({
    installedVersion: "1.2.0",
    policy: { minimumVersion: "1.2.0", latestVersion: "1.2.0" }
  })

  check(!isBlocked(context), "version exactement au plancher : ne doit pas bloquer")
}

{
  const context = await contextFor({
    installedVersion: "1.3.0",
    policy: { minimumVersion: "1.2.0", latestVersion: "1.2.0" }
  })

  check(!isBlocked(context), "version au-dessus du plancher : ne doit pas bloquer")
}

{
  /* Une version récente, alors qu'un correctif vient de paraître. */
  const context = await contextFor({
    installedVersion: "1.2.0",
    policy: { minimumVersion: "1.2.0", latestVersion: "1.2.5" }
  })

  check(
    !isBlocked(context),
    "une version plus récente disponible ne doit jamais bloquer : seul le plancher compte"
  )
}

{
  /* Première installation, ou aucun réseau depuis toujours. */
  const context = await contextFor({ installedVersion: "1.0.4", policy: undefined })

  check(!isBlocked(context), "aucune politique en cache : ne doit jamais bloquer")
}

{
  const context = await contextFor({ installedVersion: "1.0.4", policy: "{ ceci n’est pas du JSON" })

  check(!isBlocked(context), "politique illisible : ne doit jamais bloquer")
}

{
  const context = await contextFor({ installedVersion: "1.0.4", policy: {} })

  check(!isBlocked(context), "politique sans plancher : ne doit jamais bloquer")
}

{
  const context = await contextFor({
    installedVersion: "1.0.4",
    policy: { minimumVersion: "pas-une-version", latestVersion: "1.2.0" }
  })

  check(!isBlocked(context), "plancher illisible : ne doit jamais bloquer")
}

{
  /*
   * Le garde-fou contre l'erreur de configuration : un plancher publié
   * au-dessus de la dernière version éteindrait jusqu'aux installations
   * à jour. Une telle politique est ignorée, pas appliquée.
   */
  const context = await contextFor({
    installedVersion: "1.2.0",
    policy: { minimumVersion: "1.9.0", latestVersion: "1.2.0" }
  })

  check(
    !isBlocked(context),
    "plancher au-dessus de la dernière version : politique incohérente, à ignorer"
  )
}

{
  const context = await contextFor({
    installedVersion: "1.1.4",
    policy: { minimumVersion: "1.2.0", latestVersion: "" }
  })

  check(
    isBlocked(context),
    "sans latestVersion, le plancher reste applicable : il n’y a rien à contredire"
  )
}

/* ------------------------------------------------ retour à la normale */

{
  /* La mise à jour a eu lieu : la même politique ne bloque plus. */
  const policy = { minimumVersion: "1.2.0", latestVersion: "1.2.0" }
  const before = await contextFor({ installedVersion: "1.1.4", policy })
  const after = await contextFor({ installedVersion: "1.2.0", policy })

  check(isBlocked(before), "avant mise à jour : devrait être bloqué")
  check(
    !isBlocked(after),
    "après mise à jour : le verdict doit devenir caduc de lui-même, sans réseau"
  )
}

/* --------------------------------------------------------- résultat */

if (failures.length) {
  console.error(`\n${failures.length} problème(s) :\n`)
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error("")
  process.exit(1)
}

console.log(
  "ok     Verrou de version (blocage sous le plancher, aucun faux positif hors ligne, " +
    "politique illisible ou incohérente ignorée, retour à la normale après mise à jour)"
)
