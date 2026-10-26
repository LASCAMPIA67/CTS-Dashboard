/*
 * Verrou d'analyse du dossier Services.
 *
 * Un réveil de widget peut être tué en pleine lecture d'un PDF : iOS ne
 * lui accorde que quelques secondes, la lecture en demande jusqu'à
 * vingt-cinq. Il laisse alors son verrou derrière lui, valable deux
 * minutes.
 *
 * Sans reprise, le seul contexte capable de terminer l'import —
 * l'application, où le temps ne manque pas — se voyait refuser le travail
 * par celui qui, précisément, ne pouvait pas le finir. Le conducteur
 * voyait « Analyse en cours » dans le widget comme dans l'application, et
 * sa carte agent n'était jamais importée.
 *
 * Ce banc fixe la règle : l'application passe devant un widget, jamais
 * l'inverse, et deux exécutions de même nature se respectent.
 */

import { moduleSpace } from "./sandbox.mjs"

const failures = []

const SERVICES = "/documents/CTS Dashboard/Services"
const DATA = "/documents/CTS Dashboard/Data"
/* Le verrou ne concerne que l'appareil : il vit hors d'iCloud. */
const LOCK = "/library/CTS Dashboard/services-scan.lock"
const STATE = `${DATA}/services-scan-state.json`
const INDEX = `${DATA}/services-index.json`

/*
 * Une date de modification figée : l'empreinte d'un fichier vaut
 * « nom | taille | date de modification », et un banc qui la laisse
 * bouger ne peut rien affirmer sur ce que le balayage a déjà vu.
 */
const FIXED_MODIFICATION_DATE = new Date("2026-08-19T06:00:00.000Z")

function createFileManager(disk) {
  return {
    joinPath: (parent, child) => `${parent}/${child}`,
    documentsDirectory: () => "/documents",
    libraryDirectory: () => "/library",
    fileExists: target => disk.has(target),
    isFileDownloaded: () => true,
    downloadFileFromiCloud: async () => {},
    readString: target => {
      if (!disk.has(target)) throw new Error(`fichier absent : ${target}`)
      return disk.get(target)
    },
    writeString: (target, value) => disk.set(target, String(value)),
    remove: target => disk.delete(target),
    move: (from, to) => {
      disk.set(to, disk.get(from))
      disk.delete(from)
    },
    createDirectory: target => disk.set(target, ""),
    listContents: target =>
      [...disk.keys()]
        .filter(key => key.startsWith(`${target}/`))
        .map(key => key.slice(target.length + 1))
        .filter(name => !name.includes("/")),
    isDirectory: target => disk.get(target) === "",
    fileSize: () => 1,
    modificationDate: () => FIXED_MODIFICATION_DATE
  }
}

/*
 * Le gestionnaire est chargé avec ses vraies dépendances de stockage.
 * Seul l'importateur est doublé : c'est lui qui lit réellement le PDF, ce
 * qu'aucun banc hors iPhone ne peut faire.
 */
function loadManager(disk, { runsInWidget, importOutcome = null }) {
  const imports = []
  const fm = createFileManager(disk)

  const importer = {
    importPdf: async pdfPath => {
      imports.push(pdfPath)

      if (typeof importOutcome === "function") return importOutcome(disk)
      if (importOutcome) return { ...importOutcome }

      return { success: true, service: "EA05", date: "2026-08-20" }
    }
  }

  const { load } = moduleSpace(
    {
      config: { runsInWidget },
      args: { plainTexts: [], shortcutParameter: null },
      FileManager: { iCloud: () => fm, local: () => fm }
    },
    { doubles: { "CTS Importer": importer } }
  )

  return {
    manager: load("CTS Services Manager"),
    imports,
    fm,
    dashboardVersion: load("CTS Config").dashboardVersion
  }
}

function writeLock(disk, surface) {
  disk.set(LOCK, JSON.stringify({
    token: "verrou-en-place",
    createdAt: new Date().toISOString(),
    surface
  }))
}

function newDisk() {
  const disk = new Map()
  disk.set(SERVICES, "")
  disk.set(`${SERVICES}/DriverTimeCard (3).pdf`, "%PDF-1.4 contenu")
  return disk
}

/*
 * Les quatre combinaisons. Une seule doit passer outre le verrou :
 * l'application devant un widget.
 */
const CASES = [
  { held: "widget", runsInWidget: false, expected: true, label: "application devant un widget" },
  { held: "widget", runsInWidget: true, expected: false, label: "widget devant un widget" },
  { held: "application", runsInWidget: false, expected: false, label: "application devant une application" },
  { held: "application", runsInWidget: true, expected: false, label: "widget devant une application" }
]

for (const { held, runsInWidget, expected, label } of CASES) {
  const disk = newDisk()
  writeLock(disk, held)

  const { manager } = loadManager(disk, { runsInWidget })
  const result = await manager.scanServices({})
  const proceeded = result.status !== "locked"

  if (proceeded !== expected) {
    failures.push(
      `${label} : l'analyse ${proceeded ? "passe" : "est bloquée"} ` +
      `alors qu'elle devrait ${expected ? "passer" : "être bloquée"}`
    )
  }
}

/* Sans verrou, le PDF déposé doit être détecté et importé. */
{
  const disk = newDisk()
  const { manager, imports } = loadManager(disk, { runsInWidget: false })
  const result = await manager.scanServices({})

  if (result.status === "locked") {
    failures.push("sans verrou : l'analyse est refusée")
  }

  if (result.detected !== 1) {
    failures.push(`sans verrou : ${result.detected} PDF détecté(s) au lieu de 1`)
  }

  if (!imports.length) {
    failures.push("sans verrou : la carte agent déposée n'est pas importée")
  }
}

/*
 * Le widget importe, mais une carte à la fois.
 *
 * Lire une carte agent demande jusqu'à vingt-cinq secondes dans
 * l'application, quand iOS n'en accorde que quelques-unes à un widget.
 * L'import automatique est conservé — un conducteur qui dépose sa carte
 * ne doit rien avoir à faire — mais le widget s'en tient à un seul
 * fichier par réveil, et le moteur PDF y travaille sous un budget bien
 * plus court, vérifié par le banc des budgets.
 */
{
  const disk = newDisk()
  disk.set(`${SERVICES}/DriverTimeCard (4).pdf`, "%PDF-1.4 second")

  const { manager, imports } = loadManager(disk, { runsInWidget: true })
  const result = await manager.scanServices({})

  if (imports.length !== 1) {
    failures.push(`widget : ${imports.length} carte(s) lue(s) en un réveil au lieu d'une seule`)
  }

  if (result.remaining !== 1) {
    failures.push(`widget : ${result.remaining} carte(s) annoncée(s) en attente au lieu de 1`)
  }
}

{
  const disk = newDisk()
  disk.set(`${SERVICES}/DriverTimeCard (4).pdf`, "%PDF-1.4 second")

  const { manager, imports } = loadManager(disk, { runsInWidget: false })
  await manager.scanServices({})

  if (imports.length !== 2) {
    failures.push(`application : ${imports.length} carte(s) lue(s) au lieu des deux déposées`)
  }
}

/*
 * Budget dépassé dans le widget : la carte agent n'est pas fautive.
 *
 * Un widget qui renonce au bout de quelques secondes n'a rien appris du
 * PDF. L'annoncer comme un échec d'import afficherait au conducteur
 * « CTS Dashboard n'a pas réussi à importer ce PDF » pour un fichier
 * parfaitement valide, et poserait un délai de quinze minutes avant la
 * prochaine tentative. La carte reste donc simplement en attente, et
 * l'application la reprendra.
 */
{
  const timeout = {
    success: false,
    status: "exception",
    telemetryCode: "PDF_EXTRACTION_TIMEOUT",
    error: "La lecture du PDF n’a pas répondu dans le délai imparti."
  }

  const widgetDisk = newDisk()
  const widget = loadManager(widgetDisk, { runsInWidget: true, importOutcome: timeout })
  const widgetResult = await widget.manager.scanServices({})

  if (widgetResult.failed.length) {
    failures.push("budget dépassé : le widget annonce un échec d'import au conducteur")
  }

  if (widgetResult.remaining !== 1) {
    failures.push(
      `budget dépassé : ${widgetResult.remaining} carte(s) en attente au lieu de 1`
    )
  }

  const state = JSON.parse(widgetDisk.get(STATE) || "{}")
  const entry = Object.values(state.files || {})[0]

  if (entry?.status !== "interrupted") {
    failures.push(
      `budget dépassé : la carte est marquée « ${entry?.status} » au lieu de « interrupted »`
    )
  }

  /* Le même échec dans l'application est un vrai échec, lui. */
  const appDisk = newDisk()
  const application = loadManager(appDisk, { runsInWidget: false, importOutcome: timeout })
  const appResult = await application.manager.scanServices({})

  if (!appResult.failed.length) {
    failures.push("budget dépassé : l'application passe un échec réel sous silence")
  }
}

/*
 * Un enregistrement perdu doit être refait.
 *
 * L'état de balayage retient qu'un PDF a été importé puis indexé. Mais
 * cet état ne décrit que ce qui a été fait — il ne prouve pas que le
 * cache et l'entrée d'index sont encore là. Un cache effacé à la main,
 * égaré dans une synchronisation ou jamais redescendu sur un nouvel
 * appareil laissait le fichier dans un angle mort : détecté à chaque
 * balayage, jamais réimporté, et le widget annonçait « 1 PDF détecté,
 * aucun service exploitable » sans fin. Seul un changement de nom du
 * fichier en sortait.
 *
 * Ici l'index est vide et l'état dit « indexé » : les deux se
 * contredisent, et c'est l'index qui fait foi.
 */
{
  const canonical = "Service_2026-08-20_EA05.pdf"
  const disk = new Map()
  disk.set(SERVICES, "")
  disk.set(`${SERVICES}/${canonical}`, "%PDF-1.4 contenu")

  disk.set(STATE, JSON.stringify({
    version: 1,
    files: {
      [canonical]: {
        fingerprint: [
          canonical.toLowerCase(),
          1,
          FIXED_MODIFICATION_DATE.toISOString()
        ].join("|"),
        status: "indexed",
        lastAttemptAt: new Date().toISOString(),
        service: "EA05",
        date: "2026-08-20",
        canonicalFileName: canonical
      }
    }
  }))

  const { manager, imports } = loadManager(disk, { runsInWidget: false })
  await manager.scanServices({})

  if (!imports.length) {
    failures.push(
      "enregistrement perdu : le PDF reste ignoré alors que son cache " +
      "et son entrée d'index ont disparu"
    )
  }
}

/*
 * Le refus de validation, lui, doit tenir sous la version qui l'a
 * prononcé. Il porte sur le contenu du PDF, pas sur son enregistrement :
 * le même fichier donnera le même refus, et le réessayer à chaque réveil
 * ne ferait que brûler le temps que le widget n'a pas.
 *
 * Une version plus récente peut pourtant lire ce que la précédente
 * refusait : les cartes de journée de type C l'ont été jusqu'à ce que le
 * parser accepte le suffixe de leur numéro, et restaient refusées après la
 * correction. Un refus d'une version antérieure, ou d'avant que la version
 * soit retenue, est relu une fois, et le nouveau refus retient la version
 * installée. Celui d'une version plus récente tient : un second appareil
 * du collègue, pas encore à jour, ne doit pas relire à chaque réveil ce que
 * le premier vient de refuser.
 *
 * Sauf si une carte de la même date a été importée depuis le refus : c'est
 * le dernier dépôt du collègue, et une carte plus ancienne, relue et
 * acceptée, deviendrait le service affiché à sa place.
 */
const INSTALLED_VERSION = loadManager(new Map(), { runsInWidget: false }).dashboardVersion
const REFUSED_AT = "2026-08-19T07:00:00.000Z"
const REFUSAL = {
  success: false,
  status: "validation-error",
  errors: ["Carte agent illisible"]
}

function rejectedDisk(dashboardVersion, sameDateIndexedAt) {
  const rejected = "DriverTimeCard (3).pdf"
  const disk = new Map()
  disk.set(SERVICES, "")
  disk.set(`${SERVICES}/${rejected}`, "%PDF-1.4 contenu")

  disk.set(STATE, JSON.stringify({
    version: 1,
    files: {
      [rejected]: {
        fingerprint: [
          rejected.toLowerCase(),
          1,
          FIXED_MODIFICATION_DATE.toISOString()
        ].join("|"),
        status: "validation-error",
        lastAttemptAt: REFUSED_AT,
        date: "2026-08-20",
        error: "Carte agent illisible",
        ...(dashboardVersion === undefined ? {} : { dashboardVersion })
      }
    }
  }))

  if (sameDateIndexedAt) {
    disk.set(INDEX, JSON.stringify({
      version: 2,
      services: [{
        id: "2026-08-20_EA06",
        date: "2026-08-20",
        service: "EA06",
        pdfFile: "Service_2026-08-20_EA06.pdf",
        cacheFile: "Service_2026-08-20_EA06.json",
        indexedAt: sameDateIndexedAt
      }]
    }))
  }

  return disk
}

const REJECTION_CASES = [
  { label: "refus de la version installée", recordedBy: INSTALLED_VERSION, rereads: 0 },
  { label: "refus d'une version antérieure", recordedBy: "0.0.0", rereads: 1 },
  { label: "refus d'une version plus récente", recordedBy: "999.0.0", rereads: 0 },
  { label: "refus d'avant que la version soit retenue", recordedBy: undefined, rereads: 1 },
  {
    label: "refus d'une version antérieure, carte de la même date importée depuis",
    recordedBy: "0.0.0",
    sameDateIndexedAt: "2026-08-19T08:00:00.000Z",
    rereads: 0
  },
  {
    label: "refus d'une version antérieure, carte de la même date importée avant lui",
    recordedBy: "0.0.0",
    sameDateIndexedAt: "2026-08-19T06:00:00.000Z",
    rereads: 1
  }
]

for (const { label, recordedBy, sameDateIndexedAt, rereads } of REJECTION_CASES) {
  const { manager, imports } = loadManager(rejectedDisk(recordedBy, sameDateIndexedAt), {
    runsInWidget: false,
    importOutcome: REFUSAL
  })

  await manager.scanServices({})
  await manager.scanServices({})

  if (imports.length !== rereads) {
    failures.push(
      `${label} : le PDF est relu ${imports.length} fois en deux balayages au lieu de ${rereads}`
    )
  }
}

/*
 * Une carte déjà importée n'est jamais relue. Jusqu'à la 1.4.7, pourtant,
 * la seconde tranche d'une voiture conduite deux fois prenait la direction
 * de la première : le 26 octobre 2026, un conducteur a attendu sa relève du
 * mauvais côté. Une carte déposée à l'avance l'aurait gardée jusqu'à son
 * jour. Celle qui porte deux tranches sur une même voiture, lue par une
 * version antérieure ou d'avant que la version soit retenue, est relue une
 * fois ; le pipeline inscrit alors la version installée dans son entrée
 * d'index, comme le fait le vrai, et elle n'est plus relue.
 *
 * Sauf, comme pour un refus, si une carte de la même date a été importée
 * depuis : c'est le dernier dépôt du collègue, que la carte relue
 * supplanterait.
 */
const CACHE = "/documents/CTS Dashboard/Cache/Services"
const INDEXED = "Service_2026-08-20_EA05.pdf"
const INDEXED_AT = "2026-08-19T06:30:00.000Z"

function indexedDisk({ dashboardVersion, vehicles, sameDateIndexedAt, clearedAt }) {
  const disk = new Map()
  disk.set(SERVICES, "")
  disk.set(`${SERVICES}/${INDEXED}`, "%PDF-1.4 contenu")
  disk.set(`${CACHE}/Service_2026-08-20_EA05.json`, JSON.stringify({
    service: "EA05",
    date: "2026-08-20",
    slices: vehicles.map(vehicle => ({ lineCode: "02", vehicle }))
  }))

  const services = [{
    id: "2026-08-20_EA05",
    date: "2026-08-20",
    service: "EA05",
    pdfFile: INDEXED,
    cacheFile: "Service_2026-08-20_EA05.json",
    indexedAt: INDEXED_AT,
    slices: vehicles.length,
    source: { sizeKilobytes: 1, modifiedAt: FIXED_MODIFICATION_DATE.toISOString() },
    ...(dashboardVersion === undefined ? {} : { dashboardVersion }),
    ...(clearedAt ? { cache: { clearedAt } } : {})
  }]

  if (sameDateIndexedAt) {
    services.push({
      id: "2026-08-20_EA06",
      date: "2026-08-20",
      service: "EA06",
      pdfFile: "Service_2026-08-20_EA06.pdf",
      cacheFile: "Service_2026-08-20_EA06.json",
      indexedAt: sameDateIndexedAt
    })
  }

  disk.set(INDEX, JSON.stringify({ version: 2, services }))

  return disk
}

function reindexWithInstalledVersion(disk) {
  const index = JSON.parse(disk.get(INDEX))
  const entry = index.services.find(service => service.pdfFile === INDEXED)

  entry.dashboardVersion = INSTALLED_VERSION
  entry.indexedAt = new Date().toISOString()
  disk.set(INDEX, JSON.stringify(index))

  return { success: true, service: "EA05", date: "2026-08-20", pdfFileName: INDEXED }
}

const REREAD_CASES = [
  { label: "même voiture, lue d'avant que la version soit retenue", vehicles: [9, 9], rereads: 1 },
  { label: "même voiture, lue par une version antérieure", vehicles: [9, 9], recordedBy: "1.4.7", rereads: 1 },
  { label: "même voiture, lue par la version installée", vehicles: [9, 9], recordedBy: INSTALLED_VERSION, rereads: 0 },
  { label: "deux voitures différentes", vehicles: [9, 16], rereads: 0 },
  { label: "une seule tranche", vehicles: [9], rereads: 0 },
  { label: "même voiture, service passé dont le cache est vidé", vehicles: [9, 9], clearedAt: INDEXED_AT, rereads: 0 },
  {
    label: "même voiture, carte de la même date importée depuis",
    vehicles: [9, 9],
    sameDateIndexedAt: "2026-08-19T08:00:00.000Z",
    rereads: 0
  },
  {
    label: "même voiture, carte de la même date importée avant elle",
    vehicles: [9, 9],
    sameDateIndexedAt: "2026-08-19T06:00:00.000Z",
    rereads: 1
  }
]

for (const { label, vehicles, recordedBy, sameDateIndexedAt, clearedAt, rereads } of REREAD_CASES) {
  const disk = indexedDisk({ dashboardVersion: recordedBy, vehicles, sameDateIndexedAt, clearedAt })
  const { manager, imports } = loadManager(disk, {
    runsInWidget: false,
    importOutcome: reindexWithInstalledVersion
  })

  await manager.scanServices({})
  await manager.scanServices({})

  if (imports.length !== rereads) {
    failures.push(
      `carte importée, ${label} : relue ${imports.length} fois en deux balayages au lieu de ${rereads}`
    )
  }
}

/*
 * Un balayage qui ne trouve rien n'écrit rien.
 *
 * L'état du balayage était réenregistré à chaque réveil, uniquement pour
 * y inscrire une nouvelle date. Un widget réveillé souvent écrivait donc
 * dans iCloud plusieurs fois par heure sans qu'aucun fichier n'ait
 * changé — de l'usure, et autant d'occasions d'être tué en pleine
 * écriture. L'état n'est plus écrit que lorsqu'il apporte quelque chose,
 * ou une fois par heure pour rester lisible dans le diagnostic.
 */
{
  const disk = new Map()
  disk.set(SERVICES, "")

  const { manager, fm } = loadManager(disk, { runsInWidget: false })
  let writes = 0

  const original = fm.writeString
  fm.writeString = (target, value) => {
    if (String(target).startsWith(STATE)) writes++
    return original(target, value)
  }

  await manager.scanServices({})
  const afterFirst = writes

  if (afterFirst === 0) {
    failures.push("dossier vide : le premier balayage n'écrit jamais son état")
  }

  await manager.scanServices({})
  await manager.scanServices({})

  if (writes > afterFirst) {
    failures.push(
      `dossier inchangé : ${writes - afterFirst} écriture(s) d'état inutile(s)`
    )
  }
}

/*
 * Le verrou pris porte la nature de l'exécution, sinon la reprise est
 * aveugle. Et il ne passe jamais par iCloud : il n'y coûtait que des
 * écritures synchronisées, et pouvait bloquer un autre appareil.
 */
for (const runsInWidget of [true, false]) {
  const disk = newDisk()
  const { manager, fm } = loadManager(disk, { runsInWidget })
  const iCloudLocks = []
  let seen = ""

  const original = fm.writeString
  fm.writeString = (target, value) => {
    if (target === LOCK) {
      try { seen = String(JSON.parse(value).surface || "") } catch (_) {}
    }
    if (target.startsWith("/documents/") && target.endsWith(".lock")) iCloudLocks.push(target)
    return original(target, value)
  }

  await manager.scanServices({})

  const expected = runsInWidget ? "widget" : "application"

  if (seen !== expected) {
    failures.push(`verrou pris : nature « ${seen || "absente"} » au lieu de « ${expected} »`)
  }

  if (iCloudLocks.length) {
    failures.push(`verrou pris : écrit dans iCloud (${iCloudLocks.join(", ")})`)
  }

  if (disk.has(LOCK)) {
    failures.push("verrou pris : il survit à la fin du balayage")
  }
}

if (failures.length) {
  console.log("ÉCHEC  balayage des services")
  for (const failure of failures) console.log(`         ${failure}`)
  process.exit(1)
}

console.log("ok     balayage des services (verrou : 4 combinaisons, nature, hors d'iCloud, rendu ; détection ; " +
  "enregistrement perdu ; refus de validation tenu sous sa version, relu une fois sous une plus récente ; " +
  `carte importée relue une fois quand une voiture y revient (${REREAD_CASES.length} cas) ; ` +
  "aucune écriture inutile ; " +
  "une carte par réveil ; budget dépassé)")
