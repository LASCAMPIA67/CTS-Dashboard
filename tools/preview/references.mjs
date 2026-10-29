import fs from "node:fs"
import path from "node:path"
import { isolatedModule, repository } from "./sandbox.mjs"

function scriptableStubs(touched) {
  const fileManager = {
    documentsDirectory: () => "/docs",
    libraryDirectory: () => "/library",
    joinPath: (a, b) => `${a}/${b}`,
    fileExists: () => true,
    isFileDownloaded: () => true,
    readString: () => "{}",
    writeString: () => {},
    createDirectory: () => {},
    remove: () => {},
    move: () => {},
    copy: () => {},
    listContents: () => [],
    fileSize: () => 1,
    modificationDate: () => new Date(),
    isDirectory: () => false,
    downloadFileFromiCloud: async () => {}
  }

  return {
    Intl,
    setTimeout,
    config: { runsInWidget: false, runsInApp: true, widgetFamily: "large" },
    Script: { name: () => "test", complete: () => {}, setWidget: () => {} },
    Device: { systemVersion: () => "27.0", screenSize: () => ({ width: 393, height: 852 }) },
    Keychain: {
      contains: () => false,
      get: () => "",
      set: () => {},
      remove: () => {}
    },
    UUID: { string: () => "0000" },
    Pasteboard: { copyString: () => {} },
    Request: class {
      constructor(url) {
        touched.push(`Request(${url})`)
        this.headers = {}
        this.response = { statusCode: 200 }
      }
      async loadString() { return "" }
      async loadJSON() { return {} }
    },
    WebView: class {
      async loadHTML() {}
      async evaluateJavaScript() { return null }
    },
    Alert: class {
      addAction() {}
      addCancelAction() {}
      addTextField() {}
      addSecureTextField() {}
      textFieldValue() { return "" }
      present() { return Promise.resolve(0) }
      presentAlert() { return Promise.resolve(0) }
      presentSheet() { return Promise.resolve(0) }
    },
    Notification: class { schedule() { return Promise.resolve() } },
    DateFormatter: class {
      string() { return "" }
    },
    Color: class {
      constructor(hex, alpha) { this.hex = hex; this.alpha = alpha }
      static dynamic(a) { return a }
      static white() { return new this("#FFFFFF") }
      static black() { return new this("#000000") }
      static clear() { return new this("#000000", 0) }
    },
    Font: new Proxy({}, { get: () => () => ({}) }),
    Size: class { constructor(w, h) { this.width = w; this.height = h } },
    Point: class { constructor(x, y) { this.x = x; this.y = y } },
    Rect: class { constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }) } },
    SFSymbol: { named: () => ({ image: {}, applyFont: () => {} }) },
    Image: { fromData: () => ({}) },
    Data: { fromString: () => ({}) },
    LinearGradient: class {},
    DrawContext: class {
      getImage() { return {} }
      setFillColor() {}
      setTextColor() {}
      setFont() {}
      fillRect() {}
      fillEllipse() {}
      drawTextInRect() {}
    },
    ListWidget: class {
      addStack() { return this }
      addText() { return { }, this }
      addSpacer() {}
      setPadding() {}
    },
    FileManager: { iCloud: () => fileManager, local: () => fileManager }
  }
}

export function loadDistributedModules() {
  const manifest = JSON.parse(fs.readFileSync(path.join(repository, "version.json"), "utf8"))
  const failures = []
  const touched = []
  const sources = new Map()

  for (const name of manifest.scripts) {
    sources.set(name.replace(/\.js$/, ""), fs.readFileSync(path.join(repository, name), "utf8"))
  }

  const names = [...sources.keys()].filter(name => name !== "CTS Dashboard")

  const dependenciesOf = name => [
    ...new Set(
      [...sources.get(name).matchAll(/importModule\(\s*"([^"]+)"/g)].map(match => match[1])
    )
  ].filter(dependency => sources.has(dependency))

  const ordered = []
  const seen = new Set()
  const stack = new Set()

  const visit = name => {
    if (seen.has(name)) return
    if (stack.has(name)) {
      failures.push(`dépendance circulaire autour de ${name}`)
      return
    }

    stack.add(name)
    for (const dependency of dependenciesOf(name)) visit(dependency)
    stack.delete(name)

    seen.add(name)
    ordered.push(name)
  }

  for (const name of names) visit(name)

  const loaded = new Map()

  for (const name of ordered) {
    let exported

    try {
      exported = isolatedModule(name, {
        source: sources.get(name),
        globals: scriptableStubs(touched),
        importModule: requested => {
          const key = String(requested).replace(/^.*\//, "")
          if (!loaded.has(key)) {
            failures.push(`${name} importe ${key}, qui n'a pas pu être chargé`)
            return {}
          }
          return loaded.get(key)
        }
      })
    } catch (error) {
      failures.push(`${name} ne se charge pas : ${error.message}`)
      loaded.set(name, {})
      continue
    }

    if (!exported || typeof exported !== "object" || !Object.keys(exported).length) {
      failures.push(`${name} n'exporte rien`)
    }

    loaded.set(name, exported || {})
  }

  return { names, sources, loaded, failures, touched }
}

export function moduleAliases(source, { sources }) {
  const aliases = new Map()

  for (const match of source.matchAll(
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*\n?\s*importModule\(\s*"([^"]+)"/g
  )) {
    if (sources.has(match[2])) aliases.set(match[1], match[2])
  }

  return aliases
}

// Motif distinct de celui des modules : étendu ici, il confondrait le `module` de Scriptable avec celui de CTS Importer.
export function consumerAliases(source, { sources }) {
  const constants = new Map(
    [...source.matchAll(/const\s+([A-Z][A-Z0-9_]*)\s*=\s*"([^"]+)"/g)].map(match => [
      match[1],
      match[2]
    ])
  )

  const aliases = new Map()

  for (const match of source.matchAll(
    /(?<![\w$])([A-Za-z_$][\w$]*)\s*=\s*importModule\(\s*(?:"([^"]+)"|([A-Z][A-Z0-9_]*))\s*\)/g
  )) {
    const moduleName = match[2] || constants.get(match[3])
    if (sources.has(moduleName)) aliases.set(match[1], moduleName)
  }

  return aliases
}

export function checkReferences(consumer, source, aliases, { sources, loaded }) {
  const failures = []
  let checked = 0

  for (const match of source.matchAll(/importModule\(\s*"([^"]+)"/g)) {
    if (!sources.has(match[1])) {
      failures.push(`${consumer} importe ${match[1]}, qui n'est pas distribué`)
    }
  }

  for (const [alias, moduleName] of aliases) {
    const exported = loaded.get(moduleName) || {}

    // Précédé d'un tiret ou d'un point hors étalement, ce n'est pas un alias : « cts-analytics.nameless ».
    const name = alias.replace(/\$/g, "\\$")

    for (const use of source.matchAll(
      new RegExp(`(?<![\\w$-])(?<![^.]\\.)${name}\\.([A-Za-z_$][\\w$]*)`, "g")
    )) {
      checked++
      if (!(use[1] in exported)) {
        failures.push(
          `${consumer} appelle ${alias}.${use[1]}, absent des exports de ${moduleName}`
        )
      }
    }
  }

  for (const match of source.matchAll(
    /const\s*\{([^}]*)\}\s*=\s*\n?\s*importModule\(\s*"([^"]+)"/g
  )) {
    const moduleName = match[2]
    if (!sources.has(moduleName)) continue

    const exported = loaded.get(moduleName) || {}

    for (const part of match[1].split(",")) {
      const member = part.split(":")[0].trim()
      if (!member) continue
      checked++
      if (!(member in exported)) {
        failures.push(
          `${consumer} déstructure ${member} depuis ${moduleName}, qui ne l'exporte pas`
        )
      }
    }
  }

  for (const match of source.matchAll(
    /const\s*\{([^}]*)\}\s*=\s*([A-Za-z_$][\w$]*)(?![\w$.(\[])/g
  )) {
    const moduleName = aliases.get(match[2])
    if (!moduleName) continue

    const exported = loaded.get(moduleName) || {}

    for (const part of match[1].split(",")) {
      const member = part.split(":")[0].trim()
      if (!member) continue
      checked++
      if (!(member in exported)) {
        failures.push(
          `${consumer} déstructure ${member} depuis ${moduleName}, qui ne l'exporte pas`
        )
      }
    }
  }

  const borrowings = [...source.matchAll(
    /loadDashboardFunction\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g
  )]

  const calls = source.match(/(?<!function\s)loadDashboardFunction\(/g) || []

  if (calls.length !== borrowings.length) {
    failures.push(
      `${consumer} appelle loadDashboardFunction sans nommer en toutes lettres ` +
        `le module et la fonction : l'emprunt ne peut pas être vérifié`
    )
  }

  for (const [, moduleName, member] of borrowings) {
    checked++

    if (!sources.has(moduleName)) {
      failures.push(
        `${consumer} emprunte ${moduleName}.${member}, mais ${moduleName} n'est pas distribué`
      )
    } else if (!(member in (loaded.get(moduleName) || {}))) {
      failures.push(
        `${consumer} emprunte ${moduleName}.${member}, absent des exports de ${moduleName}`
      )
    }
  }

  return { checked, failures }
}
