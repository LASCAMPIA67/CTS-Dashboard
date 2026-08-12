// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: wrench.fill;

/*
 * CTS Réparation — remplace CTS Installer par la version publiée.
 *
 * Pourquoi ce script existe.
 *
 * CTS Installer 1.0.7 déclarait deux constantes sous son propre appel à
 * main(). Elles restaient donc dans leur zone morte temporelle pendant
 * toute l'exécution, et la fonction qui attend qu'un fichier écrit soit
 * visible levait « Cannot access 'FILE_WAIT_TIMEOUT' before
 * initialization ». Cette fonction est traversée par CHAQUE écriture,
 * y compris celle qui remplace l'installateur lui-même : 1.0.7 ne peut
 * pas se mettre à jour, il échoue au moment précis où il essaie.
 *
 * Ce script fait ce seul travail, sans dépendre d'aucun fichier du
 * projet, et se supprime de la mémoire aussitôt : il télécharge la
 * version publiée de CTS Installer, la contrôle, puis l'écrit par-dessus
 * l'ancienne. Il peut être lancé sans risque même si tout va bien.
 */

const REPO = {
  owner: "LASCAMPIA67",
  name: "CTS-Dashboard",
  branch: "main"
}

const INSTALLER_FILE = "CTS Installer.js"

/* Un installateur complet pèse plus de 100 000 caractères. */
const MINIMUM_LENGTH = 50000

const METADATA_MARKER = "// Variables used by Scriptable."

const fm = FileManager.iCloud()
const docs = fm.documentsDirectory()

await main()
Script.complete()

async function main() {
  try {
    const source = await download()
    const version = validate(source)
    const targets = installerFiles()
    const written = []

    for (const name of targets) {
      writeText(fm.joinPath(docs, name), source)
      written.push(name)
    }

    await report(version, written)
  } catch (error) {
    const alert = new Alert()

    alert.title = "Réparation impossible"

    alert.message = [
      String(error && error.message ? error.message : error),
      "",
      "Vérifiez votre connexion Internet, puis relancez CTS Réparation."
    ].join("\n")

    alert.addAction("Fermer")
    await alert.present()
  }
}

/*
 * Les fichiers à réécrire : tout script de la racine dont le nom commence
 * par « CTS Installer ». Une réinstallation manuelle laisse parfois un
 * doublon (« CTS Installer 1 ») ; le laisser en 1.0.7 rendrait la panne
 * reproductible. Si aucun n'existe, le nom canonique est créé.
 */
function installerFiles() {
  const found = fm
    .listContents(docs)
    .filter(name => /^CTS Installer.*\.js$/i.test(name))
    .sort()

  return found.length ? found : [INSTALLER_FILE]
}

async function download() {
  const url =
    `https://raw.githubusercontent.com/` +
    `${REPO.owner}/${REPO.name}/${REPO.branch}/` +
    `${encodeURIComponent(INSTALLER_FILE)}?t=${Date.now()}`

  let lastError = null

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const request = new Request(url)
      request.timeoutInterval = 60
      request.headers = { "Cache-Control": "no-cache" }

      const content = await request.loadString()
      const status = request.response
        ? request.response.statusCode
        : 200

      if (status >= 400) {
        throw new Error(`GitHub a répondu ${status}.`)
      }

      return content
    } catch (error) {
      lastError = error
      await sleep(500 * (attempt + 1))
    }
  }

  throw new Error(
    `Téléchargement de CTS Installer impossible. ` +
    `${lastError && lastError.message ? lastError.message : ""}`.trim()
  )
}

/*
 * Le contrôle est volontairement plus strict qu'un simple contrôle de
 * taille : il refuse aussi un installateur qui reproduirait le défaut
 * de 1.0.7. Réparer avec un fichier malade n'aurait aucun sens.
 */
function validate(source) {
  if (typeof source !== "string" || source.length < MINIMUM_LENGTH) {
    throw new Error("Le fichier reçu n'est pas un installateur complet.")
  }

  if (!source.startsWith(METADATA_MARKER)) {
    throw new Error("Le fichier reçu n'est pas un script Scriptable valide.")
  }

  const match = source.match(/const\s+INSTALLER_VERSION\s*=\s*"([^"]+)"/)

  if (!match) {
    throw new Error("Le fichier reçu ne porte pas de numéro de version.")
  }

  const lines = source.split("\n")
  const entry = lines.findIndex(line => /^await main\(\)/.test(line))

  if (entry !== -1) {
    for (let index = entry + 1; index < lines.length; index++) {
      if (/^(?:const|let)\s+[A-Za-z_$]/.test(lines[index])) {
        throw new Error(
          "La version publiée porte encore le défaut d'initialisation. " +
          "Réparation annulée."
        )
      }
    }
  }

  return match[1]
}

/*
 * L'ancien fichier est mis de côté au lieu d'être supprimé, et n'est
 * effacé qu'une fois le nouveau relu depuis le disque. Une écriture
 * ratée ne doit jamais laisser l'utilisateur sans installateur.
 */
function writeText(destination, content) {
  const rollback = `${destination}.rollback`

  removeQuietly(rollback)

  let movedAside = false

  try {
    if (fm.fileExists(destination)) {
      fm.move(destination, rollback)
      movedAside = true
    }

    fm.writeString(destination, content)

    if (fm.readString(destination) !== content) {
      throw new Error("Le fichier écrit ne correspond pas au fichier reçu.")
    }

    removeQuietly(rollback)
  } catch (error) {
    if (movedAside && fm.fileExists(rollback)) {
      removeQuietly(destination)
      fm.move(rollback, destination)
    }

    throw error
  }
}

function removeQuietly(path) {
  try {
    if (fm.fileExists(path)) fm.remove(path)
  } catch (error) {
    /* Un reste sans conséquence ne doit pas faire échouer la réparation. */
  }
}

async function report(version, written) {
  const table = new UITable()
  table.showSeparators = false

  const title = new UITableRow()
  title.height = 60
  title.isHeader = true
  const titleCell = title.addText(
    "Réparation terminée",
    `CTS Installer ${version} est en place`
  )
  titleCell.titleFont = Font.boldSystemFont(20)
  titleCell.subtitleFont = Font.systemFont(13)
  table.addRow(title)

  for (const name of written) {
    const row = new UITableRow()
    row.height = 44
    const cell = row.addText(name.replace(/\.js$/i, ""), "remplacé")
    cell.titleFont = Font.mediumSystemFont(16)
    cell.subtitleFont = Font.systemFont(12)
    table.addRow(row)
  }

  const next = new UITableRow()
  next.height = 90
  const nextCell = next.addText(
    "À faire maintenant",
    "Ouvrez CTS Installer, puis choisissez « Vérifier les fichiers ». " +
    "Vous pouvez ensuite supprimer CTS Réparation."
  )
  nextCell.titleFont = Font.semiboldSystemFont(15)
  nextCell.subtitleFont = Font.systemFont(13)
  table.addRow(next)

  await table.present()
}

function sleep(ms) {
  return new Promise(resolve => {
    Timer.schedule(ms, false, resolve)
  })
}
