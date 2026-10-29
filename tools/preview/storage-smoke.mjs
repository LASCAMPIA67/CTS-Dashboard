import { importFrom, isolatedModule, timerDouble } from "./sandbox.mjs"

function createFileManager({ confirmsDownloads, stalls = false, unreadable = false }) {
  const disk = new Map()
  const calls = { downloads: 0 }

  return {
    disk,
    calls,
    joinPath: (parent, child) => `${parent}/${child}`,
    documentsDirectory: () => "/documents",
    libraryDirectory: () => "/library",
    fileExists: target => disk.has(target),
    createDirectory: () => {},
    isFileDownloaded: () => confirmsDownloads,
    downloadFileFromiCloud: () => {
      calls.downloads++
      return stalls ? new Promise(() => {}) : Promise.resolve()
    },
    readString: target => {
      if (!disk.has(target)) throw new Error(`fichier absent : ${target}`)
      if (unreadable) throw new Error("fichier non disponible localement")
      return disk.get(target)
    },
    writeString: (target, value) => disk.set(target, String(value)),
    remove: target => disk.delete(target),
    move: (from, to) => {
      if (!disk.has(from)) throw new Error(`fichier absent : ${from}`)
      disk.set(to, disk.get(from))
      disk.delete(from)
    },
    fileSize: target => (disk.has(target) ? 1 : 0),
    modificationDate: () => new Date()
  }
}

function loadStorage(fm, { runsInWidget = true, waits = [] } = {}) {
  const loaded = {}

  for (const name of ["CTS Config", "CTS Utils", "CTS Storage"]) {
    loaded[name] = isolatedModule(name, {
      importModule: importFrom(loaded),
      globals: {
        config: { runsInWidget },
        Timer: timerDouble({ waits }),
        FileManager: { iCloud: () => fm, local: () => fm }
      }
    })
  }

  return loaded["CTS Storage"]
}

const failures = []
const INDEX = { version: 2, services: [{ pdfFile: "EA06.pdf", cacheFile: "EA06.json" }] }

{
  const fm = createFileManager({ confirmsDownloads: false })
  const STORAGE = loadStorage(fm)
  const target = "/documents/CTS Dashboard/Data/services-index.json"

  fm.disk.set(target, JSON.stringify(INDEX))

  const read = await STORAGE.readJson(target, null)

  if (JSON.stringify(read) !== JSON.stringify(INDEX)) {
    failures.push(
      "iCloud ne confirme pas le téléchargement : l'index revient " +
      `${JSON.stringify(read)} au lieu de son contenu réel`
    )
  }

  if (fm.calls.downloads !== 0) {
    failures.push(
      `fichier présent : ${fm.calls.downloads} attente(s) iCloud alors qu'il était lisible`
    )
  }
}

{
  const fm = createFileManager({ confirmsDownloads: true })
  const STORAGE = loadStorage(fm)
  const target = "/documents/CTS Dashboard/Data/services-index.json"

  fm.disk.set(target, JSON.stringify(INDEX))

  const read = await STORAGE.readJson(target, null)

  if (JSON.stringify(read) !== JSON.stringify(INDEX)) {
    failures.push("iCloud confirme le téléchargement mais l'index ne revient pas")
  }
}

for (const confirmsDownloads of [true, false]) {
  const fm = createFileManager({ confirmsDownloads })
  const STORAGE = loadStorage(fm)

  const read = await STORAGE.readJson("/documents/absent.json", null)

  if (read !== null) {
    failures.push(
      `fichier absent (iCloud ${confirmsDownloads ? "confirme" : "ne confirme pas"}) : ` +
      `readJson rend ${JSON.stringify(read)} au lieu de la valeur de repli`
    )
  }
}

{
  const fm = createFileManager({ confirmsDownloads: false })
  const STORAGE = loadStorage(fm)
  const target = "/documents/casse.json"

  fm.disk.set(target, "{ ceci n'est pas du JSON")

  const read = await STORAGE.readJson(target, null)

  if (read !== null) {
    failures.push(`JSON invalide : readJson rend ${JSON.stringify(read)} au lieu de null`)
  }
}

{
  const fm = createFileManager({ confirmsDownloads: false, stalls: true, unreadable: true })
  const STORAGE = loadStorage(fm)
  const target = "/documents/CTS Dashboard/Data/services-index.json"

  fm.disk.set(target, JSON.stringify(INDEX))

  let guard
  const read = await Promise.race([
    STORAGE.readJson(target, "PAS-DE-REPONSE"),
    new Promise(resolve => { guard = setTimeout(() => resolve("BLOQUÉ"), 8000) })
  ])
  clearTimeout(guard)

  if (read === "BLOQUÉ") {
    failures.push("iCloud muet : readJson ne rend jamais la main")
  } else if (read !== "PAS-DE-REPONSE") {
    failures.push(`iCloud muet : readJson rend ${JSON.stringify(read)} au lieu du repli`)
  }
}

for (const [context, runsInWidget, floor, ceiling] of [
  ["widget", true, 4000, 6000],
  ["application", false, 40000, Infinity]
]) {
  const waits = []
  const fm = createFileManager({ confirmsDownloads: false, stalls: true, unreadable: true })
  const STORAGE = loadStorage(fm, { runsInWidget, waits })
  const target = "/documents/CTS Dashboard/Services/EA06.pdf"

  fm.disk.set(target, "%PDF")

  let thrown = null

  try {
    await STORAGE.ensureDownloaded(target)
  } catch (error) {
    thrown = error
  }

  const patience = waits.reduce((total, value) => total + value, 0)

  if (!thrown) {
    failures.push(`patience · ${context} : un fichier qu'iCloud ne rend jamais passe pour disponible`)
  }

  if (patience < floor || patience > ceiling) {
    failures.push(
      `patience · ${context} : ${patience} ms accordés à iCloud, ` +
      `hors de l'intervalle ${floor}–${ceiling} ms`
    )
  }
}

{
  const fm = createFileManager({ confirmsDownloads: false })
  const STORAGE = loadStorage(fm, { runsInWidget: true })
  const target = "/documents/CTS Dashboard/Services/EA06.pdf"
  let checks = 0

  fm.disk.set(target, "%PDF")
  fm.isFileDownloaded = () => ++checks >= 3

  let downloaded = false

  try {
    downloaded = await STORAGE.ensureDownloaded(target)
  } catch (_) {}

  if (downloaded !== true) {
    failures.push(
      "widget : un fichier déclaré disponible un instant après le téléchargement est abandonné"
    )
  }
}

{
  const fm = createFileManager({ confirmsDownloads: true })
  const STORAGE = loadStorage(fm)
  const target = "/documents/CTS Dashboard/Data/services-scan-state.json"

  await STORAGE.writeJsonAtomically(target, { version: 1, files: {} })

  const written = fm.disk.get(target)

  if (!written) {
    failures.push("écriture atomique : le fichier n'est pas écrit")
  } else {
    try {
      const parsed = JSON.parse(written)
      if (parsed.version !== 1) {
        failures.push("écriture atomique : le contenu écrit ne correspond pas")
      }
    } catch (_) {
      failures.push("écriture atomique : le fichier écrit n'est pas du JSON")
    }
  }

  const leftovers = [...fm.disk.keys()].filter(key => /\.(tmp|rollback)-/.test(key))

  if (leftovers.length) {
    failures.push(`écriture atomique : ${leftovers.length} fichier(s) temporaire(s) laissé(s)`)
  }
}

{
  const fm = createFileManager({ confirmsDownloads: true })
  const STORAGE = loadStorage(fm)
  const target = "/documents/CTS Dashboard/Data/services-index.json"
  const original = JSON.stringify(INDEX)

  fm.disk.set(target, original)

  const move = fm.move
  fm.move = (from, to) => {
    if (from.includes(".tmp-")) throw new Error("bascule interrompue")
    return move(from, to)
  }

  let thrown = null

  try {
    await STORAGE.writeJsonAtomically(target, { version: 99 }, {
      commitCode: "TEST_COMMIT_FAILED",
      stage: "test"
    })
  } catch (error) {
    thrown = error
  }

  fm.move = move

  if (!thrown) {
    failures.push("bascule interrompue : aucune erreur n'est levée")
  } else if (thrown.telemetryCode !== "TEST_COMMIT_FAILED") {
    failures.push(`bascule interrompue : code « ${thrown.telemetryCode} » inattendu`)
  }

  if (fm.disk.get(target) !== original) {
    failures.push("bascule interrompue : l'ancien contenu n'est pas restauré")
  }

  const leftovers = [...fm.disk.keys()].filter(key => /\.(tmp|rollback)-/.test(key))

  if (leftovers.length) {
    failures.push(`bascule interrompue : ${leftovers.length} fichier(s) temporaire(s) laissé(s)`)
  }
}

{
  const fm = createFileManager({ confirmsDownloads: true })
  const STORAGE = loadStorage(fm)
  const target = "/documents/CTS Dashboard/Data/services-index.json"
  const original = JSON.stringify(INDEX)

  fm.disk.set(target, original)

  const move = fm.move
  fm.move = (from, to) => {
    move(from, to)
    if (from.includes(".tmp-")) fm.disk.set(to, "{")
  }

  let thrown = null

  try {
    await STORAGE.writeJsonAtomically(target, { version: 99 }, {
      commitCode: "TEST_COMMIT_FAILED",
      stage: "test"
    })
  } catch (error) {
    thrown = error
  }

  fm.move = move

  if (thrown?.telemetryCode !== "TEST_COMMIT_FAILED") {
    failures.push("fichier posé incomplet : l'écriture ne s'en aperçoit pas")
  }

  if (fm.disk.get(target) !== original) {
    failures.push("fichier posé incomplet : l'ancien contenu n'est pas restauré")
  }
}

{
  const fm = createFileManager({ confirmsDownloads: true })
  const STORAGE = loadStorage(fm)

  for (let index = 1; index <= 105; index++) {
    await STORAGE.appendLog("import", `import ${index}`)
  }

  const logs = await STORAGE.loadLog()

  if (logs.length !== 100) {
    failures.push(`journal d'import : ${logs.length} entrée(s) gardée(s) au lieu des 100 dernières`)
  } else if (logs[0].message !== "import 6" || logs[99].message !== "import 105") {
    failures.push("journal d'import : ce ne sont pas les 100 dernières entrées qui sont gardées")
  }
}

{
  const fm = createFileManager({ confirmsDownloads: true })
  const STORAGE = loadStorage(fm)
  const archive = "/documents/CTS Dashboard/Services/Archive"

  fm.disk.set(`${archive}/Service_EA05.pdf`, "%PDF")
  fm.disk.set(`${archive}/Service_EA05_2.pdf`, "%PDF")

  const taken = STORAGE.uniqueArchiveFileName("Service_EA05.pdf")
  const free = STORAGE.uniqueArchiveFileName("Services/Service_EA06.pdf")

  if (taken !== "Service_EA05_3.pdf") {
    failures.push(`nom d'archive : « ${taken} » au lieu de Service_EA05_3.pdf`)
  }

  if (free !== "Service_EA06.pdf") {
    failures.push(`nom d'archive : « ${free} » au lieu de Service_EA06.pdf`)
  }
}

{
  const fm = createFileManager({ confirmsDownloads: true })
  const STORAGE = loadStorage(fm)
  const target = "/documents/CTS Dashboard/Data/services-index.json"

  fm.disk.set(target, "{}")
  fm.disk.set(`${target}.tmp`, "reste")
  fm.disk.set(`${target}.rollback`, "reste")

  await STORAGE.writeJsonSafely(target, INDEX)

  if (fm.disk.has(`${target}.tmp`) || fm.disk.has(`${target}.rollback`)) {
    failures.push("anciens restes : ils survivent à une écriture réussie")
  }

  const orphan = "/documents/CTS Dashboard/Data/import-log.json"

  fm.disk.set(`${orphan}.rollback`, '["contenu unique"]')

  await STORAGE.writeJsonSafely(orphan, [])

  if (!fm.disk.has(`${orphan}.rollback`)) {
    failures.push(
      "anciens restes : la copie de sécurité a été effacée alors que le fichier d’origine manquait"
    )
  }
}

{
  const target = "/documents/CTS Dashboard/Data/preferences.json"

  const cases = [
    { label: "fichier absent", content: null, expected: 1 },
    { label: "fichier vide", content: "", expected: 1 },
    { label: "JSON invalide", content: "{ textScale:", expected: 1 },
    { label: "tableau", content: "[]", expected: 1 },
    { label: "valeur absurde", content: JSON.stringify({ textScale: 42 }), expected: 1.25 },
    { label: "valeur négative", content: JSON.stringify({ textScale: -3 }), expected: 1 },
    { label: "valeur texte", content: JSON.stringify({ textScale: "grand" }), expected: 1 },
    { label: "réglage standard", content: JSON.stringify({ textScale: 1 }), expected: 1 },
    { label: "réglage agrandi", content: JSON.stringify({ textScale: 1.25 }), expected: 1.25 }
  ]

  for (const item of cases) {
    const fm = createFileManager({ confirmsDownloads: true })
    const STORAGE = loadStorage(fm)

    if (item.content !== null) fm.disk.set(target, item.content)

    const preferences = await STORAGE.loadPreferences()

    if (preferences.textScale !== item.expected) {
      failures.push(
        `préférences · ${item.label} : textScale ${preferences.textScale} ` +
        `au lieu de ${item.expected}`
      )
    }
  }

  const fm = createFileManager({ confirmsDownloads: true })
  const STORAGE = loadStorage(fm)

  if (STORAGE.normalizePreferences({ textScale: 1.2 }).textScale !== 1.25) {
    failures.push("préférences : une échelle intermédiaire ne se ramène pas à un réglage connu")
  }
}

{
  const target = "/documents/CTS Dashboard/Data/services-index.json"

  {
    const fm = createFileManager({ confirmsDownloads: true })
    const STORAGE = loadStorage(fm)
    const index = await STORAGE.readCurrentIndex()

    if (!index || !Array.isArray(index.services) || index.services.length !== 0) {
      failures.push(`index absent : ${JSON.stringify(index)} au lieu d'un index vide`)
    }
  }

  {
    const fm = createFileManager({ confirmsDownloads: true })
    const STORAGE = loadStorage(fm)

    fm.disk.set(target, JSON.stringify({
      version: 2,
      updatedAt: "2026-09-01T06:00:00.000Z",
      services: [{ id: "2026-09-01_EA06" }, null, "texte", ["tableau"]]
    }))

    const index = await STORAGE.readCurrentIndex()

    if (index.services.length !== 1 || index.services[0].id !== "2026-09-01_EA06") {
      failures.push(
        `index valide : ${JSON.stringify(index.services)} au lieu de la seule entrée exploitable`
      )
    }

    if (index.updatedAt !== "2026-09-01T06:00:00.000Z") {
      failures.push("index valide : la date de mise à jour est perdue")
    }
  }

  const corrupted = [
    ["JSON illisible", "{ ceci n'est pas du JSON"],
    ["tableau à la racine", "[]"],
    ["texte", JSON.stringify("index")],
    ["services absent", JSON.stringify({ version: 2 })],
    ["services qui n'est pas un tableau", JSON.stringify({ version: 2, services: {} })]
  ]

  for (const [label, content] of corrupted) {
    const fm = createFileManager({ confirmsDownloads: true })
    const STORAGE = loadStorage(fm)

    fm.disk.set(target, content)

    let thrown = null

    try {
      const index = await STORAGE.readCurrentIndex()

      failures.push(
        `index corrompu · ${label} : rend ${JSON.stringify(index)} au lieu de lever`
      )
    } catch (error) {
      thrown = error
    }

    if (thrown && thrown.telemetryCode !== "SERVICE_INDEX_INVALID") {
      failures.push(
        `index corrompu · ${label} : code « ${thrown.telemetryCode} » ` +
        "au lieu de SERVICE_INDEX_INVALID"
      )
    }

    if (thrown && thrown.telemetryStage !== "index") {
      failures.push(
        `index corrompu · ${label} : étape « ${thrown.telemetryStage} » au lieu de « index »`
      )
    }
  }

  for (const [label, confirmsDownloads, expected] of [
    ["pas encore téléchargé", false, "SERVICE_INDEX_ICLOUD_DOWNLOAD_FAILED"],
    ["téléchargé mais illisible", true, "SERVICE_INDEX_INVALID"]
  ]) {
    const fm = createFileManager({ confirmsDownloads, unreadable: true })
    const STORAGE = loadStorage(fm)

    fm.disk.set(target, JSON.stringify(INDEX))

    let thrown = null

    try {
      await STORAGE.readCurrentIndex()
    } catch (error) {
      thrown = error
    }

    if (thrown?.telemetryCode !== expected || thrown?.telemetryStage !== "index") {
      failures.push(
        `index ${label} : ${thrown ? `code « ${thrown.telemetryCode} »` : "aucune erreur"} ` +
          `au lieu de ${expected}`
      )
    }
  }
}

{
  const LOCK = "/library/CTS Dashboard/essai.lock"
  const options = { ttlMs: 60000, writeCode: "TEST_LOCK_WRITE_FAILED", stage: "test", label: "Le verrou" }

  const fm = createFileManager({ confirmsDownloads: true })
  const STORAGE = loadStorage(fm, { runsInWidget: true })

  const first = STORAGE.acquireDeviceLock("essai.lock", options)
  const second = STORAGE.acquireDeviceLock("essai.lock", options)

  if (!first.acquired || !fm.disk.has(LOCK)) {
    failures.push("verrou : le premier appel ne le prend pas dans la bibliothèque locale")
  }

  if ([...fm.disk.keys()].some(key => key.startsWith("/documents/") && key.endsWith(".lock"))) {
    failures.push("verrou : il est écrit dans iCloud")
  }

  if (second.acquired) failures.push("verrou : un verrou actif n'empêche pas un second passage")

  STORAGE.releaseDeviceLock("essai.lock", { acquired: true, token: "celui-d-un-autre" })

  if (!fm.disk.has(LOCK)) failures.push("verrou : libéré par qui ne le tenait pas")

  STORAGE.releaseDeviceLock("essai.lock", first)

  if (fm.disk.has(LOCK)) failures.push("verrou : il survit à sa libération")

  for (const [label, content] of [
    ["périmé", JSON.stringify({ token: "ancien", createdAt: "2020-01-01T00:00:00.000Z" })],
    ["illisible", "{ pas du JSON"]
  ]) {
    fm.disk.set(LOCK, content)

    if (!STORAGE.acquireDeviceLock("essai.lock", options).acquired) {
      failures.push(`verrou ${label} : il bloque encore le passage`)
    }

    fm.disk.delete(LOCK)
  }

  for (const [applicationTakesOverWidget, expected] of [[false, false], [true, true]]) {
    const application = loadStorage(fm, { runsInWidget: false })

    fm.disk.set(LOCK, JSON.stringify({
      token: "widget", createdAt: new Date().toISOString(), surface: "widget"
    }))

    const taken = application.acquireDeviceLock("essai.lock", {
      ...options,
      applicationTakesOverWidget
    }).acquired

    if (taken !== expected) {
      failures.push(
        `verrou d'un widget, reprise ${applicationTakesOverWidget ? "demandée" : "non demandée"} : ` +
        `l'application ${taken ? "passe" : "attend"}`
      )
    }

    fm.disk.delete(LOCK)
  }
}

if (failures.length) {
  console.log("ÉCHEC  lecture des fichiers iCloud")
  for (const failure of failures) console.log(`         ${failure}`)
  process.exit(1)
}

console.log(
  "ok     lecture des fichiers iCloud " +
  "(iCloud muet, iCloud normal, absent, illisible, sans réponse, aucune attente inutile, " +
  "patience du widget et de l'application, disponibilité déclarée en retard, " +
  "écriture atomique relue, bascule interrompue, journal d'import borné, nom d'archive unique, préférences, verrous de l'appareil, " +
  "index des services dont le refus " +
  "d'un index corrompu, distingué d'un index qu'iCloud n'a pas encore rendu)"
)
