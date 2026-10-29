import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))

export const repository = path.resolve(here, "..", "..")

export function scriptPath(name) {
  return path.join(repository, `${name}.js`)
}

export function readScript(name) {
  return fs.readFileSync(scriptPath(name), "utf8")
}

export const silentConsole = { log: () => {}, warn: () => {}, error: () => {} }

// Les constructeurs de l'hôte, pas ceux de vm : sinon un tableau rendu par un script n'est pas un Array pour le banc.
export const LANGUAGE = {
  Date, Math, JSON, Number, String, Boolean, Array, Object, Set, Map,
  Promise, RegExp, Error, isNaN, parseInt, parseFloat,
  encodeURIComponent, decodeURIComponent
}

export function timerDouble({ delay = () => 0, waits = null } = {}) {
  return class Timer {
    static schedule(milliseconds, repeats, callback) {
      const requested = Number(milliseconds) || 0
      const timer = new this()

      if (waits) waits.push(requested)

      timer.handle = setTimeout(callback, delay(requested))

      return timer
    }

    invalidate() {
      clearTimeout(this.handle)
    }
  }
}

export function scriptableGlobals(globals = {}) {
  return { console: silentConsole, ...LANGUAGE, Timer: timerDouble(), ...globals }
}

export function importFrom(loaded) {
  return requested => {
    const key = String(requested).replace(/^.*\//, "")

    if (!loaded[key]) throw new Error(`module inattendu : ${key}`)

    return loaded[key]
  }
}

export function isolatedModule(name, { globals = {}, importModule, source = readScript(name) } = {}) {
  const module = { exports: {} }
  const sandbox = scriptableGlobals({ module, importModule, ...globals })

  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: `${name}.js` })

  return module.exports
}

export function moduleSpace(globals = {}, { doubles = {} } = {}) {
  const loaded = new Map()

  const sandbox = scriptableGlobals({ importModule: name => load(name), ...globals })

  vm.createContext(sandbox)

  function load(name) {
    if (Object.prototype.hasOwnProperty.call(doubles, name)) return doubles[name]
    if (loaded.has(name)) return loaded.get(name)

    const module = { exports: {} }

    loaded.set(name, module.exports)
    vm.runInContext(`(function (module, exports) {\n${readScript(name)}\n})`, sandbox, {
      filename: `${name}.js`
    })(module, module.exports)
    loaded.set(name, module.exports)

    return module.exports
  }

  return { sandbox, load, reset: () => loaded.clear() }
}

export function evaluateScript(name, sandbox, { source = readScript(name) } = {}) {
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: scriptPath(name) })

  return sandbox
}

export function runScript(name, sandbox, { source = readScript(name) } = {}) {
  if (!vm.isContext(sandbox)) vm.createContext(sandbox)

  return vm.runInContext(`(async () => {\n${source}\n})()`, sandbox, {
    filename: scriptPath(name)
  })
}
