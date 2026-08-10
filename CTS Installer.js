// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: arrow.down.circle.fill;

const INSTALLER_VERSION = "1.0.5"
const INSTALLER_FILE = "CTS Installer.js"
const SOURCE_COMMIT = "5ccb1c317624a9a852974f392ef16be04aabd9e8"
const SOURCE_VERSION = "1.0.4"
const TIMEOUT = 60

const REPO = {
  owner: "LASCAMPIA67",
  name: "CTS-Dashboard"
}

await main()
Script.complete()

async function main() {
  const fm = FileManager.iCloud()
  const docs = fm.documentsDirectory()
  const canonical = fm.joinPath(docs, INSTALLER_FILE)
  const current = fm.joinPath(docs, `${Script.name()}.js`)

  try {
    const source = await downloadSource()
    const patched = buildInstaller105(source)

    validatePatchedInstaller(patched)
    await writeSafely(fm, canonical, patched)

    if (current !== canonical) {
      await writeSafely(fm, current, patched)
    }

    const alert = new Alert()
    alert.title = "CTS Installer 1.0.5 prêt"
    alert.message = [
      "Le nouvel installateur a été préparé avec succès.",
      "",
      "La comparaison des fichiers Scriptable a été corrigée.",
      "",
      "Relancez CTS Installer pour continuer."
    ].join("\n")
    alert.addAction("Terminer")
    await alert.present()
  } catch (error) {
    const alert = new Alert()
    alert.title = "Mise à jour impossible"
    alert.message = String(error?.message || error || "Erreur inconnue.")
    alert.addAction("OK")
    await alert.present()
  }
}

async function downloadSource() {
  const url = [
    "https://raw.githubusercontent.com",
    encodeURIComponent(REPO.owner),
    encodeURIComponent(REPO.name),
    SOURCE_COMMIT,
    encodeURIComponent(INSTALLER_FILE)
  ].join("/") + `?migration=${Date.now()}`

  const request = new Request(url)
  request.timeoutInterval = TIMEOUT
  request.headers = {
    "Cache-Control": "no-cache",
    Pragma: "no-cache"
  }

  const source = await request.loadString()
  const status = Number(request.response?.statusCode)

  if (
    Number.isFinite(status) &&
    (status < 200 || status >= 300)
  ) {
    throw new Error(`GitHub a répondu HTTP ${status}.`)
  }

  if (
    typeof source !== "string" ||
    !source.includes(`const INSTALLER_VERSION = "${SOURCE_VERSION}"`) ||
    !source.includes(`const INSTALLER_FILE = "${INSTALLER_FILE}"`) ||
    !source.includes("async function main()")
  ) {
    throw new Error("La source de migration de CTS Installer est invalide.")
  }

  return source
}

function buildInstaller105(source) {
  let value = source

  value = replaceOnce(
    value,
    `const INSTALLER_VERSION = "${SOURCE_VERSION}"`,
    `const INSTALLER_VERSION = "${INSTALLER_VERSION}"`,
    "version de l’installateur"
  )

  value = replaceOnce(
    value,
    `      await textMatches(\n        entry.destination,\n        remote\n      )`,
    `      await textMatches(\n        entry.destination,\n        remote,\n        entry.name\n      )`,
    "comparaison des fichiers"
  )

  value = replaceOnce(
    value,
    `  if (!result.valid) {\n    throw new Error(\n      \`\${entry.name} invalide après écriture : \${result.reason}\`\n    )\n  }\n\n  if (!existed) {`,
    `  if (!result.valid) {\n    throw new Error(\n      \`\${entry.name} invalide après écriture : \${result.reason}\`\n    )\n  }\n\n  if (!await textMatches(\n    entry.destination,\n    remote,\n    entry.name\n  )) {\n    throw new Error(\n      \`\${entry.name} ne correspond pas au snapshot GitHub après écriture.\`\n    )\n  }\n\n  if (!existed) {`,
    "validation après écriture"
  )

  value = replaceOnce(
    value,
    `    normalize(canonical.content) !==\n      normalize(selected.content)`,
    `    normalize(\n      canonical.content,\n      INSTALLER_FILE\n    ) !==\n      normalize(\n        selected.content,\n        INSTALLER_FILE\n      )`,
    "protection de l’installateur"
  )

  value = replaceOnce(
    value,
    `async function textMatches(path, remote) {\n  const local = await readText(path)\n\n  return normalize(local) === normalize(remote)\n}`,
    `async function textMatches(path, remote, name = "") {\n  const local = await readText(path)\n\n  return (\n    normalize(local, name) ===\n    normalize(remote, name)\n  )\n}`,
    "fonction textMatches"
  )

  value = replaceOnce(
    value,
    `function normalize(value) {\n  return String(value ?? "")\n    .replace(/\\r\\n/g, "\\n")\n    .replace(/\\r/g, "\\n")\n}`,
    `function normalize(value, name = "") {\n  let text = String(value ?? "")\n    .replace(/^\\uFEFF/, "")\n    .replace(/\\r\\n/g, "\\n")\n    .replace(/\\r/g, "\\n")\n\n  if (/\\.js$/i.test(String(name || ""))) {\n    text = stripScriptableMetadata(text)\n  }\n\n  return text\n    .split("\\n")\n    .map(line =>\n      line.replace(/[ \\t]+$/g, "")\n    )\n    .join("\\n")\n    .replace(/\\n+$/g, "")\n}\n\nfunction stripScriptableMetadata(value) {\n  const lines = String(value ?? "")\n    .split("\\n")\n\n  let index = 0\n\n  while (index < lines.length) {\n    while (\n      index < lines.length &&\n      !lines[index].trim()\n    ) {\n      index++\n    }\n\n    const first = lines[index]?.trim?.() || ""\n    const second = lines[index + 1]?.trim?.() || ""\n    const third = lines[index + 2]?.trim?.() || ""\n\n    const metadataBlock =\n      first === "// Variables used by Scriptable." &&\n      second === "// These must be at the very top of the file. Do not edit." &&\n      /^\\/\\/ icon-color:\\s*[^;]+;\\s*icon-glyph:\\s*[^;]+;\\s*$/.test(third)\n\n    if (!metadataBlock) {\n      break\n    }\n\n    index += 3\n  }\n\n  while (\n    index < lines.length &&\n    !lines[index].trim()\n  ) {\n    index++\n  }\n\n  return lines.slice(index).join("\\n")\n}`,
    "normalisation des fichiers"
  )

  return value
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before)

  if (first < 0) {
    throw new Error(`Migration impossible : ${label} introuvable.`)
  }

  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Migration ambiguë : ${label} apparaît plusieurs fois.`)
  }

  return source.slice(0, first) + after + source.slice(first + before.length)
}

function validatePatchedInstaller(source) {
  const checks = [
    `const INSTALLER_VERSION = "${INSTALLER_VERSION}"`,
    "async function textMatches(path, remote, name = \"\")",
    "function stripScriptableMetadata(value)",
    "ne correspond pas au snapshot GitHub après écriture"
  ]

  if (!checks.every(check => source.includes(check))) {
    throw new Error("CTS Installer 1.0.5 n’a pas pu être validé après migration.")
  }
}

async function writeSafely(fm, destination, content) {
  const temporary = `${destination}.migration`

  try {
    if (fm.fileExists(temporary)) {
      fm.remove(temporary)
    }

    fm.writeString(temporary, content)

    if (!fm.fileExists(temporary)) {
      throw new Error("Le fichier temporaire de migration n’a pas été créé.")
    }

    if (fm.fileExists(destination)) {
      fm.remove(destination)
    }

    fm.move(temporary, destination)

    if (!fm.fileExists(destination)) {
      throw new Error("CTS Installer n’a pas été remplacé.")
    }
  } catch (error) {
    try {
      if (fm.fileExists(temporary)) {
        fm.remove(temporary)
      }
    } catch (_) {}

    throw error
  }
}
