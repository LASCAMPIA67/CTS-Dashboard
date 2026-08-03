// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: arrow.down.circle.fill;

// CTS Installer.js
// Installation et mise à jour automatiques de CTS Dashboard.

const INSTALLER_VERSION = "1.0.0"

const REPOSITORY = {
  owner: "LASCAMPIA67",
  name: "CTS-Dashboard",
  branch: "main"
}

const DOWNLOAD_TIMEOUT_SECONDS = 30

const fm = FileManager.iCloud()
const documentsDirectory = fm.documentsDirectory()

const dashboardRoot = fm.joinPath(
  documentsDirectory,
  "CTS Dashboard"
)

const paths = {
  root: dashboardRoot,

  data: fm.joinPath(
    dashboardRoot,
    "Data"
  ),

  database: fm.joinPath(
    dashboardRoot,
    "Database"
  ),

  cache: fm.joinPath(
    dashboardRoot,
    "Cache"
  ),

  services: fm.joinPath(
    dashboardRoot,
    "Services"
  ),

  archives: fm.joinPath(
    fm.joinPath(
      dashboardRoot,
      "Services"
    ),
    "Archive"
  ),

  rejected: fm.joinPath(
    fm.joinPath(
      dashboardRoot,
      "Services"
    ),
    "Rejected"
  ),

  servicesCache: fm.joinPath(
    fm.joinPath(
      dashboardRoot,
      "Cache"
    ),
    "Services"
  ),

  servicesTextCache: fm.joinPath(
    fm.joinPath(
      fm.joinPath(
        dashboardRoot,
        "Cache"
      ),
      "Services"
    ),
    "Text"
  ),

  libraries: fm.joinPath(
    dashboardRoot,
    "Libraries"
  ),

  pdf: fm.joinPath(
    fm.joinPath(
      dashboardRoot,
      "Libraries"
    ),
    "PDF"
  )
}

const resourceDestinations = {
  "lines.json": fm.joinPath(
    paths.database,
    "lines.json"
  ),

  "stops.json": fm.joinPath(
    paths.database,
    "stops.json"
  ),

  "places.json": fm.joinPath(
    paths.database,
    "places.json"
  ),

  "pdf.min.mjs": fm.joinPath(
    paths.pdf,
    "pdf.min.mjs"
  ),

  "pdf.worker.min.mjs": fm.joinPath(
    paths.pdf,
    "pdf.worker.min.mjs"
  )
}

await runInstaller()
Script.complete()

// =====================================================
// INSTALLATION PRINCIPALE
// =====================================================

async function runInstaller() {
  try {
    const confirmation =
      await requestInstallationConfirmation()

    if (!confirmation) {
      return
    }

    const progress =
      createProgressAlert()

    await progress.present()

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
        resourceDestinations
      )

    const totalFiles =
      scripts.length +
      resources.length

    let completedFiles = 0
    const installed = []
    const updated = []
    const preserved = []

    for (const fileName of scripts) {
      updateProgress(
        progress,
        fileName,
        completedFiles,
        totalFiles
      )

      const result =
        await installRemoteFile({
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

      completedFiles++
    }

    for (const fileName of resources) {
      updateProgress(
        progress,
        fileName,
        completedFiles,
        totalFiles
      )

      const result =
        await installRemoteFile({
          fileName,
          destinationPath:
            resourceDestinations[
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

      completedFiles++
    }

    await writeInstallationMetadata(
      manifest,
      installed,
      updated,
      preserved
    )

    await showSuccess(
      manifest,
      installed,
      updated,
      preserved
    )
  } catch (error) {
    await showFailure(error)
  }
}

// =====================================================
// MANIFESTE DISTANT
// =====================================================

async function downloadManifest() {
  const url =
    rawUrl(
      "version.json"
    )

  const content =
    await downloadText(
      url,
      "version.json"
    )

  let manifest

  try {
    manifest =
      JSON.parse(content)
  } catch (error) {
    throw new Error(
      "Le fichier version.json publié sur GitHub est invalide."
    )
  }

  return manifest
}

function validateManifest(
  manifest
) {
  if (
    !manifest ||
    typeof manifest !==
      "object" ||
    Array.isArray(manifest)
  ) {
    throw new Error(
      "Le manifeste de CTS Dashboard est invalide."
    )
  }

  if (
    typeof manifest.version !==
      "string" ||
    !manifest.version.trim()
  ) {
    throw new Error(
      "La version de CTS Dashboard est absente."
    )
  }

  if (
    !Array.isArray(
      manifest.files
    ) ||
    !manifest.files.length
  ) {
    throw new Error(
      "La liste des scripts à installer est absente."
    )
  }

  if (
    compareVersions(
      INSTALLER_VERSION,
      manifest.minimumInstaller ||
        "0.0.0"
    ) < 0
  ) {
    throw new Error(
      [
        "Cette version de CTS Installer est trop ancienne.",
        "",
        `Installateur actuel : ${INSTALLER_VERSION}`,
        `Version minimale : ${manifest.minimumInstaller}`
      ].join("\n")
    )
  }
}

function normalizeScriptList(
  files
) {
  const unique = []

  for (const value of files) {
    const fileName =
      String(value || "")
        .trim()

    if (
      !fileName ||
      !fileName.endsWith(
        ".js"
      ) ||
      fileName ===
        "CTS Installer.js" ||
      unique.includes(fileName)
    ) {
      continue
    }

    unique.push(fileName)
  }

  if (!unique.length) {
    throw new Error(
      "Aucun script valide n’est déclaré dans version.json."
    )
  }

  return unique
}

// =====================================================
// INSTALLATION DES FICHIERS
// =====================================================

async function installRemoteFile({
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
    return {
      status: "preserved"
    }
  }

  const data =
    await downloadData(
      rawUrl(fileName),
      fileName
    )

  validateDownloadedData(
    data,
    fileName
  )

  const existed =
    fm.fileExists(
      destinationPath
    )

  await writeDataSafely(
    destinationPath,
    data
  )

  return {
    status:
      existed
        ? "updated"
        : "installed"
  }
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
      fm.fileSize(path)

    if (
      !Number.isFinite(size) ||
      size <= 0
    ) {
      return false
    }

    if (
      fileName.endsWith(
        ".json"
      )
    ) {
      const content =
        fm.readString(path)

      const parsed =
        JSON.parse(content)

      return Boolean(
        parsed &&
        typeof parsed ===
          "object" &&
        !Array.isArray(parsed)
      )
    }

    return true
  } catch (error) {
    return false
  }
}

function validateDownloadedData(
  data,
  fileName
) {
  if (!data) {
    throw new Error(
      `${fileName} : téléchargement vide.`
    )
  }

  const length =
    Number(data.length)

  if (
    Number.isFinite(length) &&
    length <= 0
  ) {
    throw new Error(
      `${fileName} : fichier téléchargé vide.`
    )
  }
}

async function writeDataSafely(
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

    if (
      !fm.fileExists(
        temporaryPath
      )
    ) {
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
  result,
  fileName,
  installed,
  updated,
  preserved
) {
  switch (result.status) {
    case "installed":
      installed.push(fileName)
      break

    case "updated":
      updated.push(fileName)
      break

    case "preserved":
      preserved.push(fileName)
      break
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

    validateHttpResponse(
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

    validateHttpResponse(
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

function validateHttpResponse(
  request,
  label
) {
  const status =
    Number(
      request.response
        ?.statusCode
    )

  if (
    Number.isFinite(status) &&
    (
      status < 200 ||
      status >= 300
    )
  ) {
    throw new Error(
      `${label} : réponse HTTP ${status}.`
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
    paths.archives,
    paths.rejected,
    paths.servicesCache,
    paths.servicesTextCache,
    paths.libraries,
    paths.pdf
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
// MÉTADONNÉES LOCALES
// =====================================================

async function writeInstallationMetadata(
  manifest,
  installed,
  updated,
  preserved
) {
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

  const path =
    fm.joinPath(
      paths.data,
      "installation.json"
    )

  fm.writeString(
    path,
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

async function requestInstallationConfirmation() {
  const alert =
    new Alert()

  alert.title =
    "Installer CTS Dashboard"

  alert.message = [
    "L’installateur va télécharger et configurer automatiquement CTS Dashboard.",
    "",
    "Une connexion Internet est nécessaire.",
    "",
    "Les services PDF et les données personnelles existantes ne seront pas supprimés."
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

function createProgressAlert() {
  const alert =
    new Alert()

  alert.title =
    "Installation en cours"

  alert.message =
    "Préparation de CTS Dashboard…"

  return alert
}

function updateProgress(
  alert,
  fileName,
  completed,
  total
) {
  const percentage =
    total > 0
      ? Math.round(
          completed /
          total *
          100
        )
      : 0

  alert.message = [
    `Progression : ${percentage} %`,
    "",
    `Téléchargement : ${fileName}`,
    "",
    "Ne fermez pas Scriptable."
  ].join("\n")
}

async function showSuccess(
  manifest,
  installed,
  updated,
  preserved
) {
  const alert =
    new Alert()

  alert.title =
    "Installation terminée"

  alert.message = [
    `CTS Dashboard ${manifest.version} est prêt.`,
    "",
    `${installed.length} fichier(s) installé(s)`,
    `${updated.length} fichier(s) mis à jour`,
    `${preserved.length} ressource(s) conservée(s)`,
    "",
    "Prochaine étape :",
    "1. Lancez CTS Dashboard une fois.",
    "2. Déposez vos PDF dans le dossier Services.",
    "3. Ajoutez le widget Scriptable à l’écran d’accueil."
  ].join("\n")

  alert.addAction(
    "Terminer"
  )

  await alert.present()
}

async function showFailure(error) {
  const alert =
    new Alert()

  alert.title =
    "Installation impossible"

  alert.message = [
    errorMessage(error),
    "",
    "Vérifiez votre connexion Internet, puis relancez CTS Installer."
  ].join("\n")

  alert.addAction(
    "OK"
  )

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
    typeof error.message ===
      "string" &&
    error.message.trim()
  ) {
    return error.message.trim()
  }

  return String(
    error ||
    "Erreur inconnue."
  )
}
