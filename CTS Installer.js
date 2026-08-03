// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: arrow.down.circle.fill;

const INSTALLER_VERSION = "1.0.0"
const REPO = { owner: "LASCAMPIA67", name: "CTS-Dashboard", branch: "main" }
const INSTALLER_FILE = "CTS Installer.js"
const META_FILE = "installation.json"
const TIMEOUT = 60
const RETRIES = 2
const fm = FileManager.iCloud()
const docs = fm.documentsDirectory()
const join = (a, b) => fm.joinPath(a, b)
const root = join(docs, "CTS Dashboard")
const currentInstaller = join(docs, `${Script.name()}.js`)
const canonicalInstaller = join(docs, INSTALLER_FILE)
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
  metadata: join(root, `Data/${META_FILE}`)
}

await main()
Script.complete()

async function main() {
  try {
    await preserveInstaller()
    const manifest = await loadManifest()
    validateManifest(manifest)
    if (!await handleInstallerUpdate(manifest)) return

    const state = await inspect(manifest)
    const action = await menu(manifest, state)

    if (action === "install") await installOrUpdate(manifest, state)
    if (action === "uninstall") await uninstall(manifest)
  } catch (error) {
    await errorAlert(error)
  }
}

async function menu(manifest, state) {
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
    return await alert.presentSheet() === 0 ? "install" : null
  }

  const version = state.installedVersion || "Non identifiée"
  const update = state.installedVersion &&
    compareVersions(manifest.version, state.installedVersion) > 0
  const issues = [...state.missing, ...state.invalid]

  alert.message = [
    update
      ? `Mise à jour disponible : ${version} → ${manifest.version}`
      : `Version installée : ${version}`,
    "",
    state.complete
      ? `${state.valid}/${state.total} fichiers valides`
      : `Installation à réparer : ${state.valid}/${state.total} fichiers valides`,
    issues.length ? `\nFichiers concernés : ${issues.join(", ")}` : "",
    "",
    update
      ? "Une nouvelle version est disponible sur GitHub."
      : state.complete
        ? "CTS Dashboard est entièrement à jour."
        : "Les fichiers absents ou invalides seront réparés.",
    "",
    "CTS Installer, vos PDF et leurs archives seront conservés."
  ].join("\n")

  alert.addAction(
    update
      ? `Mettre à jour vers ${manifest.version}`
      : state.complete
        ? "Vérifier les fichiers"
        : "Réparer l’installation"
  )
  alert.addDestructiveAction("Désinstaller")
  alert.addCancelAction("Fermer")

  const choice = await alert.presentSheet()
  return choice === 0 ? "install" : choice === 1 ? "uninstall" : null
}

async function inspect(manifest) {
  const metadata = await readMetadata()
  const entries = manifestEntries(manifest)
  const missing = []
  const invalid = []
  const reasons = {}
  let existing = 0
  let valid = 0

  for (const entry of entries) {
    if (!fm.fileExists(entry.destination)) {
      missing.push(entry.name)
      reasons[entry.name] = "Absent"
      continue
    }
    existing++
    const result = await validateLocal(entry.destination, entry.name)
    if (result.valid) valid++
    else {
      invalid.push(entry.name)
      reasons[entry.name] = result.reason
    }
  }

  const total = entries.length
  const present = Boolean(metadata || existing || fm.fileExists(root))
  const complete = present && valid === total
  const installedVersion =
    typeof metadata?.dashboardVersion === "string"
      ? metadata.dashboardVersion
      : complete ? manifest.version : null

  return {
    present, complete, existing, valid, total,
    installedVersion, missing, invalid, reasons
  }
}

async function installOrUpdate(manifest, previous) {
  const fresh = !previous.present
  const versionUpdate = previous.installedVersion &&
    compareVersions(manifest.version, previous.installedVersion) > 0
  const title = fresh
    ? "Installer CTS Dashboard"
    : versionUpdate
      ? "Mettre à jour CTS Dashboard"
      : previous.complete
        ? "Vérifier CTS Dashboard"
        : "Réparer CTS Dashboard"

  const message = fresh
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
        "Chaque fichier sera comparé à la version officielle publiée sur GitHub.",
        "",
        "Les fichiers différents, absents ou invalides seront remplacés.",
        "",
        "CTS Installer, vos PDF et leurs archives seront conservés."
      ].join("\n")

  if (!await confirm(title, message, "Continuer")) return

  const entries = manifestEntries(manifest)
  const progress = progressTable(title, manifest.version, entries)
  progress.present()

  const summary = {
    installed: [], updated: [], repaired: [],
    unchanged: [], failed: []
  }
  const failures = []
  const startedAt = Date.now()

  try {
    await progress.system("installer", "running", "Protection de CTS Installer…")
    await preserveInstaller()
    await progress.system("installer", "success", "Installateur protégé")

    await progress.system("github", "running", "Connexion en cours…")
    await verifyRepository()
    await progress.system("github", "success", "Connexion établie")

    await progress.system("directories", "running", "Préparation de l’arborescence…")
    ensureDirectories()
    await progress.system("directories", "success", "Arborescence prête")

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      await progress.entry(i, "running", `Contrôle de ${entry.name}`)

      try {
        const status = await syncFile(entry)
        summary[status].push(entry.name)
        await progress.entry(
          i,
          status === "unchanged" ? "unchanged" : "success",
          statusLabel(status)
        )
      } catch (error) {
        failures.push({ index: i, entry, reason: messageOf(error) })
        await progress.entry(i, "retry", "Nouvelle tentative programmée")
      }

      await progress.advance(i + 1, entries.length)
    }

    if (failures.length) {
      await progress.system(
        "retry", "running",
        `Nouvelle tentative sur ${failures.length} fichier(s)…`
      )

      for (const failure of failures) {
        await progress.entry(
          failure.index, "running",
          `Nouvelle tentative : ${failure.entry.name}`
        )
        try {
          const status = await syncFile(failure.entry, true)
          summary[status].push(failure.entry.name)
          failure.resolved = true
          await progress.entry(
            failure.index,
            status === "unchanged" ? "unchanged" : "success",
            statusLabel(status)
          )
        } catch (error) {
          failure.reason = messageOf(error)
          summary.failed.push(failure.entry.name)
          await progress.entry(failure.index, "error", failure.reason)
        }
      }

      const unresolved = failures.filter(item => !item.resolved)
      await progress.system(
        "retry",
        unresolved.length ? "error" : "success",
        unresolved.length
          ? `${unresolved.length} fichier(s) encore en erreur`
          : "Toutes les erreurs ont été corrigées"
      )
    } else {
      await progress.system(
        "retry", "success",
        "Aucune nouvelle tentative nécessaire"
      )
    }

    await progress.system("verification", "running", "Contrôle final…")
    const verification = await inspect(manifest)

    if (!verification.complete) {
      const issues = [
        ...verification.missing.map(name => `${name} — absent`),
        ...verification.invalid.map(
          name => `${name} — ${verification.reasons[name] || "invalide"}`
        )
      ]
      await progress.system(
        "verification", "error",
        `${verification.valid}/${verification.total} fichiers valides`
      )
      await progress.finish({
        success: false,
        title: "Installation non validée",
        message: [
          `${verification.valid}/${verification.total} fichiers sont valides.`,
          "",
          issues.length
            ? `Fichiers concernés :\n${issues.join("\n")}`
            : "Une erreur inconnue empêche la validation."
        ].join("\n"),
        summary,
        duration: Date.now() - startedAt
      })
      return
    }

    await writeMetadata(manifest, summary)
    await preserveInstaller()

    await progress.system(
      "verification", "success",
      `${verification.valid}/${verification.total} fichiers valides`
    )
    await progress.finish({
      success: true,
      title: fresh
        ? "Installation terminée"
        : versionUpdate
          ? "Mise à jour terminée"
          : previous.complete
            ? "Vérification terminée"
            : "Réparation terminée",
      message: [
        `CTS Dashboard ${manifest.version} est prêt.`,
        "",
        "Tous les fichiers ont été contrôlés avec succès.",
        "",
        "CTS Installer a été conservé."
      ].join("\n"),
      summary,
      duration: Date.now() - startedAt
    })
  } catch (error) {
    await progress.system("verification", "error", "Opération interrompue")
    await progress.finish({
      success: false,
      title: "Opération interrompue",
      message: messageOf(error),
      summary,
      duration: Date.now() - startedAt
    })
  }
}

async function syncFile(entry, force = false) {
  let remote
  let lastError

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      remote = await downloadText(
        `${rawUrl(entry.name)}?t=${Date.now()}-${attempt}`,
        entry.name
      )
      const validation = validateText(remote, entry.name)
      if (!validation.valid) {
        throw new Error(`Version GitHub invalide : ${validation.reason}`)
      }
      break
    } catch (error) {
      lastError = error
      if (attempt < RETRIES) await sleep(400)
    }
  }

  if (remote === undefined) {
    throw lastError || new Error(`${entry.name} impossible à télécharger.`)
  }

  const existed = fm.fileExists(entry.destination)
  let localValid = false

  if (existed) {
    const check = await validateLocal(entry.destination, entry.name)
    localValid = check.valid

    if (
      !force &&
      localValid &&
      await textMatches(entry.destination, remote)
    ) {
      return "unchanged"
    }
  }

  await writeText(entry.destination, remote)
  const result = await validateLocal(entry.destination, entry.name)

  if (!result.valid) {
    throw new Error(
      `${entry.name} invalide après écriture : ${result.reason}`
    )
  }

  if (!existed) return "installed"
  if (!localValid) return "repaired"
  return "updated"
}

async function preserveInstaller() {
  if (fm.fileExists(canonicalInstaller)) {
    const existing = await readText(canonicalInstaller)
    if (isInstallerSource(existing)) return
  }

  let source = null

  if (fm.fileExists(currentInstaller)) {
    const current = await readText(currentInstaller)
    if (isInstallerSource(current)) source = current
  }

  if (!source) {
    source = await downloadText(
      `${rawUrl(INSTALLER_FILE)}?self=${Date.now()}`,
      INSTALLER_FILE
    )
  }

  if (!isInstallerSource(source)) {
    throw new Error("La copie de CTS Installer est invalide.")
  }

  await writeText(canonicalInstaller, source)

  if (!fm.fileExists(canonicalInstaller)) {
    throw new Error("CTS Installer.js n’a pas pu être conservé.")
  }
}

function isInstallerSource(content) {
  return typeof content === "string" &&
    content.includes('const INSTALLER_VERSION = "') &&
    content.includes(`const INSTALLER_FILE = "${INSTALLER_FILE}"`) &&
    content.includes("async function main()")
}

async function uninstall(manifest) {
  if (!await confirm(
    "Désinstaller CTS Dashboard",
    [
      "Cette opération supprimera les scripts et données techniques du Dashboard.",
      "",
      "CTS Installer, le dossier Services, les PDF et leurs archives seront conservés."
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

  await preserveInstaller()

  const entries = [
    ...manifestEntries(manifest).filter(entry =>
      entry.destination !== canonicalInstaller &&
      entry.destination !== currentInstaller
    ),
    ...fm.fileExists(root)
      ? fm.listContents(root)
          .filter(name => name !== "Services")
          .map(name => ({
            name,
            type: "Dossier",
            destination: join(root, name)
          }))
      : []
  ]

  const progress = progressTable(
    "Désinstallation de CTS Dashboard",
    manifest.version,
    entries,
    true
  )
  progress.present()

  const summary = {
    installed: [], updated: [], repaired: [],
    unchanged: [], failed: []
  }

  for (let i = 0; i < entries.length; i++) {
    const item = entries[i]
    await progress.entry(i, "running", `Suppression de ${item.name}`)
    try {
      if (fm.fileExists(item.destination)) fm.remove(item.destination)
      summary.unchanged.push(item.name)
      await progress.entry(i, "success", "Supprimé")
    } catch (error) {
      summary.failed.push(item.name)
      await progress.entry(i, "error", messageOf(error))
    }
    await progress.advance(i + 1, entries.length)
  }

  await preserveInstaller()

  await progress.finish({
    success: summary.failed.length === 0,
    title: summary.failed.length
      ? "Désinstallation partielle"
      : "Désinstallation terminée",
    message: [
      `${summary.unchanged.length} élément(s) supprimé(s).`,
      `${summary.failed.length} erreur(s).`,
      "",
      "CTS Installer, le dossier Services et ses PDF ont été conservés."
    ].join("\n"),
    summary,
    duration: 0
  })
}

function progressTable(title, version, entries, uninstalling = false) {
  const table = new UITable()
  table.showSeparators = true

  const state = {
    completed: 0,
    total: entries.length,
    current: "Initialisation…",
    systems: {
      installer: {
        title: "Protection de l’installateur",
        status: uninstalling ? "hidden" : "pending",
        detail: "En attente"
      },
      github: {
        title: "Connexion à GitHub",
        status: uninstalling ? "hidden" : "pending",
        detail: "En attente"
      },
      directories: {
        title: "Création des dossiers",
        status: uninstalling ? "hidden" : "pending",
        detail: "En attente"
      },
      retry: {
        title: "Contrôle des erreurs",
        status: uninstalling ? "hidden" : "pending",
        detail: "En attente"
      },
      verification: {
        title: "Vérification finale",
        status: uninstalling ? "hidden" : "pending",
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
    const head = header.addText(
      title,
      `Version ${version} · Installer ${INSTALLER_VERSION}`
    )
    head.titleFont = Font.boldSystemFont(20)
    head.subtitleFont = Font.systemFont(12)
    table.addRow(header)

    const percentage = state.total
      ? Math.round(state.completed / state.total * 100)
      : 100
    const progress = new UITableRow()
    progress.height = 62
    const progressText = progress.addText(
      `Progression : ${percentage} %`,
      `${state.completed}/${state.total} · ${state.current}`
    )
    progressText.titleFont = Font.semiboldSystemFont(16)
    progressText.subtitleFont = Font.systemFont(12)
    table.addRow(progress)

    const systems = Object.values(state.systems)
      .filter(item => item.status !== "hidden")

    if (systems.length) {
      section(table, "ÉTAPES SYSTÈME")
      for (const item of systems) {
        statusRow(table, item.title, item.detail, item.status)
      }
    }

    section(
      table,
      uninstalling ? "ÉLÉMENTS À SUPPRIMER" : "FICHIERS DU PROJET"
    )
    for (const entry of state.entries) {
      statusRow(table, entry.name, entry.detail, entry.status)
    }

    if (state.result) {
      section(
        table,
        state.result.success ? "OPÉRATION TERMINÉE" : "ERREUR"
      )

      const result = new UITableRow()
      const lines = state.result.message.split("\n").length
      result.height = Math.max(95, 64 + lines * 17)
      const resultText = result.addText(
        state.result.title,
        state.result.message
      )
      resultText.titleFont = Font.boldSystemFont(18)
      resultText.subtitleFont = Font.systemFont(12)
      table.addRow(result)

      const summary = state.result.summary
      const report = new UITableRow()
      report.height = 88
      const elapsed = state.result.duration
        ? ` · ${formatDuration(state.result.duration)}`
        : ""
      const reportText = report.addText(
        uninstalling
          ? `Supprimés : ${summary.unchanged.length}   Erreurs : ${summary.failed.length}${elapsed}`
          : [
              `Installés : ${summary.installed.length}`,
              `Mis à jour : ${summary.updated.length}`,
              `Réparés : ${summary.repaired.length}`,
              `Déjà à jour : ${summary.unchanged.length}`,
              `Erreurs : ${summary.failed.length}`
            ].join("   ") + elapsed,
        "CTS Installer, les services PDF et leurs archives ont été conservés."
      )
      reportText.titleFont = Font.semiboldSystemFont(12)
      reportText.subtitleFont = Font.systemFont(11)
      table.addRow(report)
    }

    table.reload()
    await sleep(30)
  }

  return {
    present() { table.present(true) },
    async system(key, status, detail) {
      if (!state.systems[key]) return
      Object.assign(state.systems[key], { status, detail })
      state.current = detail
      await render()
    },
    async entry(index, status, detail) {
      if (!state.entries[index]) return
      Object.assign(state.entries[index], { status, detail })
      state.current = detail
      await render()
    },
    async advance(completed, total) {
      state.completed = completed
      state.total = total
      await render()
    },
    async finish(result) {
      state.result = result
      state.current = result.success
        ? "Opération terminée"
        : "Une erreur est survenue"
      if (result.success) state.completed = state.total
      await render()
    }
  }
}

function section(table, title) {
  const row = new UITableRow()
  row.height = 32
  row.isHeader = true
  row.addText(title).titleFont = Font.boldSystemFont(11)
  table.addRow(row)
}

function statusRow(table, title, detail, status) {
  const row = new UITableRow()
  row.height = detail.length > 65 ? 70 : 56
  const symbol = SFSymbol.named(
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
  )
  symbol.applyFont(Font.systemFont(17))
  row.addImage(symbol.image).widthWeight = 12
  const text = row.addText(title, detail)
  text.widthWeight = 88
  text.titleFont = Font.semiboldSystemFont(14)
  text.subtitleFont = Font.systemFont(11)
  table.addRow(row)
}

function manifestEntries(manifest) {
  return [
    ...manifest.scripts
      .filter(name => name !== INSTALLER_FILE)
      .map(name => ({
        name,
        type: "Script",
        destination: join(docs, name)
      })),
    ...manifest.resources.map(resource => ({
      name: resource.name,
      type: "Ressource",
      destination: projectPath(resource.destination)
    }))
  ]
}

function validateManifest(manifest) {
  if (
    !isRecord(manifest) ||
    typeof manifest.version !== "string" ||
    !Array.isArray(manifest.scripts) ||
    !manifest.scripts.length ||
    !Array.isArray(manifest.resources)
  ) {
    throw new Error("Le manifeste GitHub de CTS Dashboard est invalide.")
  }

  const names = new Set()
  for (const name of manifest.scripts) {
    if (
      typeof name !== "string" ||
      !name.endsWith(".js") ||
      name === INSTALLER_FILE ||
      names.has(name)
    ) {
      throw new Error(`Script invalide dans version.json : ${name}`)
    }
    names.add(name)
  }

  for (const resource of manifest.resources) {
    if (
      !isRecord(resource) ||
      typeof resource.name !== "string" ||
      typeof resource.destination !== "string"
    ) {
      throw new Error("Une ressource de version.json est invalide.")
    }
    projectPath(resource.destination)
  }
}

async function handleInstallerUpdate(manifest) {
  const available = String(
    manifest.installerVersion || INSTALLER_VERSION
  )
  const minimum = String(
    manifest.minimumInstaller || "0.0.0"
  )
  const update = compareVersions(available, INSTALLER_VERSION) > 0
  const required = compareVersions(minimum, INSTALLER_VERSION) > 0

  if (!update && !required) return true

  const alert = new Alert()
  alert.title = required
    ? "Mise à jour obligatoire"
    : "Nouvel installateur disponible"
  alert.message = [
    `Version actuelle : ${INSTALLER_VERSION}`,
    `Version disponible : ${available}`,
    "",
    required
      ? "Cette mise à jour est nécessaire pour continuer."
      : "Une nouvelle version de CTS Installer est disponible.",
    "",
    "Après la mise à jour, relancez CTS Installer."
  ].join("\n")
  alert.addAction(`Installer la version ${available}`)
  if (!required) alert.addAction("Continuer avec cette version")
  alert.addCancelAction("Annuler")

  const choice = await alert.presentSheet()
  if (choice === 0) {
    await updateInstaller(available)
    return false
  }
  return !required && choice === 1
}

async function updateInstaller(version) {
  const content = await downloadText(
    `${rawUrl(INSTALLER_FILE)}?t=${Date.now()}`,
    INSTALLER_FILE
  )

  if (!content.includes(`INSTALLER_VERSION = "${version}"`)) {
    throw new Error(
      "La version publiée de CTS Installer ne correspond pas au manifeste GitHub."
    )
  }

  await writeText(canonicalInstaller, content)
  if (currentInstaller !== canonicalInstaller) {
    await writeText(currentInstaller, content)
  }

  const alert = new Alert()
  alert.title = "CTS Installer mis à jour"
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
  } catch (error) {
    throw new Error(
      `version.json invalide : ${messageOf(error)}`
    )
  }
}

async function verifyRepository() {
  const content = await downloadText(
    `${rawUrl("version.json")}?ping=${Date.now()}`,
    "GitHub"
  )
  const result = validateText(content, "version.json")
  if (!result.valid) {
    throw new Error(`Connexion GitHub invalide : ${result.reason}`)
  }
}

function validateText(content, name) {
  if (typeof content !== "string" || !content.trim()) {
    return { valid: false, reason: "contenu vide" }
  }

  const trimmed = content.trim()
  const start = trimmed.slice(0, 160).toLowerCase()

  if (
    trimmed === "404: Not Found" ||
    start.startsWith("<!doctype html") ||
    start.startsWith("<html")
  ) {
    return {
      valid: false,
      reason: "GitHub a renvoyé une page d’erreur"
    }
  }

  if (name.endsWith(".json")) {
    try {
      const value = JSON.parse(content)
      if (value === null || typeof value !== "object") {
        return { valid: false, reason: "racine JSON invalide" }
      }
    } catch (error) {
      return {
        valid: false,
        reason: `JSON invalide : ${messageOf(error)}`
      }
    }
  }

  if (
    (name.endsWith(".js") || name.endsWith(".mjs")) &&
    trimmed.length < 80
  ) {
    return { valid: false, reason: "fichier anormalement court" }
  }

  return { valid: true, reason: "" }
}

async function validateLocal(path, name) {
  if (!fm.fileExists(path)) {
    return { valid: false, reason: "fichier absent" }
  }
  try {
    const content = await readText(path)
    return validateText(content, name)
  } catch (error) {
    return { valid: false, reason: messageOf(error) }
  }
}

async function textMatches(path, remote) {
  const local = await readText(path)
  return normalize(local) === normalize(remote)
}

async function readText(path) {
  await ensureDownloaded(path)
  return fm.readString(path)
}

async function writeText(destination, content) {
  ensureParent(destination)
  const temporary = `${destination}.download`
  removeQuietly(temporary)

  try {
    fm.writeString(temporary, content)
    if (!fm.fileExists(temporary)) {
      throw new Error("Le fichier temporaire n’a pas été créé.")
    }
    await sleep(80)
    removeQuietly(destination)
    fm.move(temporary, destination)
    await sleep(100)
    if (!fm.fileExists(destination)) {
      throw new Error("Le fichier final n’a pas été créé.")
    }
    await ensureDownloaded(destination)
  } catch (error) {
    removeQuietly(temporary)
    throw error
  }
}

async function readMetadata() {
  if (!fm.fileExists(paths.metadata)) return null
  try {
    const value = JSON.parse(await readText(paths.metadata))
    return isRecord(value) ? value : null
  } catch (_) {
    return null
  }
}

async function writeMetadata(manifest, summary) {
  ensureDirectories()
  const previous = await readMetadata()
  const now = new Date().toISOString()
  await writeText(
    paths.metadata,
    JSON.stringify({
      dashboardVersion: manifest.version,
      installerVersion: INSTALLER_VERSION,
      installedAt: previous?.installedAt || now,
      updatedAt: now,
      repository: REPO,
      files: summary
    }, null, 2)
  )
}

function ensureDirectories() {
  for (const path of Object.values(paths)) {
    if (path === paths.metadata) continue
    if (!fm.fileExists(path)) fm.createDirectory(path, true)
  }
}

function projectPath(relative) {
  const parts = String(relative || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)

  if (
    !parts.length ||
    parts.includes("..") ||
    parts.includes(".")
  ) {
    throw new Error("Un chemin déclaré dans version.json est invalide.")
  }

  return parts.reduce((path, part) => join(path, part), root)
}

function ensureParent(path) {
  const index = path.lastIndexOf("/")
  if (index <= 0) return
  const parent = path.slice(0, index)
  if (!fm.fileExists(parent)) fm.createDirectory(parent, true)
}

async function downloadText(url, label) {
  const request = new Request(url)
  request.timeoutInterval = TIMEOUT
  request.headers = {
    "Cache-Control": "no-cache",
    Pragma: "no-cache"
  }

  try {
    const content = await request.loadString()
    const status = Number(request.response?.statusCode)
    if (
      Number.isFinite(status) &&
      (status < 200 || status >= 300)
    ) {
      throw new Error(`Réponse HTTP ${status}`)
    }
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("Réponse vide")
    }
    return content
  } catch (error) {
    throw new Error(
      `${label} impossible à télécharger : ${messageOf(error)}`
    )
  }
}

function rawUrl(name) {
  return [
    "https://raw.githubusercontent.com",
    encodeURIComponent(REPO.owner),
    encodeURIComponent(REPO.name),
    encodeURIComponent(REPO.branch),
    String(name).split("/").map(encodeURIComponent).join("/")
  ].join("/")
}

async function confirm(title, message, action, destructive = false) {
  const alert = new Alert()
  alert.title = title
  alert.message = message
  destructive
    ? alert.addDestructiveAction(action)
    : alert.addAction(action)
  alert.addCancelAction("Annuler")
  return await alert.present() === 0
}

async function errorAlert(error) {
  const alert = new Alert()
  alert.title = "Opération impossible"
  alert.message = [
    messageOf(error),
    "",
    "Vérifiez votre connexion Internet puis relancez CTS Installer."
  ].join("\n")
  alert.addAction("OK")
  await alert.present()
}

async function ensureDownloaded(path) {
  if (fm.fileExists(path) && !fm.isFileDownloaded(path)) {
    await fm.downloadFileFromiCloud(path)
  }
}

function removeQuietly(path) {
  try {
    if (fm.fileExists(path)) fm.remove(path)
  } catch (_) {}
}

function statusLabel(status) {
  return {
    installed: "Installé",
    updated: "Mis à jour",
    repaired: "Réparé",
    unchanged: "Déjà à jour"
  }[status] || status
}

function normalize(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
}

function compareVersions(a, b) {
  const x = versionParts(a)
  const y = versionParts(b)
  const length = Math.max(x.length, y.length)

  for (let i = 0; i < length; i++) {
    const diff = (x[i] || 0) - (y[i] || 0)
    if (diff) return diff > 0 ? 1 : -1
  }
  return 0
}

function versionParts(value) {
  return String(value || "")
    .split(".")
    .map(part => Number.parseInt(part, 10) || 0)
}

function isRecord(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
}

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000))
  return seconds < 60
    ? `${seconds} s`
    : `${Math.floor(seconds / 60)} min ${seconds % 60} s`
}

function messageOf(error) {
  return error?.message?.trim?.() || String(error || "Erreur inconnue.")
}

function sleep(milliseconds) {
  return new Promise(resolve => {
    Timer.schedule(milliseconds / 1000, false, resolve)
  })
}
