/*
 * Test du retrait d'un service.
 *
 * Un service retiré doit disparaître du widget, et seulement lui. Deux
 * chemins y mènent : la demande explicite depuis CTS Installer, et la
 * réconciliation automatique quand le conducteur supprime la carte
 * agent depuis l'app Fichiers. Les deux passent par la même fonction de
 * suppression — c'est elle qu'il faut éprouver, sous ses deux
 * déclencheurs.
 *
 * Le banc ne s'arrête pas à l'index : il rejoue la vraie sélection de
 * CTS Services Manager après chaque retrait. C'est le seul contrôle qui
 * dise ce que le widget montrera, puisque la sélection ne lit ni le
 * dossier Services ni les PDF, mais l'index et les caches.
 *
 * Le risque à couvrir en priorité n'est pas la suppression qui échoue,
 * c'est celle qui réussit trop bien : emporter les fichiers d'un
 * service voisin, ou conclure à une suppression alors qu'iCloud n'avait
 * simplement pas fini de synchroniser.
 */

import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, "..", "..")

const ROOT = "/docs/CTS Dashboard"
const SERVICES = `${ROOT}/Services`
const ARCHIVE = `${SERVICES}/Archive`
const CACHE = `${ROOT}/Cache/Services`
const TEXT_CACHE = `${CACHE}/Text`
const DATA = `${ROOT}/Data`
const INDEX_PATH = `${DATA}/services-index.json`

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const MISSING_GRACE_MS = HOUR
const OBSERVATION_INTERVAL_MS = 5 * MINUTE

/* 23 août 2026, 10 h locales : le service du jour est commencé. */
const NOW = new Date(2026, 7, 23, 10, 0, 0)

const TODAY = "2026-08-23"
const TOMORROW = "2026-08-24"

function loadModule(name, sandboxExtra, loaded) {
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

function stemOf(service) {
  return `Service_${service.date}_${service.number}`
}

function filesOf(service) {
  const stem = stemOf(service)

  return {
    pdf: `${SERVICES}/${stem}.pdf`,
    cache: `${CACHE}/${stem}.json`,
    text: `${TEXT_CACHE}/${stem}.txt`
  }
}

/*
 * Un monde en mémoire. `world.files` est le disque : ce qu'on y trouve
 * après coup est la seule preuve qui compte.
 */
function buildWorld(services) {
  const files = new Map()
  const state = { listContentsFails: false }

  const fm = {
    joinPath: (a, b) => `${a}/${b}`,
    fileExists: target => files.has(target),
    isFileDownloaded: () => true,
    readString: target => files.get(target) ?? "",
    writeString: (target, content) => files.set(target, String(content)),
    createDirectory: () => {},
    remove: target => {
      if (!files.has(target)) throw new Error(`fichier absent : ${target}`)
      files.delete(target)
    },
    move: (from, to) => {
      files.set(to, files.get(from))
      files.delete(from)
    },
    isDirectory: () => false,
    listContents: directory => {
      if (state.listContentsFails) throw new Error("iCloud indisponible")

      const prefix = `${directory}/`

      return [...files.keys()]
        .filter(target => target.startsWith(prefix) && !target.slice(prefix.length).includes("/"))
        .map(target => target.slice(prefix.length))
    }
  }

  const index = { version: 2, updatedAt: "", services: [] }

  for (const service of services) {
    const stem = stemOf(service)
    const target = filesOf(service)

    if (service.pdf !== false) files.set(target.pdf, "%PDF-1.7")

    files.set(
      target.cache,
      JSON.stringify({
        date: service.date,
        service: service.number,
        validation: { valid: true, warnings: [] },
        slices: [{ dutyStart: "05:30", end: service.end }]
      })
    )

    files.set(target.text, "texte extrait")

    index.services.push({
      id: `${service.date}_${service.number}`,
      date: service.date,
      service: service.number,
      pdfFile: `${stem}.pdf`,
      cacheFile: `${stem}.json`,
      textFile: `${stem}.txt`,
      lastEnd: service.end,
      firstDutyStart: "05:30",
      indexedAt: service.indexedAt || `${service.date}T04:00:00.000Z`
    })
  }

  files.set(INDEX_PATH, JSON.stringify(index))

  const loaded = {}

  loaded["CTS Utils"] = loadModule("CTS Utils", {}, loaded)

  loaded["CTS Config"] = {
    fm,
    paths: {
      root: ROOT,
      data: DATA,
      services: SERVICES,
      servicesArchive: ARCHIVE,
      servicesCache: CACHE,
      servicesTextCache: TEXT_CACHE
    },
    files: { servicesIndex: INDEX_PATH },
    pdf: {
      cacheGraceMs: HOUR,
      archiveGraceMs: HOUR,
      archiveRetentionMs: 7 * DAY,
      residueGraceMs: HOUR,
      residueSweepIntervalMs: 6 * HOUR,
      missingGraceMs: MISSING_GRACE_MS,
      missingObservationIntervalMs: OBSERVATION_INTERVAL_MS,
      maximumFilesPerRun: 2
    },
    residueDirectories: [],
    servicesIndexVersion: 2,
    ensureDirectories: () => {}
  }

  loaded["CTS Storage"] = {
    removeFileQuietly: target => {
      if (files.has(target)) files.delete(target)
    },
    readJson: async (target, fallback = null) => {
      const content = files.get(target)
      if (!content) return fallback
      try {
        return JSON.parse(content)
      } catch (_) {
        return fallback
      }
    },
    ensureDownloaded: async target => files.has(target),
    appendLog: async () => {},
    buildUniqueToken: () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    writeJsonAtomically: async (target, value) => {
      files.set(target, JSON.stringify(value, null, 2))
    },
    /*
     * Aucune date de modification : le balayage des caches orphelins se
     * retire de lui-même, et ce banc ne mesure que le retrait.
     */
    safeModificationDate: () => null
  }

  loaded["CTS Importer"] = {
    readCurrentIndex: async () => JSON.parse(files.get(INDEX_PATH)),
    importPdf: async () => {
      throw new Error("importPdf n’a pas sa place dans ce banc")
    }
  }

  const reload = () => {
    loaded["CTS Services Cleaner"] = loadModule("CTS Services Cleaner", {}, loaded)
    loaded["CTS Services Manager"] = loadModule("CTS Services Manager", {}, loaded)

    return {
      CLEANER: loaded["CTS Services Cleaner"],
      MANAGER: loaded["CTS Services Manager"]
    }
  }

  const modules = reload()

  return {
    files,
    fm,
    state,
    reload,
    CLEANER: modules.CLEANER,
    MANAGER: modules.MANAGER,
    indexIds: () => JSON.parse(files.get(INDEX_PATH)).services.map(entry => entry.id),
    has: target => files.has(target)
  }
}

const failures = []

function check(condition, message) {
  if (!condition) failures.push(message)
}

const SERVICE_A = { date: TODAY, number: "EA06", end: "13:30" }
const SERVICE_B = { date: TOMORROW, number: "EB12", end: "14:00" }

const A_ID = `${TODAY}_EA06`
const B_ID = `${TOMORROW}_EB12`

/* ------------------------------------------------ 1 · un seul service */

{
  const world = buildWorld([SERVICE_A])
  const target = filesOf(SERVICE_A)

  const before = await world.MANAGER.resolveServiceForDate(NOW)
  check(before.found && before.entry.id === A_ID, "1 · le service devrait être affiché avant retrait")

  const result = await world.CLEANER.removeService(A_ID, NOW)

  check(result.success, "1 · le retrait devrait réussir")
  check(result.status === "removed", "1 · le statut devrait être removed")
  check(result.removed.length === 3, "1 · les trois fichiers devraient être supprimés")
  check(!world.has(target.pdf), "1 · le PDF devrait être supprimé")
  check(!world.has(target.cache), "1 · le cache devrait être supprimé")
  check(!world.has(target.text), "1 · le cache texte devrait être supprimé")
  check(world.indexIds().length === 0, "1 · l’index devrait être vide")

  /* 9 · plus aucun service : la sélection doit répondre, pas planter. */
  const after = await world.MANAGER.resolveServiceForDate(NOW)
  check(after.found === false, "9 · aucun service ne devrait être trouvé")
  check(after.reason === "empty-index", "9 · la raison devrait être empty-index")
}

/* ------------------------- 2, 10, 11, 12 · plusieurs services présents */

{
  const world = buildWorld([SERVICE_A, SERVICE_B])
  const a = filesOf(SERVICE_A)
  const b = filesOf(SERVICE_B)

  const before = await world.MANAGER.resolveServiceForDate(NOW)
  check(before.found && before.entry.id === A_ID, "3 · A devrait être le service affiché")

  const result = await world.CLEANER.removeService(A_ID, NOW)

  check(result.success, "2 · le retrait de A devrait réussir")
  check(!world.has(a.pdf) && !world.has(a.cache) && !world.has(a.text), "2 · les fichiers de A devraient partir")

  check(world.has(b.pdf), "12 · le PDF de B ne doit pas être touché")
  check(world.has(b.cache), "12 · le cache de B ne doit pas être touché")
  check(world.has(b.text), "12 · le cache texte de B ne doit pas être touché")
  check(world.indexIds().join() === B_ID, "2 · seul B devrait rester à l’index")

  /* 11 · ce que le widget montrera : B, jamais A. */
  const after = await world.MANAGER.resolveServiceForDate(NOW)
  check(after.found && after.entry.id === B_ID, "11 · B devrait prendre la place de A")

  /* 14 · un tour d’entretien de plus ne doit rien casser. */
  const maintenance = await world.CLEANER.maintainServices(NOW)
  check(maintenance.success, "14 · l’entretien suivant devrait rester sans erreur")

  const later = await world.MANAGER.resolveServiceForDate(NOW)
  check(later.found && later.entry.id === B_ID, "14 · B devrait toujours être affiché au rafraîchissement suivant")
}

/* ---------------------------------- 4 · retrait d’un service non affiché */

{
  const world = buildWorld([SERVICE_A, SERVICE_B])
  const a = filesOf(SERVICE_A)

  const result = await world.CLEANER.removeService(B_ID, NOW)

  check(result.success, "4 · le retrait de B devrait réussir")
  check(world.has(a.pdf) && world.has(a.cache) && world.has(a.text), "4 · les fichiers de A doivent rester intacts")
  check(world.indexIds().join() === A_ID, "4 · seul A devrait rester à l’index")

  const after = await world.MANAGER.resolveServiceForDate(NOW)
  check(after.found && after.entry.id === A_ID, "4 · A devrait rester le service affiché")
}

/* ------------------------------------ 5, 6 · fichiers déjà disparus */

{
  const world = buildWorld([SERVICE_A, SERVICE_B])
  const a = filesOf(SERVICE_A)

  world.files.delete(a.pdf)

  const result = await world.CLEANER.removeService(A_ID, NOW)

  check(result.success, "5 · un PDF déjà supprimé ne doit pas faire échouer le retrait")
  check(result.removed.length === 2, "5 · seuls les deux caches restaient à supprimer")
  check(world.indexIds().join() === B_ID, "5 · l’entrée devrait tout de même partir")
}

{
  const world = buildWorld([SERVICE_A])
  const a = filesOf(SERVICE_A)

  world.files.delete(a.cache)
  world.files.delete(a.text)

  const result = await world.CLEANER.removeService(A_ID, NOW)

  check(result.success, "6 · des caches déjà supprimés ne doivent pas faire échouer le retrait")
  check(result.removed.length === 1, "6 · seul le PDF restait à supprimer")
  check(!world.has(a.pdf), "6 · le PDF devrait être supprimé")
}

/* ------------------------------------------------- idempotence (point 6) */

{
  const world = buildWorld([SERVICE_A])

  const first = await world.CLEANER.removeService(A_ID, NOW)
  const second = await world.CLEANER.removeService(A_ID, NOW)

  check(first.success && first.status === "removed", "idempotence · le premier retrait devrait réussir")
  check(second.success, "idempotence · le second retrait ne doit pas être une erreur")
  check(second.status === "unknown", "idempotence · le second retrait devrait signaler un service déjà absent")
  check(second.removed.length === 0, "idempotence · le second retrait ne doit rien supprimer")
}

{
  const world = buildWorld([SERVICE_A])
  const result = await world.CLEANER.removeService("2026-01-01_ZZ99", NOW)

  check(result.success && result.status === "unknown", "inconnu · un identifiant inconnu ne doit pas être une erreur")
  check(world.indexIds().join() === A_ID, "inconnu · l’index ne doit pas bouger")
}

/* --------------------------- 7 · dossier Services momentanément illisible */

{
  const world = buildWorld([SERVICE_A, SERVICE_B])
  const a = filesOf(SERVICE_A)

  world.files.delete(a.pdf)
  world.state.listContentsFails = true

  const first = await world.CLEANER.maintainServices(NOW)
  const later = await world.CLEANER.maintainServices(new Date(NOW.getTime() + 3 * HOUR))

  check(!first.removedServices.length, "7 · rien ne doit être retiré quand le dossier est illisible")
  check(!later.removedServices.length, "7 · un dossier illisible ne doit jamais conclure, même plus tard")
  check(world.indexIds().length === 2, "7 · les deux entrées doivent rester")
  check(world.has(a.cache), "7 · le cache ne doit pas être supprimé sur un dossier illisible")
}

/* ------------------- 8 · PDF absent : délai de confirmation avant retrait */

{
  const world = buildWorld([SERVICE_A, SERVICE_B])
  const a = filesOf(SERVICE_A)
  const b = filesOf(SERVICE_B)

  world.files.delete(a.pdf)

  const immediate = await world.CLEANER.maintainServices(NOW)

  check(!immediate.removedServices.length, "8 · aucun retrait au premier constat")
  check(world.has(a.cache), "8 · le cache doit survivre au premier constat")
  check(world.indexIds().length === 2, "8 · les deux entrées doivent rester au premier constat")

  /* Un second constat, mais avant le délai : toujours rien. */
  const tooSoon = await world.CLEANER.maintainServices(new Date(NOW.getTime() + 10 * MINUTE))

  check(!tooSoon.removedServices.length, "8 · aucun retrait avant l’expiration du délai")
  check(world.indexIds().length === 2, "8 · les deux entrées doivent rester avant le délai")

  /* Passé le délai, et après plusieurs constats espacés : retrait. */
  const confirmed = await world.CLEANER.maintainServices(
    new Date(NOW.getTime() + MISSING_GRACE_MS + MINUTE)
  )

  check(confirmed.removedServices.length === 1, "8 · le service devrait être retiré une fois le délai passé")
  check(confirmed.removedServices[0]?.id === A_ID, "8 · c’est bien A qui devrait être retiré")
  check(!world.has(a.cache), "8 · le cache de A devrait être supprimé")
  check(!world.has(a.text), "8 · le cache texte de A devrait être supprimé")
  check(world.indexIds().join() === B_ID, "8 · seul B devrait rester")

  check(world.has(b.pdf) && world.has(b.cache) && world.has(b.text), "8 · B ne doit jamais être touché")

  const after = await world.MANAGER.resolveServiceForDate(NOW)
  check(after.found && after.entry.id === B_ID, "8 · le widget devrait passer à B")
}

/* ------------ 8 bis · le PDF revient avant le délai : aucun retrait */

{
  const world = buildWorld([SERVICE_A])
  const a = filesOf(SERVICE_A)

  world.files.delete(a.pdf)

  await world.CLEANER.maintainServices(NOW)

  /* iCloud finit par livrer le fichier. */
  world.files.set(a.pdf, "%PDF-1.7")

  const result = await world.CLEANER.maintainServices(
    new Date(NOW.getTime() + MISSING_GRACE_MS + MINUTE)
  )

  check(!result.removedServices.length, "8 bis · un PDF revenu ne doit pas être retiré")
  check(world.has(a.cache), "8 bis · son cache doit être intact")
  check(world.indexIds().join() === A_ID, "8 bis · son entrée doit rester")

  const after = await world.MANAGER.resolveServiceForDate(NOW)
  check(after.found && after.entry.id === A_ID, "8 bis · le service doit rester affiché")
}

/* --------------- 13 · état relu depuis le disque, comme après relance */

{
  const world = buildWorld([SERVICE_A, SERVICE_B])
  const a = filesOf(SERVICE_A)

  world.files.delete(a.pdf)

  await world.CLEANER.maintainServices(NOW)

  /* Scriptable est fermé puis relancé : les modules repartent de zéro. */
  const restarted = world.reload()

  const confirmed = await restarted.CLEANER.maintainServices(
    new Date(NOW.getTime() + MISSING_GRACE_MS + MINUTE)
  )

  check(
    confirmed.removedServices.length === 1,
    "13 · le constat d’avant relance devrait être retrouvé sur le disque"
  )
  check(world.indexIds().join() === B_ID, "13 · seul B devrait rester après relance")

  const after = await restarted.MANAGER.resolveServiceForDate(NOW)
  check(after.found && after.entry.id === B_ID, "13 · la sélection devrait suivre après relance")
}

/* ------------- un service archivé n’est pas un service disparu */

{
  const world = buildWorld([SERVICE_A])
  const a = filesOf(SERVICE_A)

  /* Le projet a archivé le PDF lui-même : absence normale. */
  const index = JSON.parse(world.files.get(INDEX_PATH))
  index.services[0].archive = {
    fileName: `${stemOf(SERVICE_A)}.pdf`,
    archivedAt: new Date(NOW.getTime() - 2 * HOUR).toISOString(),
    deletedAt: ""
  }
  world.files.set(INDEX_PATH, JSON.stringify(index))
  world.files.delete(a.pdf)
  world.files.set(`${ARCHIVE}/${stemOf(SERVICE_A)}.pdf`, "%PDF-1.7")

  const result = await world.CLEANER.maintainServices(
    new Date(NOW.getTime() + MISSING_GRACE_MS + 2 * HOUR)
  )

  check(!result.removedServices.length, "archivé · un service archivé ne doit pas être pris pour un service supprimé")
  check(world.indexIds().join() === A_ID, "archivé · son entrée doit rester")
}

/* ------- l’archive est épargnée, et garde sa rétention de sept jours */

{
  const world = buildWorld([SERVICE_A])
  const a = filesOf(SERVICE_A)
  const archivePath = `${ARCHIVE}/${stemOf(SERVICE_A)}.pdf`
  const archivedAt = new Date(NOW.getTime() - 2 * HOUR)

  const index = JSON.parse(world.files.get(INDEX_PATH))
  index.services[0].archive = {
    fileName: `${stemOf(SERVICE_A)}.pdf`,
    archivedAt: archivedAt.toISOString(),
    deletedAt: ""
  }
  world.files.set(INDEX_PATH, JSON.stringify(index))
  world.files.delete(a.pdf)
  world.files.set(archivePath, "%PDF-1.7")

  const result = await world.CLEANER.removeService(A_ID, NOW)

  check(result.success, "archive · le retrait devrait réussir")
  check(result.archivePreserved === true, "archive · le retrait devrait signaler l’archive conservée")
  check(world.has(archivePath), "archive · le PDF archivé ne doit surtout pas être supprimé")
  check(!world.has(a.cache), "archive · le cache devrait être supprimé")
  check(!world.has(a.text), "archive · le cache texte devrait être supprimé")

  /*
   * L'entrée reste, sinon l'archive perdrait la rétention qu'elle
   * porte. Le widget ne peut plus la retenir pour autant.
   */
  check(world.indexIds().join() === A_ID, "archive · l’entrée doit rester pour porter la rétention")

  const after = await world.MANAGER.resolveServiceForDate(NOW)
  check(after.found === false, "archive · le widget ne doit plus afficher le service retiré")

  /* Sept jours plus tard, l'entretien mène la rétention à son terme. */
  const expired = await world.CLEANER.maintainServices(
    new Date(archivedAt.getTime() + 7 * DAY + MINUTE)
  )

  check(expired.deleted.length === 1, "archive · l’archive devrait être supprimée à l’échéance")
  check(!world.has(archivePath), "archive · le PDF archivé devrait finir par partir")
}

/* ------------- le PDF ne peut pas être supprimé : le service est gardé */

{
  const world = buildWorld([SERVICE_A, SERVICE_B])
  const a = filesOf(SERVICE_A)
  const b = filesOf(SERVICE_B)

  world.fm.remove = target => {
    if (target === a.pdf) throw new Error("fichier verrouillé")
    if (!world.files.has(target)) throw new Error(`fichier absent : ${target}`)
    world.files.delete(target)
  }

  const result = await world.CLEANER.removeService(A_ID, NOW)

  check(!result.success, "verrou · un PDF non supprimable doit faire échouer le retrait")
  check(result.status === "pdf-still-present", "verrou · le statut devrait être pdf-still-present")
  check(result.indexUpdated === false, "verrou · l’index ne doit pas être modifié")
  check(world.indexIds().length === 2, "verrou · l’entrée doit être conservée, sans quoi le PDF serait réimporté")
  check(world.has(b.pdf) && world.has(b.cache) && world.has(b.text), "verrou · B ne doit pas être touché")
}

/* --------------------------------------------------------- résultat */

if (failures.length) {
  console.error(`\n${failures.length} problème(s) :\n`)
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error("")
  process.exit(1)
}

console.log(
  "ok     Retrait d’un service (demande explicite, réconciliation, délai de confirmation, " +
    "dossier illisible, idempotence, services voisins intacts, sélection du widget)"
)
