import { importFrom, isolatedModule } from "./sandbox.mjs"

const DOCS = "/documents"
const ENGINE = "/library/CTS Dashboard/Libraries/PDF"
const LIBRARY = `${ENGINE}/pdf.min.mjs`
const WORKER = `${ENGINE}/pdf.worker.min.mjs`
const METADATA = `${ENGINE}/engine.json`

const VALID_SIZE_KB = 400
const TRUNCATED_SIZE_KB = 1

function buildWorld({
  librariesPresent = true,
  metadataWriteFails = false,
  downloadSizeKb = VALID_SIZE_KB,
  shrinkOnMove = false
} = {}) {
  const disk = new Map()
  const written = []
  const downloads = []
  const iCloudCalls = []

  if (librariesPresent) {
    disk.set(LIBRARY, VALID_SIZE_KB)
    disk.set(WORKER, VALID_SIZE_KB)
  }

  const fm = {
    joinPath: (a, b) => `${a}/${b}`,
    documentsDirectory: () => DOCS,
    libraryDirectory: () => "/library",
    fileExists: target => disk.has(target),
    createDirectory: () => {},
    isFileDownloaded: target => {
      iCloudCalls.push(target)
      return true
    },
    downloadFileFromiCloud: async target => {
      iCloudCalls.push(target)
    },
    fileSize: target => disk.get(target) ?? 0,
    write: (target, data) => disk.set(target, Number(data?.sizeKilobytes) || 0),
    writeString: (target, content) => {
      if (metadataWriteFails && target === METADATA) {
        throw new Error("iCloud a refusé l’écriture")
      }

      written.push(target)
      disk.set(target, Math.max(1, Math.round(String(content).length / 1024)))
    },
    move: (from, to) => {
      disk.set(to, shrinkOnMove ? TRUNCATED_SIZE_KB : disk.get(from))
      disk.delete(from)
    },
    remove: target => disk.delete(target)
  }

  const loaded = {}

  const load = name => {
    loaded[name] = isolatedModule(name, {
      importModule: importFrom(loaded),
      globals: {
        config: { runsInWidget: true },
        Request: class {
          constructor(url) {
            this.url = url
            this.response = { statusCode: 200 }
          }
          async load() {
            downloads.push(this.url)
            return { sizeKilobytes: downloadSizeKb }
          }
        },
        FileManager: { iCloud: () => fm, local: () => fm }
      }
    })

    return loaded[name]
  }

  load("CTS Config")
  load("CTS Utils")
  load("CTS Storage")

  return { engine: load("CTS PDF Engine"), disk, written, downloads, iCloudCalls }
}

const failures = []

async function attempt(world) {
  try {
    return { result: await world.engine.ensureReady(), error: null }
  } catch (error) {
    return { result: null, error }
  }
}

{
  const world = buildWorld({ metadataWriteFails: true })
  const { result, error } = await attempt(world)

  if (error) {
    failures.push(
      `un fichier que personne ne lit a interrompu la préparation : ${error.message || error}`
    )
  } else if (!result?.ready) {
    failures.push("le moteur ne se déclare pas prêt alors que ses deux fichiers sont valides")
  }
}

{
  const world = buildWorld()

  await attempt(world)

  if (world.written.includes(METADATA)) {
    failures.push(
      "engine.json est réécrit à chaque lecture, sans qu’aucune installation ait eu lieu"
    )
  }

  if (world.downloads.length) {
    failures.push(`des bibliothèques valides ont été retéléchargées : ${world.downloads.length}`)
  }
}

{
  const world = buildWorld({ librariesPresent: false })
  const { error } = await attempt(world)

  if (error) {
    failures.push(`installation neuve refusée : ${error.message || error}`)
  }

  if (world.downloads.length !== 2) {
    failures.push(`installation neuve : ${world.downloads.length} téléchargement(s), deux attendus`)
  }

  if (!world.written.includes(METADATA) || !world.disk.has(METADATA)) {
    failures.push("une installation neuve ne laisse aucune trace de la version du moteur")
  }
}

{
  const world = buildWorld({ librariesPresent: false, metadataWriteFails: true })
  const { result, error } = await attempt(world)

  if (error) {
    failures.push(
      `une installation réussie a été annulée par ses métadonnées : ${error.message || error}`
    )
  } else if (!result?.ready) {
    failures.push("moteur installé mais déclaré non prêt à cause de ses métadonnées")
  }

  if (!world.disk.has(LIBRARY) || !world.disk.has(WORKER)) {
    failures.push("les bibliothèques n’ont pas survécu à l’échec des métadonnées")
  }
}

{
  const world = buildWorld({ librariesPresent: false, downloadSizeKb: TRUNCATED_SIZE_KB })
  const { error } = await attempt(world)

  if (!error) {
    failures.push("une bibliothèque tronquée a été acceptée comme installée")
  }
}

{
  const world = buildWorld({ librariesPresent: false, shrinkOnMove: true })
  const { error } = await attempt(world)

  if (!error) {
    failures.push("une bibliothèque posée incomplète a été acceptée comme installée")
  }
}

{
  const world = buildWorld()
  const { result, error } = await attempt(world)

  if (error || !result?.ready) {
    failures.push(`bibliothèques locales : le moteur ne se prépare pas (${error?.message || error})`)
  }

  if (world.iCloudCalls.length) {
    failures.push(
      `bibliothèques locales : iCloud encore sollicité pour ${world.iCloudCalls.join(", ")}`
    )
  }

  if (!String(result?.libraryPath || "").startsWith("/library/")) {
    failures.push(`bibliothèques locales : le moteur lit ${result?.libraryPath} au lieu de l'appareil`)
  }
}

if (failures.length) {
  console.log("ÉCHEC  préparation du moteur PDF")
  for (const failure of failures) console.log(`         ${failure}`)
  process.exit(1)
}

console.log(
  "ok     préparation du moteur PDF (métadonnées jamais bloquantes, écrites à " +
  "l’installation seulement, bibliothèques toujours contrôlées, et rangées " +
  "sur l'appareil sans rien demander à iCloud)"
)
