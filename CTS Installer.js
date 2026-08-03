// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: arrow.down.circle.fill;

// CTS Installer.js
// Installation et mise à jour automatiques de CTS Dashboard.

const INSTALLER_VERSION = "1.0.1"

const REPOSITORY = {
  owner: "LASCAMPIA67",
  name: "CTS-Dashboard",
  branch: "main"
}

const DOWNLOAD_TIMEOUT_SECONDS = 30

const fm = FileManager.iCloud()
const documentsDirectory = fm.documentsDirectory()

const root = fm.joinPath(
  documentsDirectory,
  "CTS Dashboard"
)

const paths = {
  root,

  data:
    fm.joinPath(
      root,
      "Data"
    ),

  database:
    fm.joinPath(
      root,
      "Database"
    ),

  cache:
    fm.joinPath(
      root,
      "Cache"
    ),

  services:
    fm.joinPath(
      root,
      "Services"
    ),

  servicesArchive:
    fm.joinPath(
      fm.joinPath(
        root,
        "Services"
      ),
      "Archive"
    ),

  servicesRejected:
    fm.joinPath(
      fm.joinPath(
        root,
        "Services"
      ),
      "Rejected"
    ),

  servicesCache:
    fm.joinPath(
      fm.joinPath(
        root,
        "Cache"
      ),
      "Services"
    ),

  servicesTextCache:
    fm.joinPath(
      fm.joinPath(
        fm.joinPath(
          root,
          "Cache"
        ),
        "Services"
      ),
      "Text"
    ),

  libraries:
    fm.joinPath(
      root,
      "Libraries"
    ),

  pdfEngine:
    fm.joinPath(
      fm.joinPath(
        root,
        "Libraries"
      ),
      "PDF"
    )
}

const RESOURCE_DESTINATIONS = {
  "lines.json":
    fm.joinPath(
      paths.database,
      "lines.json"
    ),

  "stops.json":
    fm.joinPath(
      paths.database,
      "stops.json"
    ),

  "places.json":
    fm.joinPath(
      paths.database,
      "places.json"
    ),

  "pdf.min.mjs":
    fm.joinPath(
      paths.pdfEngine,
      "pdf.min.mjs"
    ),

  "pdf.worker.min.mjs":
    fm.joinPath(
      paths.pdfEngine,
      "pdf.worker.min.mjs"
    )
}

await main()
Script.complete()

// =====================================================
// INSTALLATION
// =====================================================

async function main() {
  try {
    const confirmed =
      await requestConfirmation()

    if (!confirmed) {
      return
    }

    ensureDirectories()

    const manifest =
      await downloadManifest()

    validateManifest(manifest)

    const scripts =
      normalizeScriptList(
        manifest.files
      )

    const resources =
      Object.keys(
        RESOURCE_DESTINATIONS
      )

    const installed = []
    const updated = []
    const preserved = []

    for (const fileName of scripts) {
      const result =
        await installFile({
          fileName,

          destinationPath:
            fm.joinPath(
              documentsDirectory,
              fileName
            ),

          preserveExisting: false
        })

      recordResult(
        result,
        fileName,
        installed,
        updated,
        preserved
      )
    }

    for (const fileName of resources) {
      const result =
        await installFile({
          fileName,

          destinationPath:
            RESOURCE_DESTINATIONS[
              fileName
            ],

          preserveExisting:
            fileName.endsWith(
              ".json"
            )
        })

      recordResult(
        result,
        fileName,
        installed,
        updated,
        preserved
      )
    }

    await writeInstallationMetadata({
      manifest,
      installed,
      updated,
      preserved
    })

    await showSuccess({
      manifest,
      installed,
      updated,
      preserved
    })
  } catch (error) {
    await showFailure(error)
  }
}

// =====================================================
// MANIFESTE
// =====================================================

async function downloadManifest() {
  const content =
    await downloadText(
      rawUrl("version.json"),
      "version.json"
    )

  try {
    return JSON.parse(content)
  } catch (error) {
    throw new Error(
      "Le fichier version.json publié sur GitHub est invalide."
    )
  }
}

function validateManifest(manifest) {
  if (
    !manifest ||
    typeof manifest !== "object" ||
    Array.isArray(manifest)
  ) {
    throw new Error(
      "Le manifeste de CTS Dashboard est invalide."
    )
  }

  if (
    typeof manifest.version !== "string" ||
    !manifest.version.trim()
  ) {
    throw new Error(
      "La version de CTS Dashboard est absente."
    )
  }

  if (
    !Array.isArray(manifest.files) ||
    manifest.files.length === 0
  ) {
    throw new Error(
      "La liste des scripts à installer est absente."
    )
  }

  const minimumInstaller =
    String(
      manifest.minimumInstaller ||
      "0.0.0"
    )

  if (
    compareVersions(
      INSTALLER_VERSION,
      minimumInstaller
    ) < 0
  ) {
    throw new Error(
      [
        "Cette version de CTS Installer est trop ancienne.",
        "",
        `Version actuelle : ${INSTALLER_VERSION}`,
        `Version minimale : ${minimumInstaller}`
      ].join("\n")
    )
  }
}

function normalizeScriptList(files) {
  const result = []

  for (const value of files) {
    const fileName =
      String(value || "").trim()

    if (
      !fileName.endsWith(".js") ||
      fileName === "CTS Installer.js" ||
      result.includes(fileName)
    ) {
      continue
    }

    result.push(fileName)
  }

  if (!result.length) {
    throw new Error(
      "Aucun script valide n’est déclaré dans version.json."
    )
  }

  return result
}

// =====================================================
// FICHIERS
// =====================================================

async function installFile({
  fileName,
  destinationPath,
  preserveExisting
}) {
  if (
    preserveExisting &&
    await isValidExistingFile(
      destinationPath,
      fileName
    )
  ) {
    return "preserved"
  }

  const data =
    await downloadData(
      rawUrl(fileName),
      fileName
    )

  if (!data) {
    throw new Error(
      `${fileName} : téléchargement vide.`
    )
  }

  const existed =
    fm.fileExists(
      destinationPath
    )

  writeSafely(
    destinationPath,
    data
  )

  return existed
    ? "updated"
    : "installed"
}

async function isValidExistingFile(
  path,
  fileName
) {
  if (!fm.fileExists(path)) {
    return false
  }

  try {
    await ensureDownloaded(path)

    const size =
      Number(
        fm.fileSize(path)
      )

    if (
      !Number.isFinite(size) ||
      size <= 0
    ) {
      return false
    }

    if (fileName.endsWith(".json")) {
      const parsed =
        JSON.parse(
          fm.readString(path)
        )

      return Boolean(
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      )
    }

    return true
  } catch (error) {
    return false
  }
}

function writeSafely(
  destinationPath,
  data
) {
  const temporaryPath =
    `${destinationPath}.download`

  removeQuietly(
    temporaryPath
  )

  try {
    fm.write(
      temporaryPath,
      data
    )

    if (!fm.fileExists(temporaryPath)) {
      throw new Error(
        "Le fichier temporaire n’a pas été créé."
      )
    }

    removeQuietly(
      destinationPath
    )

    fm.move(
      temporaryPath,
      destinationPath
    )
  } catch (error) {
    removeQuietly(
      temporaryPath
    )

    throw error
  }
}

function recordResult(
  status,
  fileName,
  installed,
  updated,
  preserved
) {
  if (status === "installed") {
    installed.push(fileName)
  } else if (status === "updated") {
    updated.push(fileName)
  } else {
    preserved.push(fileName)
  }
}

// =====================================================
// TÉLÉCHARGEMENTS
// =====================================================

async function downloadText(
  url,
  label
) {
  const request =
    createRequest(url)

  try {
    const content =
      await request.loadString()

    validateResponse(
      request,
      label
    )

    if (!content.trim()) {
      throw new Error(
        "Réponse vide."
      )
    }

    return content
  } catch (error) {
    throw new Error(
      `${label} impossible à télécharger : ${errorMessage(error)}`
    )
  }
}

async function downloadData(
  url,
  label
) {
  const request =
    createRequest(url)

  try {
    const data =
      await request.load()

    validateResponse(
      request,
      label
    )

    return data
  } catch (error) {
    throw new Error(
      `${label} impossible à télécharger : ${errorMessage(error)}`
    )
  }
}

function createRequest(url) {
  const request =
    new Request(url)

  request.timeoutInterval =
    DOWNLOAD_TIMEOUT_SECONDS

  return request
}

function validateResponse(
  request,
  label
) {
  const statusCode =
    Number(
      request.response?.statusCode
    )

  if (
    Number.isFinite(statusCode) &&
    (
      statusCode < 200 ||
      statusCode >= 300
    )
  ) {
    throw new Error(
      `${label} : réponse HTTP ${statusCode}.`
    )
  }
}

function rawUrl(fileName) {
  return [
    "https://raw.githubusercontent.com",
    encodeURIComponent(
      REPOSITORY.owner
    ),
    encodeURIComponent(
      REPOSITORY.name
    ),
    encodeURIComponent(
      REPOSITORY.branch
    ),
    encodePath(fileName)
  ].join("/")
}

function encodePath(path) {
  return String(path)
    .split("/")
    .map(
      part =>
        encodeURIComponent(part)
    )
    .join("/")
}

// =====================================================
// DOSSIERS
// =====================================================

function ensureDirectories() {
  const directories = [
    paths.root,
    paths.data,
    paths.database,
    paths.cache,
    paths.services,
    paths.servicesArchive,
    paths.servicesRejected,
    paths.servicesCache,
    paths.servicesTextCache,
    paths.libraries,
    paths.pdfEngine
  ]

  for (const path of directories) {
    if (!fm.fileExists(path)) {
      fm.createDirectory(
        path,
        true
      )
    }
  }
}

// =====================================================
// MÉTADONNÉES
// =====================================================

async function writeInstallationMetadata({
  manifest,
  installed,
  updated,
  preserved
}) {
  const metadata = {
    installerVersion:
      INSTALLER_VERSION,

    dashboardVersion:
      manifest.version,

    installedAt:
      new Date().toISOString(),

    repository:
      REPOSITORY,

    installed,
    updated,
    preserved
  }

  fm.writeString(
    fm.joinPath(
      paths.data,
      "installation.json"
    ),

    JSON.stringify(
      metadata,
      null,
      2
    )
  )
}

// =====================================================
// INTERFACE
// =====================================================

async function requestConfirmation() {
  const alert = new Alert()

  alert.title =
    "Installer CTS Dashboard"

  alert.message = [
    "L’installation et la mise à jour sont automatiques.",
    "",
    "Une connexion Internet est nécessaire.",
    "",
    "Les PDF de service et les données personnelles existantes seront conservés."
  ].join("\n")

  alert.addAction(
    "Installer ou mettre à jour"
  )

  alert.addCancelAction(
    "Annuler"
  )

  return (
    await alert.present()
  ) === 0
}

async function showSuccess({
  manifest,
  installed,
  updated,
  preserved
}) {
  const alert = new Alert()

  alert.title =
    "Installation terminée"

  alert.message = [
    `CTS Dashboard ${manifest.version} est installé.`,
    "",
    `${installed.length} fichier(s) installé(s)`,
    `${updated.length} fichier(s) mis à jour`,
    `${preserved.length} ressource(s) conservée(s)`,
    "",
    "Vous pouvez maintenant lancer CTS Dashboard."
  ].join("\n")

  alert.addAction("Terminer")

  await alert.present()
}

async function showFailure(error) {
  const alert = new Alert()

  alert.title =
    "Installation impossible"

  alert.message = [
    errorMessage(error),
    "",
    "Vérifiez votre connexion Internet puis relancez CTS Installer."
  ].join("\n")

  alert.addAction("OK")

  await alert.present()
}

// =====================================================
// OUTILS
// =====================================================

async function ensureDownloaded(path) {
  if (
    fm.fileExists(path) &&
    !fm.isFileDownloaded(path)
  ) {
    await fm.downloadFileFromiCloud(
      path
    )
  }
}

function compareVersions(
  first,
  second
) {
  const a =
    versionParts(first)

  const b =
    versionParts(second)

  const length =
    Math.max(
      a.length,
      b.length
    )

  for (
    let index = 0;
    index < length;
    index++
  ) {
    const difference =
      (a[index] || 0) -
      (b[index] || 0)

    if (difference !== 0) {
      return difference > 0
        ? 1
        : -1
    }
  }

  return 0
}

function versionParts(value) {
  return String(value || "")
    .split(".")
    .map(
      part =>
        Number.parseInt(
          part,
          10
        ) || 0
    )
}

function removeQuietly(path) {
  try {
    if (fm.fileExists(path)) {
      fm.remove(path)
    }
  } catch (error) {}
}

function errorMessage(error) {
  if (
    error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message.trim()
  }

  return String(
    error ||
    "Erreur inconnue."
  )
}
