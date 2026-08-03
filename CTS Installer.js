// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: arrow.down.circle.fill;

const INSTALLER_VERSION = "3.0.0"
const REPOSITORY = {
  owner: "LASCAMPIA67",
  name: "CTS-Dashboard",
  branch: "main"
}

const INSTALLER_FILE = "CTS Installer.js"
const METADATA_FILE = "installation.json"
const TIMEOUT_SECONDS = 60
const RETRY_COUNT = 2
const MIN_SCRIPT_LENGTH = 80

const fm = FileManager.iCloud()
const documents = fm.documentsDirectory()
const join = (a, b) => fm.joinPath(a, b)
const root = join(documents, "CTS Dashboard")

const paths = {
  root,
  data: join(root, "Data"),
  database: join(root, "Database"),
  cache: join(root, "Cache"),
  services: join(root, "Services"),
  archive: join(root, "Services/Archive"),
  rejected: join(root, "Services/Rejected"),
  serviceCache: join(root, "Cache/Services"),
  textCache: join(root, "Cache/Services/Text"),
  libraries: join(root, "Libraries"),
  pdf: join(root, "Libraries/PDF"),
  metadata: join(root, `Data/${METADATA_FILE}`)
}

await main()
Script.complete()

async function main() {
  try {
    const manifest = await loadManifest()
    validateManifest(manifest)

    if (!await handleInstallerUpdate(manifest)) return

    const state = await inspectInstallation(manifest)
    const action = await presentMenu(manifest, state)

    if (action === "install" || action === "update") {
      await installOrUpdate(manifest, state)
    } else if (action === "uninstall") {
      await uninstallProject(manifest)
    }
  } catch (error) {
    await showError(error)
  }
}

async function presentMenu(manifest, state) {
  const alert = new Alert()
  alert.title = "CTS Dashboard"

  if (!state.present) {
    alert.message = [
      "CTS Dashboard n’est pas installé sur cet iPhone.",
      "",
      `Version disponible : ${manifest.version}`,
      `Installateur : ${INSTALLER_VERSION}`,
      "",
      "Tous les fichiers et dossiers nécessaires seront installés automatiquement.",
      "",
      "Développé par Emilio IPPOLITO",
      "Matricule 6124"
    ].join("\n")

    alert.addAction(`Installer la version ${manifest.version}`)
    alert.addCancelAction("Fermer")

    return await alert.presentSheet() === 0
      ? "install"
      : null
  }

  const installedVersion =
    state.installedVersion || "Non identifiée"

  const versionUpdate =
    Boolean(state.installedVersion) &&
    compareVersions(
      manifest.version,
      state.installedVersion
    ) > 0

  const issueNames = [
    ...state.missing,
    ...state.invalid
  ]

  alert.message = [
    versionUpdate
      ? `Mise à jour disponible : ${installedVersion} → ${manifest.version}`
      : `Version installée : ${installedVersion}`,
    "",
    state.complete
      ? `${state.validCount}/${state.totalCount} fichiers valides`
      : `Installation à réparer : ${state.validCount}/${state.totalCount} fichiers valides`,
    issueNames.length
      ? `\nFichiers concernés : ${issueNames.join(", ")}`
      : "",
    "",
    versionUpdate
      ? "Une nouvelle version est disponible sur GitHub."
      : state.complete
        ? "CTS Dashboard est entièrement à jour."
        : "Les fichiers absents ou invalides seront réparés.",
    "",
    "Vos services PDF et leurs archives seront conservés."
  ].join("\n")

  alert.addAction(
    versionUpdate
      ? `Mettre à jour vers ${manifest.version}`
      : state.complete
        ? "Vérifier les fichiers"
        : "Réparer l’installation"
  )

  alert.addDestructiveAction("Désinstaller")
  alert.addCancelAction("Fermer")

  const selection = await alert.presentSheet()

  if (selection === 0) return "update"
  if (selection === 1) return "uninstall"

  return null
}

async function inspectInstallation(manifest) {
  const metadata = await readMetadata()
  const entries = manifestEntries(manifest)

  let existingCount = 0
  let validCount = 0

  const invalid = []
  const missing = []
  const reasons = {}

  for (const entry of entries) {
    if (!fm.fileExists(entry.destination)) {
      missing.push(entry.name)
      reasons[entry.name] = "Fichier absent"
      continue
    }

    existingCount++

    const result = await validateLocalFile(
      entry.destination,
      entry.name
    )

    if (result.valid) {
      validCount++
    } else {
      invalid.push(entry.name)
      reasons[entry.name] = result.reason
    }
  }

  const totalCount = entries.length

  const present = Boolean(
    metadata ||
    existingCount ||
    fm.fileExists(root)
  )

  const complete =
    present &&
    validCount === totalCount

  const installedVersion =
    typeof metadata?.dashboardVersion === "string"
      ? metadata.dashboardVersion
      : complete
        ? manifest.version
        : null

  return {
    present,
    complete,
    existingCount,
    validCount,
    totalCount,
    installedVersion,
    invalid,
    missing,
    reasons
  }
}

async function installOrUpdate(manifest, previousState) {
  const freshInstall = !previousState.present
  const versionUpdate =
    Boolean(previousState.installedVersion) &&
    compareVersions(
      manifest.version,
      previousState.installedVersion
    ) > 0

  const title = freshInstall
    ? "Installer CTS Dashboard"
    : versionUpdate
      ? "Mettre à jour CTS Dashboard"
      : previousState.complete
        ? "Vérifier CTS Dashboard"
        : "Réparer CTS Dashboard"

  const message = freshInstall
    ? [
        `CTS Dashboard ${manifest.version} va être installé.`,
        "",
        "Tous les scripts, ressources et dossiers seront créés automatiquement.",
        "",
        "Une connexion Internet est nécessaire."
      ].join("\n")
    : [
        `CTS Dashboard ${manifest.version} va être contrôlé.`,
        "",
        "Chaque fichier sera comparé avec la version officielle publiée sur GitHub.",
        "",
        "Les fichiers différents, absents ou invalides seront remplacés.",
        "",
        "Vos services PDF et leurs archives seront conservés."
      ].join("\n")

  if (!await confirm(title, message, "Continuer")) return

  const entries = manifestEntries(manifest)

  const progress = createProgressTable(
    freshInstall
      ? "Installation de CTS Dashboard"
      : versionUpdate
        ? "Mise à jour de CTS Dashboard"
        : previousState.complete
          ? "Vérification de CTS Dashboard"
          : "Réparation de CTS Dashboard",
    manifest.version,
    entries
  )

  progress.present()

  const summary = {
    installed: [],
    updated: [],
    unchanged: [],
    repaired: [],
    failed: []
  }

  const failures = []

  try {
    await progress.setSystem(
      "github",
      "running",
      "Connexion en cours…"
    )

    await verifyRepository()

    await progress.setSystem(
      "github",
      "success",
      "Connexion établie"
    )

    await progress.setSystem(
      "directories",
      "running",
      "Préparation de l’arborescence…"
    )

    ensureDirectories()

    await progress.setSystem(
      "directories",
      "success",
      "Arborescence prête"
    )

    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index]

      await progress.setEntry(
        index,
        "running",
        `Contrôle de ${entry.name}`
      )

      try {
        const status = await synchronizeFile(entry)

        summary[status].push(entry.name)

        await progress.setEntry(
          index,
          status === "unchanged"
            ? "unchanged"
            : "success",
          statusLabel(status)
        )
      } catch (error) {
        failures.push({
          index,
          entry,
          reason: errorMessage(error)
        })

        await progress.setEntry(
          index,
          "retry",
          "Nouvelle tentative programmée"
        )
      }

      await progress.advance(
        index + 1,
        entries.length
      )
    }

    if (failures.length) {
      await progress.setSystem(
        "retry",
        "running",
        `Nouvelle tentative sur ${failures.length} fichier(s)…`
      )

      for (const failure of failures) {
        await progress.setEntry(
          failure.index,
          "running",
          `Nouvelle tentative : ${failure.entry.name}`
        )

        try {
          const status = await synchronizeFile(
            failure.entry,
            true
          )

          summary[status].push(
            failure.entry.name
          )

          await progress.setEntry(
            failure.index,
            "success",
            status === "unchanged"
              ? "Validé"
              : statusLabel(status)
          )

          failure.resolved = true
        } catch (error) {
          failure.reason = errorMessage(error)

          summary.failed.push(
            failure.entry.name
          )

          await progress.setEntry(
            failure.index,
            "error",
            failure.reason
          )
        }
      }

      const unresolved =
        failures.filter(item => !item.resolved)

      await progress.setSystem(
        "retry",
        unresolved.length
          ? "error"
          : "success",
        unresolved.length
          ? `${unresolved.length} fichier(s) encore en erreur`
          : "Toutes les erreurs ont été corrigées"
      )
    } else {
      await progress.setSystem(
        "retry",
        "success",
        "Aucune nouvelle tentative nécessaire"
      )
    }

    await progress.setSystem(
      "verification",
      "running",
      "Contrôle final de l’installation…"
    )

    const verification =
      await inspectInstallation(manifest)

    if (!verification.complete) {
      const issues = [
        ...verification.missing.map(
          name => `${name} — absent`
        ),
        ...verification.invalid.map(
          name =>
            `${name} — ${verification.reasons[name] || "invalide"}`
        )
      ]

      await progress.setSystem(
        "verification",
        "error",
        `${verification.validCount}/${verification.totalCount} fichiers valides`
      )

      await progress.finish({
        success: false,
        title: "Installation non validée",
        message: [
          `${verification.validCount}/${verification.totalCount} fichiers sont valides.`,
          "",
          issues.length
            ? `Fichiers concernés :\n${issues.join("\n")}`
            : "Une erreur inconnue empêche la validation."
        ].join("\n"),
        summary
      })

      return
    }

    await writeMetadata(
      manifest,
      summary
    )

    await progress.setSystem(
      "verification",
      "success",
      `${verification.validCount}/${verification.totalCount} fichiers valides`
    )

    await progress.finish({
      success: true,
      title: freshInstall
        ? "Installation terminée"
        : versionUpdate
          ? "Mise à jour terminée"
          : previousState.complete
            ? "Vérification terminée"
            : "Réparation terminée",
      message: [
        `CTS Dashboard ${manifest.version} est prêt.`,
        "",
        "Tous les fichiers ont été contrôlés avec succès.",
        "",
        "Vous pouvez maintenant lancer CTS Dashboard."
      ].join("\n"),
      summary
    })
  } catch (error) {
    await progress.setSystem(
      "verification",
      "error",
      "Opération interrompue"
    )

    await progress.finish({
      success: false,
      title: "Opération interrompue",
      message: errorMessage(error),
      summary
    })
  }
}

async function synchronizeFile(entry, force = false) {
  let remoteContent
  let lastError

  for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
    try {
      remoteContent = await downloadText(
        `${rawUrl(entry.name)}?t=${Date.now()}-${attempt}`,
        entry.name
      )

      const remoteValidation =
        validateTextContent(
          remoteContent,
          entry.name
        )

      if (!remoteValidation.valid) {
        throw new Error(
          `Version GitHub invalide : ${remoteValidation.reason}`
        )
      }

      break
    } catch (error) {
      lastError = error

      if (attempt < RETRY_COUNT) {
        await sleep(400)
      }
    }
  }

  if (remoteContent === undefined) {
    throw lastError ||
      new Error(`${entry.name} impossible à télécharger.`)
  }

  const existed = fm.fileExists(entry.destination)
  let localWasValid = false

  if (existed) {
    const localValidation =
      await validateLocalFile(
        entry.destination,
        entry.name
      )

    localWasValid =
      localValidation.valid

    if (
      !force &&
      localWasValid &&
      await textMatchesFile(
        entry.destination,
        remoteContent
      )
    ) {
      return "unchanged"
    }
  }

  await writeTextSafely(
    entry.destination,
    remoteContent
  )

  const verification =
    await validateLocalFile(
      entry.destination,
      entry.name
    )

  if (!verification.valid) {
    throw new Error(
      `${entry.name} invalide après écriture : ${verification.reason}`
    )
  }

  if (!existed) return "installed"
  if (!localWasValid) return "repaired"

  return "updated"
}

function validateTextContent(content, name) {
  if (
    typeof content !== "string" ||
    !content.trim()
  ) {
    return {
      valid: false,
      reason: "contenu vide"
    }
  }

  const trimmed = content.trim()
  const beginning =
    trimmed.slice(0, 160).toLowerCase()

  if (
    trimmed === "404: Not Found" ||
    beginning.startsWith("<!doctype html") ||
    beginning.startsWith("<html")
  ) {
    return {
      valid: false,
      reason: "GitHub a renvoyé une page d’erreur"
    }
  }

  if (name.endsWith(".json")) {
    try {
      const value = JSON.parse(content)

      if (
        value === null ||
        typeof value !== "object"
      ) {
        return {
          valid: false,
          reason: "racine JSON invalide"
        }
      }
    } catch (error) {
      return {
        valid: false,
        reason: `JSON invalide : ${errorMessage(error)}`
      }
    }
  }

  if (
    name.endsWith(".js") &&
    !name.endsWith(".mjs") &&
    trimmed.length < MIN_SCRIPT_LENGTH
  ) {
    return {
      valid: false,
      reason: "script anormalement court"
    }
  }

  if (
    name.endsWith(".mjs") &&
    trimmed.length < MIN_SCRIPT_LENGTH
  ) {
    return {
      valid: false,
      reason: "bibliothèque anormalement courte"
    }
  }

  return {
    valid: true,
    reason: ""
  }
}

async function validateLocalFile(path, name) {
  if (!fm.fileExists(path)) {
    return {
      valid: false,
      reason: "fichier absent"
    }
  }

  try {
    await ensureDownloaded(path)

    const content = fm.readString(path)
    return validateTextContent(content, name)
  } catch (error) {
    return {
      valid: false,
      reason: errorMessage(error)
    }
  }
}

async function textMatchesFile(path, remoteContent) {
  try {
    await ensureDownloaded(path)

    const localContent =
      fm.readString(path)

    return normalizeText(localContent) ===
      normalizeText(remoteContent)
  } catch (_) {
    return false
  }
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
}

async function writeTextSafely(destination, content) {
  ensureParent(destination)

  const temporary =
    `${destination}.download`

  removeQuietly(temporary)

  try {
    fm.writeString(
      temporary,
      content
    )

    if (!fm.fileExists(temporary)) {
      throw new Error(
        "Le fichier temporaire n’a pas été créé."
      )
    }

    await sleep(80)

    removeQuietly(destination)

    fm.move(
      temporary,
      destination
    )

    await sleep(100)

    if (!fm.fileExists(destination)) {
      throw new Error(
        "Le fichier final n’a pas été créé."
      )
    }

    await ensureDownloaded(destination)
  } catch (error) {
    removeQuietly(temporary)
    throw error
  }
}

async function uninstallProject(manifest) {
  if (!await confirm(
    "Désinstaller CTS Dashboard",
    [
      "Cette opération supprimera :",
      "",
      "• les scripts CTS Dashboard ;",
      "• les bases de données ;",
      "• les caches ;",
      "• le moteur PDF ;",
      "• les données techniques.",
      "",
      "Le dossier Services, ses PDF et ses archives seront conservés.",
      "",
      "CTS Installer restera disponible."
    ].join("\n"),
    "Continuer",
    true
  )) return

  if (!await confirm(
    "Confirmation définitive",
    "Confirmez-vous la désinstallation de CTS Dashboard ?",
    "Désinstaller",
    true
  )) return

  const entries = [
    ...manifest.scripts
      .filter(name => name !== INSTALLER_FILE)
      .map(name => ({
        name,
        destination: join(documents, name),
        type: "Script"
      })),
    ...fm.fileExists(root)
      ? fm.listContents(root)
          .filter(name => name !== "Services")
          .map(name => ({
            name,
            destination: join(root, name),
            type: "Dossier"
          }))
      : []
  ]

  const progress = createProgressTable(
    "Désinstallation de CTS Dashboard",
    manifest.version,
    entries,
    true
  )

  progress.present()

  const summary = {
    installed: [],
    updated: [],
    unchanged: [],
    repaired: [],
    failed: []
  }

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]

    await progress.setEntry(
      index,
      "running",
      `Suppression de ${entry.name}`
    )

    try {
      if (fm.fileExists(entry.destination)) {
        fm.remove(entry.destination)
      }

      summary.unchanged.push(entry.name)

      await progress.setEntry(
        index,
        "success",
        "Supprimé"
      )
    } catch (error) {
      summary.failed.push(entry.name)

      await progress.setEntry(
        index,
        "error",
        errorMessage(error)
      )
    }

    await progress.advance(
      index + 1,
      entries.length
    )
  }

  await progress.finish({
    success: summary.failed.length === 0,
    title: summary.failed.length
      ? "Désinstallation partielle"
      : "Désinstallation terminée",
    message: [
      `${summary.unchanged.length} élément(s) supprimé(s).`,
      `${summary.failed.length} erreur(s).`,
      "",
      "Le dossier Services et ses PDF ont été conservés."
    ].join("\n"),
    summary
  })
}

function createProgressTable(
  title,
  version,
  entries,
  uninstall = false
) {
  const table = new UITable()
  table.showSeparators = true

  const state = {
    completed: 0,
    total: entries.length,
    current: "Initialisation…",
    uninstall,
    systems: {
      github: {
        title: "Connexion à GitHub",
        status: uninstall
          ? "hidden"
          : "pending",
        detail: "En attente"
      },
      directories: {
        title: "Création des dossiers",
        status: uninstall
          ? "hidden"
          : "pending",
        detail: "En attente"
      },
      retry: {
        title: "Contrôle des erreurs",
        status: uninstall
          ? "hidden"
          : "pending",
        detail: "En attente"
      },
      verification: {
        title: "Vérification finale",
        status: uninstall
          ? "hidden"
          : "pending",
        detail: "En attente"
      }
    },
    entries: entries.map(entry => ({
      ...entry,
      status: "pending",
      detail: `${entry.type} — En attente`
    })),
    result: null
  }

  const render = async () => {
    table.removeAllRows()

    const header = new UITableRow()
    header.height = 78
    header.isHeader = true

    const headerText = header.addText(
      title,
      `Version ${version} · Installer ${INSTALLER_VERSION}`
    )

    headerText.titleFont =
      Font.boldSystemFont(20)

    headerText.subtitleFont =
      Font.systemFont(12)

    table.addRow(header)

    const percentage = state.total
      ? Math.round(
          state.completed /
          state.total *
          100
        )
      : 100

    const progressRow = new UITableRow()
    progressRow.height = 62

    const progressText = progressRow.addText(
      `Progression : ${percentage} %`,
      `${state.completed}/${state.total} · ${state.current}`
    )

    progressText.titleFont =
      Font.semiboldSystemFont(16)

    progressText.subtitleFont =
      Font.systemFont(12)

    table.addRow(progressRow)

    const visibleSystems =
      Object.values(state.systems)
        .filter(item =>
          item.status !== "hidden"
        )

    if (visibleSystems.length) {
      addSection(
        table,
        "ÉTAPES SYSTÈME"
      )

      for (const item of visibleSystems) {
        addStatusRow(
          table,
          item.title,
          item.detail,
          item.status
        )
      }
    }

    addSection(
      table,
      uninstall
        ? "ÉLÉMENTS À SUPPRIMER"
        : "FICHIERS DU PROJET"
    )

    for (const entry of state.entries) {
      addStatusRow(
        table,
        entry.name,
        entry.detail,
        entry.status
      )
    }

    if (state.result) {
      addSection(
        table,
        state.result.success
          ? "OPÉRATION TERMINÉE"
          : "ERREUR"
      )

      const lines =
        state.result.message
          .split("\n").length

      const resultRow =
        new UITableRow()

      resultRow.height =
        Math.max(
          95,
          64 + lines * 17
        )

      const resultText =
        resultRow.addText(
          state.result.title,
          state.result.message
        )

      resultText.titleFont =
        Font.boldSystemFont(18)

      resultText.subtitleFont =
        Font.systemFont(12)

      table.addRow(resultRow)

      const summary =
        state.result.summary

      const summaryRow =
        new UITableRow()

      summaryRow.height = 82

      const summaryText =
        summaryRow.addText(
          uninstall
            ? [
                `Supprimés : ${summary.unchanged.length}`,
                `Erreurs : ${summary.failed.length}`
              ].join("   ")
            : [
                `Installés : ${summary.installed.length}`,
                `Mis à jour : ${summary.updated.length}`,
                `Réparés : ${summary.repaired.length}`,
                `Déjà à jour : ${summary.unchanged.length}`,
                `Erreurs : ${summary.failed.length}`
              ].join("   "),
          "Les services PDF et leurs archives ont été conservés."
        )

      summaryText.titleFont =
        Font.semiboldSystemFont(12)

      summaryText.subtitleFont =
        Font.systemFont(11)

      table.addRow(summaryRow)
    }

    table.reload()
    await sleep(30)
  }

  return {
    present() {
      table.present(true)
    },

    async setSystem(
      key,
      status,
      detail
    ) {
      if (!state.systems[key]) return

      state.systems[key].status = status
      state.systems[key].detail = detail
      state.current = detail

      await render()
    },

    async setEntry(
      index,
      status,
      detail
    ) {
      if (!state.entries[index]) return

      state.entries[index].status =
        status

      state.entries[index].detail =
        detail

      state.current = detail

      await render()
    },

    async advance(
      completed,
      total
    ) {
      state.completed = completed
      state.total = total

      await render()
    },

    async finish(result) {
      state.result = result
      state.current = result.success
        ? "Opération terminée"
        : "Une erreur est survenue"

      if (result.success) {
        state.completed = state.total
      }

      await render()
    }
  }
}

function addSection(table, title) {
  const row = new UITableRow()
  row.height = 32
  row.isHeader = true

  const text = row.addText(title)
  text.titleFont =
    Font.boldSystemFont(11)

  table.addRow(row)
}

function addStatusRow(
  table,
  title,
  detail,
  status
) {
  const row = new UITableRow()
  row.height = detail.length > 65
    ? 70
    : 56

  const symbolName =
    status === "running"
      ? "arrow.triangle.2.circlepath"
      : status === "success"
        ? "checkmark.circle.fill"
        : status === "unchanged"
          ? "equal.circle.fill"
          : status === "retry"
            ? "arrow.clockwise.circle.fill"
            : status === "error"
              ? "exclamationmark.triangle.fill"
              : "circle"

  const icon =
    SFSymbol.named(symbolName)

  icon.applyFont(
    Font.systemFont(17)
  )

  const image =
    row.addImage(icon.image)

  image.widthWeight = 12

  const text =
    row.addText(title, detail)

  text.widthWeight = 88
  text.titleFont =
    Font.semiboldSystemFont(14)

  text.subtitleFont =
    Font.systemFont(11)

  table.addRow(row)
}

function manifestEntries(manifest) {
  return [
    ...manifest.scripts.map(name => ({
      name,
      type: "Script",
      destination: join(
        documents,
        name
      )
    })),
    ...manifest.resources.map(
      resource => ({
        name: resource.name,
        type: "Ressource",
        destination: projectPath(
          resource.destination
        )
      })
    )
  ]
}

function statusLabel(status) {
  if (status === "installed") {
    return "Installé"
  }

  if (status === "updated") {
    return "Mis à jour"
  }

  if (status === "repaired") {
    return "Réparé"
  }

  return "Déjà à jour"
}

async function verifyRepository() {
  const content = await downloadText(
    `${rawUrl("version.json")}?ping=${Date.now()}`,
    "GitHub"
  )

  const validation =
    validateTextContent(
      content,
      "version.json"
    )

  if (!validation.valid) {
    throw new Error(
      `Connexion GitHub invalide : ${validation.reason}`
    )
  }
}

async function handleInstallerUpdate(manifest) {
  const availableVersion = String(
    manifest.installerVersion ||
    INSTALLER_VERSION
  )

  const minimumVersion = String(
    manifest.minimumInstaller ||
    "0.0.0"
  )

  const updateAvailable =
    compareVersions(
      availableVersion,
      INSTALLER_VERSION
    ) > 0

  const updateRequired =
    compareVersions(
      minimumVersion,
      INSTALLER_VERSION
    ) > 0

  if (!updateAvailable && !updateRequired) {
    return true
  }

  const alert = new Alert()

  alert.title = updateRequired
    ? "Mise à jour obligatoire"
    : "Nouvel installateur disponible"

  alert.message = [
    `Version actuelle : ${INSTALLER_VERSION}`,
    `Version disponible : ${availableVersion}`,
    "",
    updateRequired
      ? "Cette mise à jour est nécessaire pour continuer."
      : "Une nouvelle version de CTS Installer est disponible.",
    "",
    "Après la mise à jour, relancez CTS Installer."
  ].join("\n")

  alert.addAction(
    `Installer la version ${availableVersion}`
  )

  if (!updateRequired) {
    alert.addAction(
      "Continuer avec cette version"
    )
  }

  alert.addCancelAction("Annuler")

  const choice =
    await alert.presentSheet()

  if (choice === 0) {
    await updateInstaller(
      availableVersion
    )

    return false
  }

  return (
    !updateRequired &&
    choice === 1
  )
}

async function updateInstaller(version) {
  const content = await downloadText(
    `${rawUrl(INSTALLER_FILE)}?t=${Date.now()}`,
    INSTALLER_FILE
  )

  if (
    !content.includes(
      `INSTALLER_VERSION = "${version}"`
    )
  ) {
    throw new Error(
      "La version publiée de CTS Installer ne correspond pas au manifeste GitHub."
    )
  }

  const currentPath = join(
    documents,
    `${Script.name()}.js`
  )

  const destination =
    fm.fileExists(currentPath)
      ? currentPath
      : join(
          documents,
          INSTALLER_FILE
        )

  await writeTextSafely(
    destination,
    content
  )

  const alert = new Alert()

  alert.title =
    "CTS Installer mis à jour"

  alert.message = [
    `La version ${version} a été installée.`,
    "",
    "Relancez CTS Installer pour continuer."
  ].join("\n")

  alert.addAction("Terminer")
  await alert.present()
}

async function loadManifest() {
  const content = await downloadText(
    `${rawUrl("version.json")}?t=${Date.now()}`,
    "version.json"
  )

  try {
    return JSON.parse(content)
  } catch (_) {
    throw new Error(
      "Le fichier version.json publié sur GitHub est invalide."
    )
  }
}

function validateManifest(manifest) {
  if (
    !isRecord(manifest) ||
    typeof manifest.version !== "string" ||
    !Array.isArray(manifest.scripts) ||
    !manifest.scripts.length ||
    !Array.isArray(manifest.resources)
  ) {
    throw new Error(
      "Le manifeste GitHub de CTS Dashboard est invalide."
    )
  }

  const names = new Set()

  for (const name of manifest.scripts) {
    if (
      typeof name !== "string" ||
      !name.endsWith(".js") ||
      names.has(name)
    ) {
      throw new Error(
        "Un script déclaré dans version.json est invalide."
      )
    }

    names.add(name)
  }

  for (const resource of manifest.resources) {
    if (
      !isRecord(resource) ||
      typeof resource.name !== "string" ||
      typeof resource.destination !== "string"
    ) {
      throw new Error(
        "Une ressource déclarée dans version.json est invalide."
      )
    }

    projectPath(
      resource.destination
    )
  }
}

async function readMetadata() {
  if (!fm.fileExists(paths.metadata)) {
    return null
  }

  try {
    await ensureDownloaded(
      paths.metadata
    )

    const value = JSON.parse(
      fm.readString(
        paths.metadata
      )
    )

    return isRecord(value)
      ? value
      : null
  } catch (_) {
    return null
  }
}

async function writeMetadata(
  manifest,
  summary
) {
  ensureDirectories()

  const previous =
    await readMetadata()

  const now =
    new Date().toISOString()

  const metadata = {
    dashboardVersion:
      manifest.version,

    installerVersion:
      INSTALLER_VERSION,

    installedAt:
      previous?.installedAt ||
      now,

    updatedAt:
      now,

    repository:
      REPOSITORY,

    files: {
      installed:
        summary.installed,

      updated:
        summary.updated,

      repaired:
        summary.repaired,

      unchanged:
        summary.unchanged
    }
  }

  await writeTextSafely(
    paths.metadata,
    JSON.stringify(
      metadata,
      null,
      2
    )
  )
}

function ensureDirectories() {
  const directories = [
    paths.root,
    paths.data,
    paths.database,
    paths.cache,
    paths.services,
    paths.archive,
    paths.rejected,
    paths.serviceCache,
    paths.textCache,
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

function projectPath(relativePath) {
  const parts =
    String(relativePath || "")
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .split("/")
      .filter(Boolean)

  if (
    !parts.length ||
    parts.includes("..") ||
    parts.includes(".")
  ) {
    throw new Error(
      "Un chemin déclaré dans version.json est invalide."
    )
  }

  let result = root

  for (const part of parts) {
    result = join(result, part)
  }

  return result
}

function ensureParent(path) {
  const index =
    path.lastIndexOf("/")

  if (index <= 0) return

  const parent =
    path.slice(0, index)

  if (!fm.fileExists(parent)) {
    fm.createDirectory(
      parent,
      true
    )
  }
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

    validateResponse(
      request,
      label
    )

    if (
      typeof content !== "string" ||
      !content.trim()
    ) {
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

function createRequest(url) {
  const request =
    new Request(url)

  request.timeoutInterval =
    TIMEOUT_SECONDS

  request.headers = {
    "Cache-Control": "no-cache",
    Pragma: "no-cache"
  }

  return request
}

function validateResponse(
  request,
  label
) {
  const status = Number(
    request.response?.statusCode
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

function rawUrl(name) {
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
    encodePath(name)
  ].join("/")
}

function encodePath(path) {
  return String(path)
    .split("/")
    .map(encodeURIComponent)
    .join("/")
}

async function confirm(
  title,
  message,
  action,
  destructive = false
) {
  const alert = new Alert()

  alert.title = title
  alert.message = message

  if (destructive) {
    alert.addDestructiveAction(action)
  } else {
    alert.addAction(action)
  }

  alert.addCancelAction("Annuler")

  return await alert.present() === 0
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

function removeQuietly(path) {
  try {
    if (fm.fileExists(path)) {
      fm.remove(path)
    }
  } catch (_) {}
}

function compareVersions(
  first,
  second
) {
  const a = versionParts(first)
  const b = versionParts(second)

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

    if (difference) {
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
    .map(part =>
      Number.parseInt(
        part,
        10
      ) || 0
    )
}

function isRecord(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
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

function sleep(milliseconds) {
  return new Promise(resolve => {
    Timer.schedule(
      milliseconds / 1000,
      false,
      resolve
    )
  })
}
