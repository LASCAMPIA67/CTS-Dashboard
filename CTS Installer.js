// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: arrow.down.circle.fill;

// CTS Installer.js
// Gestionnaire officiel d’installation, mise à jour,
// réparation, informations et désinstallation de CTS Dashboard.

const INSTALLER_VERSION = "2.0.0"

const REPOSITORY = {
  owner: "LASCAMPIA67",
  name: "CTS-Dashboard",
  branch: "main"
}

const DOWNLOAD_TIMEOUT_SECONDS = 30
const INSTALLATION_FILE = "installation.json"

const fm = FileManager.iCloud()
const documentsDirectory = fm.documentsDirectory()

const root = fm.joinPath(
  documentsDirectory,
  "CTS Dashboard"
)

const paths = {
  root,
  data: fm.joinPath(root, "Data"),
  database: fm.joinPath(root, "Database"),
  cache: fm.joinPath(root, "Cache"),
  services: fm.joinPath(root, "Services"),
  libraries: fm.joinPath(root, "Libraries")
}

const installationMetadataPath =
  fm.joinPath(
    paths.data,
    INSTALLATION_FILE
  )

await main()
Script.complete()

// =====================================================
// MENU PRINCIPAL
// =====================================================

async function main() {
  try {
    const manifest =
      await downloadManifest()

    validateManifest(manifest)

    const action =
      await presentMainMenu(manifest)

    switch (action) {
      case 0:
        await installOrUpdate(manifest)
        break

      case 1:
        await repairInstallation(manifest)
        break

      case 2:
        await showInformation(manifest)
        break

      case 3:
        await uninstallDashboard(manifest)
        break

      default:
        return
    }
  } catch (error) {
    await showError(error)
  }
}

async function presentMainMenu(manifest) {
  const metadata =
    await readInstallationMetadata()

  const installedVersion =
    metadata?.dashboardVersion ||
    "Non installé"

  const alert = new Alert()

  alert.title =
    "CTS Dashboard"

  alert.message = [
    `Version disponible : ${manifest.version}`,
    `Version installée : ${installedVersion}`,
    "",
    "Développé par Emilio IPPOLITO",
    "Matricule 6124"
  ].join("\n")

  alert.addAction(
    "Installer ou mettre à jour"
  )

  alert.addAction(
    "Réparer l’installation"
  )

  alert.addAction(
    "Informations"
  )

  alert.addDestructiveAction(
    "Désinstaller CTS Dashboard"
  )

  alert.addCancelAction(
    "Fermer"
  )

  return alert.presentSheet()
}

// =====================================================
// INSTALLATION / MISE À JOUR
// =====================================================

async function installOrUpdate(manifest) {
  const confirmed =
    await confirmAction(
      "Installer ou mettre à jour",
      [
        `CTS Dashboard ${manifest.version} va être installé.`,
        "",
        "Les PDF de service et les archives existantes seront conservés.",
        "",
        "Une connexion Internet est nécessaire."
      ].join("\n"),
      "Continuer"
    )

  if (!confirmed) {
    return
  }

  ensureProjectDirectories()

  const summary = {
    installed: [],
    updated: [],
    preserved: []
  }

  for (const fileName of manifest.scripts) {
    const destinationPath =
      fm.joinPath(
        documentsDirectory,
        fileName
      )

    const status =
      await downloadAndInstall({
        remoteName: fileName,
        destinationPath,
        preserveExisting: false
      })

    addStatus(
      summary,
      status,
      fileName
    )
  }

  for (const resource of manifest.resources) {
    const destinationPath =
      safeProjectPath(
        resource.destination
      )

    ensureParentDirectory(
      destinationPath
    )

    const status =
      await downloadAndInstall({
        remoteName: resource.name,
        destinationPath,
        preserveExisting:
          resource.name.endsWith(".json")
      })

    addStatus(
      summary,
      status,
      resource.name
    )
  }

  await writeInstallationMetadata(
    manifest,
    summary,
    "installation"
  )

  await showOperationSuccess(
    "Installation terminée",
    manifest,
    summary
  )
}

// =====================================================
// RÉPARATION
// =====================================================

async function repairInstallation(manifest) {
  const confirmed =
    await confirmAction(
      "Réparer CTS Dashboard",
      [
        "Tous les scripts et ressources seront vérifiés.",
        "",
        "Les fichiers absents, vides ou invalides seront remplacés.",
        "",
        "Les PDF de service seront conservés."
      ].join("\n"),
      "Réparer"
    )

  if (!confirmed) {
    return
  }

  ensureProjectDirectories()

  const summary = {
    installed: [],
    updated: [],
    preserved: []
  }

  for (const fileName of manifest.scripts) {
    const destinationPath =
      fm.joinPath(
        documentsDirectory,
        fileName
      )

    const valid =
      await isValidFile(
        destinationPath,
        fileName
      )

    if (valid) {
      summary.preserved.push(fileName)
      continue
    }

    const status =
      await downloadAndInstall({
        remoteName: fileName,
        destinationPath,
        preserveExisting: false
      })

    addStatus(
      summary,
      status,
      fileName
    )
  }

  for (const resource of manifest.resources) {
    const destinationPath =
      safeProjectPath(
        resource.destination
      )

    ensureParentDirectory(
      destinationPath
    )

    const valid =
      await isValidFile(
        destinationPath,
        resource.name
      )

    if (valid) {
      summary.preserved.push(
        resource.name
      )

      continue
    }

    const status =
      await downloadAndInstall({
        remoteName: resource.name,
        destinationPath,
        preserveExisting: false
      })

    addStatus(
      summary,
      status,
      resource.name
    )
  }

  await writeInstallationMetadata(
    manifest,
    summary,
    "repair"
  )

  await showOperationSuccess(
    "Réparation terminée",
    manifest,
    summary
  )
}

// =====================================================
// INFORMATIONS
// =====================================================

async function showInformation(manifest) {
  const metadata =
    await readInstallationMetadata()

  const installedScripts =
    await countExistingScripts(
      manifest.scripts
    )

  const installedResources =
    await countExistingResources(
      manifest.resources
    )

  const alert = new Alert()

  alert.title =
    "Informations"

  alert.message = [
    "CTS Dashboard",
    "",
    `Version disponible : ${manifest.version}`,
    `Version installée : ${metadata?.dashboardVersion || "Non installée"}`,
    `Installateur : ${INSTALLER_VERSION}`,
    "",
    `Scripts présents : ${installedScripts}/${manifest.scripts.length}`,
    `Ressources présentes : ${installedResources}/${manifest.resources.length}`,
    "",
    `Dernière opération : ${formatDate(metadata?.updatedAt || metadata?.installedAt)}`,
    "",
    "Auteur : Emilio IPPOLITO",
    "Matricule : 6124",
    "",
    "Dépôt GitHub :",
    `${REPOSITORY.owner}/${REPOSITORY.name}`
  ].join("\n")

  alert.addAction("Fermer")

  await alert.present()
}

// =====================================================
// DÉSINSTALLATION
// =====================================================

async function uninstallDashboard(manifest) {
  const firstConfirmation =
    await confirmAction(
      "Désinstaller CTS Dashboard",
      [
        "Cette action supprimera :",
        "",
        "• tous les scripts CTS Dashboard ;",
        "• les bases de données ;",
        "• les caches ;",
        "• le moteur PDF ;",
        "• les données générées.",
        "",
        "Le dossier Services, les PDF et les archives seront conservés.",
        "",
        "CTS Installer restera disponible."
      ].join("\n"),
      "Continuer",
      true
    )

  if (!firstConfirmation) {
    return
  }

  const finalConfirmation =
    await confirmAction(
      "Confirmation définitive",
      "Voulez-vous vraiment désinstaller CTS Dashboard tout en conservant vos PDF de service ?",
      "Désinstaller",
      true
    )

  if (!finalConfirmation) {
    return
  }

  const deleted = []
  const failed = []

  for (const fileName of manifest.scripts) {
    if (fileName === "CTS Installer.js") {
      continue
    }

    const path =
      fm.joinPath(
        documentsDirectory,
        fileName
      )

    removeTracked(
      path,
      fileName,
      deleted,
      failed
    )
  }

  const protectedNames =
    normalizeProtectedPaths(
      manifest.protectedPaths
    )

  if (fm.fileExists(root)) {
    await ensureDownloaded(root)

    for (const name of fm.listContents(root)) {
      if (protectedNames.has(name)) {
        continue
      }

      const path =
        fm.joinPath(
          root,
          name
        )

      removeTracked(
        path,
        name,
        deleted,
        failed
      )
    }
  }

  const alert = new Alert()

  alert.title =
    failed.length
      ? "Désinstallation partielle"
      : "Désinstallation terminée"

  alert.message = [
    `${deleted.length} élément(s) supprimé(s).`,
    `${failed.length} erreur(s).`,
    "",
    "Le dossier Services et vos PDF ont été conservés.",
    "",
    "CTS Installer reste disponible pour réinstaller le projet."
  ].join("\n")

  alert.addAction("Terminer")

  await alert.present()
}

// =====================================================
// MANIFESTE GITHUB
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
    !Array.isArray(manifest.scripts) ||
    manifest.scripts.length === 0
  ) {
    throw new Error(
      "La liste des scripts est absente."
    )
  }

  if (
    !Array.isArray(manifest.resources)
  ) {
    throw new Error(
      "La liste des ressources est absente."
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
        "CTS Installer est trop ancien.",
        "",
        `Version actuelle : ${INSTALLER_VERSION}`,
        `Version minimale : ${minimumInstaller}`,
        "",
        "Téléchargez la nouvelle version de CTS Installer depuis GitHub."
      ].join("\n")
    )
  }

  for (const fileName of manifest.scripts) {
    if (
      typeof fileName !== "string" ||
      !fileName.endsWith(".js")
    ) {
      throw new Error(
        "Un nom de script déclaré dans version.json est invalide."
      )
    }
  }

  for (const resource of manifest.resources) {
    if (
      !resource ||
      typeof resource.name !== "string" ||
      typeof resource.destination !== "string"
    ) {
      throw new Error(
        "Une ressource déclarée dans version.json est invalide."
      )
    }
  }
}

// =====================================================
// TÉLÉCHARGEMENT ET ÉCRITURE
// =====================================================

async function downloadAndInstall({
  remoteName,
  destinationPath,
  preserveExisting
}) {
  if (
    preserveExisting &&
    await isValidFile(
      destinationPath,
      remoteName
    )
  ) {
    return "preserved"
  }

  const data =
    await downloadData(
      rawUrl(remoteName),
      remoteName
    )

  const existed =
    fm.fileExists(destinationPath)

  writeDataSafely(
    destinationPath,
    data
  )

  if (
    !await isValidFile(
      destinationPath,
      remoteName
    )
  ) {
    throw new Error(
      `${remoteName} a été téléchargé, mais le fichier obtenu est invalide.`
    )
  }

  return existed
    ? "updated"
    : "installed"
}

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

    if (
      !data ||
      Number(data.length) <= 0
    ) {
      throw new Error(
        "Réponse vide."
      )
    }

    return data
  } catch (error) {
    throw new Error(
      `${label} impossible à télécharger : ${errorMessage(error)}`
    )
  }
}

function writeDataSafely(
  destinationPath,
  data
) {
  ensureParentDirectory(
    destinationPath
  )

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

// =====================================================
// VALIDATION DES FICHIERS
// =====================================================

async function isValidFile(
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

    if (fileName.endsWith(".js")) {
      const content =
        fm.readString(path)

      return (
        typeof content === "string" &&
        content.trim().length > 20
      )
    }

    return true
  } catch (error) {
    return false
  }
}

// =====================================================
// DOSSIERS ET CHEMINS
// =====================================================

function ensureProjectDirectories() {
  const directories = [
    paths.root,
    paths.data,
    paths.database,
    paths.cache,
    paths.services,
    fm.joinPath(
      paths.services,
      "Archive"
    ),
    fm.joinPath(
      paths.services,
      "Rejected"
    ),
    fm.joinPath(
      paths.cache,
      "Services"
    ),
    fm.joinPath(
      fm.joinPath(
        paths.cache,
        "Services"
      ),
      "Text"
    ),
    paths.libraries,
    fm.joinPath(
      paths.libraries,
      "PDF"
    )
  ]

  for (const directory of directories) {
    if (!fm.fileExists(directory)) {
      fm.createDirectory(
        directory,
        true
      )
    }
  }
}

function safeProjectPath(relativePath) {
  const normalized =
    String(relativePath || "")
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .split("/")
      .filter(
        part =>
          part &&
          part !== "." &&
          part !== ".."
      )

  if (!normalized.length) {
    throw new Error(
      "Un chemin de ressource est invalide."
    )
  }

  let path = root

  for (const part of normalized) {
    path =
      fm.joinPath(
        path,
        part
      )
  }

  return path
}

function ensureParentDirectory(path) {
  const lastSlash =
    path.lastIndexOf("/")

  if (lastSlash <= 0) {
    return
  }

  const parent =
    path.substring(
      0,
      lastSlash
    )

  if (!fm.fileExists(parent)) {
    fm.createDirectory(
      parent,
      true
    )
  }
}

// =====================================================
// MÉTADONNÉES
// =====================================================

async function writeInstallationMetadata(
  manifest,
  summary,
  operation
) {
  ensureProjectDirectories()

  const now =
    new Date().toISOString()

  const previous =
    await readInstallationMetadata()

  const metadata = {
    installerVersion:
      INSTALLER_VERSION,

    dashboardVersion:
      manifest.version,

    installedAt:
      previous?.installedAt ||
      now,

    updatedAt:
      now,

    lastOperation:
      operation,

    repository:
      REPOSITORY,

    installed:
      summary.installed,

    updated:
      summary.updated,

    preserved:
      summary.preserved
  }

  fm.writeString(
    installationMetadataPath,
    JSON.stringify(
      metadata,
      null,
      2
    )
  )
}

async function readInstallationMetadata() {
  if (
    !fm.fileExists(
      installationMetadataPath
    )
  ) {
    return null
  }

  try {
    await ensureDownloaded(
      installationMetadataPath
    )

    const parsed =
      JSON.parse(
        fm.readString(
          installationMetadataPath
        )
      )

    return (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    )
      ? parsed
      : null
  } catch (error) {
    return null
  }
}

// =====================================================
// INTERFACE
// =====================================================

async function confirmAction(
  title,
  message,
  actionTitle,
  destructive = false
) {
  const alert = new Alert()

  alert.title = title
  alert.message = message

  if (destructive) {
    alert.addDestructiveAction(
      actionTitle
    )
  } else {
    alert.addAction(
      actionTitle
    )
  }

  alert.addCancelAction(
    "Annuler"
  )

  return (
    await alert.present()
  ) === 0
}

async function showOperationSuccess(
  title,
  manifest,
  summary
) {
  const alert = new Alert()

  alert.title = title

  alert.message = [
    `CTS Dashboard ${manifest.version}`,
    "",
    `${summary.installed.length} fichier(s) installé(s)`,
    `${summary.updated.length} fichier(s) mis à jour`,
    `${summary.preserved.length} fichier(s) conservé(s)`,
    "",
    "Vos PDF de service ont été conservés.",
    "",
    "Vous pouvez maintenant lancer CTS Dashboard."
  ].join("\n")

  alert.addAction(
    "Terminer"
  )

  await alert.present()
}

async function showError(error) {
  const alert = new Alert()

  alert.title =
    "Opération impossible"

  alert.message = [
    errorMessage(error),
    "",
    "Vérifiez votre connexion Internet puis relancez CTS Installer."
  ].join("\n")

  alert.addAction("OK")

  await alert.present()
}

// =====================================================
// COMPTEURS ET OUTILS
// =====================================================

async function countExistingScripts(
  scripts
) {
  let count = 0

  for (const fileName of scripts) {
    const path =
      fm.joinPath(
        documentsDirectory,
        fileName
      )

    if (
      await isValidFile(
        path,
        fileName
      )
    ) {
      count++
    }
  }

  return count
}

async function countExistingResources(
  resources
) {
  let count = 0

  for (const resource of resources) {
    const path =
      safeProjectPath(
        resource.destination
      )

    if (
      await isValidFile(
        path,
        resource.name
      )
    ) {
      count++
    }
  }

  return count
}

function addStatus(
  summary,
  status,
  fileName
) {
  if (status === "installed") {
    summary.installed.push(fileName)
  } else if (status === "updated") {
    summary.updated.push(fileName)
  } else {
    summary.preserved.push(fileName)
  }
}

function normalizeProtectedPaths(
  values
) {
  const result =
    new Set()

  for (
    const value
    of Array.isArray(values)
      ? values
      : []
  ) {
    const name =
      String(value || "")
        .replace(/\\/g, "/")
        .split("/")
        .filter(Boolean)[0]

    if (name) {
      result.add(name)
    }
  }

  result.add("Services")

  return result
}

function removeTracked(
  path,
  label,
  deleted,
  failed
) {
  if (!fm.fileExists(path)) {
    return
  }

  try {
    fm.remove(path)
    deleted.push(label)
  } catch (error) {
    failed.push(label)
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

function formatDate(value) {
  if (!value) {
    return "Jamais"
  }

  const date =
    new Date(value)

  if (
    !Number.isFinite(
      date.getTime()
    )
  ) {
    return "Inconnue"
  }

  return date.toLocaleString(
    "fr-FR"
  )
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
