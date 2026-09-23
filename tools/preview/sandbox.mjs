/*
 * Le bac à sable commun des bancs.
 *
 * Chaque banc montait le sien, et chacun avait dérivé à sa façon : l'un
 * fournissait Timer, l'autre non, un troisième oubliait invalidate(). Une
 * doublure de Scriptable fausse rend un banc vert pour de mauvaises
 * raisons ; la tenir en un seul endroit est le seul moyen qu'elle soit
 * juste partout à la fois.
 *
 * Ce module ne décide rien de ce qu'un banc éprouve : iCloud, le réseau, le
 * Keychain restent décrits par chaque banc, parce que c'est précisément ce
 * qu'il éprouve. Il fournit ce qui ne varie pas — le langage, une console
 * muette, le minuteur — et les trois façons dont un banc exécute un
 * script.
 */

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

/*
 * Les constructeurs de l'hôte, et non ceux que vm crée pour chaque
 * contexte : sans eux, un tableau rendu par un script n'est pas un Array
 * aux yeux du banc, et une date n'est pas une Date. Voir l'annexe
 * `node22.md` de la skill docs.
 */
export const LANGUAGE = {
  Date, Math, JSON, Number, String, Boolean, Array, Object, Set, Map,
  Promise, RegExp, Error, isNaN, parseInt, parseFloat,
  encodeURIComponent, decodeURIComponent
}

/*
 * Timer.schedule(millisecondes, répétition, fonction) rend un minuteur
 * qu'invalidate() arrête (docs.scriptable.app/timer, lu le 23/09/2026).
 *
 * Par défaut il se déclenche aussitôt : aucun banc n'a à attendre ce que
 * le code demande. `delay` rend une attente réelle quand le banc en a
 * besoin, et `waits` note chaque attente demandée — leur somme est la
 * patience que le code accorde.
 */
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

/*
 * Ce que tout script trouve en arrivant. Le banc ajoute ses doublures par
 * `globals`, et peut remplacer n'importe laquelle de celles-ci.
 */
export function scriptableGlobals(globals = {}) {
  return { console: silentConsole, ...LANGUAGE, Timer: timerDouble(), ...globals }
}

/*
 * Les dépendances qu'un banc a chargées ou remplacées, et elles seules : un
 * module inattendu lève au lieu de passer inaperçu.
 */
export function importFrom(loaded) {
  return requested => {
    const key = String(requested).replace(/^.*\//, "")

    if (!loaded[key]) throw new Error(`module inattendu : ${key}`)

    return loaded[key]
  }
}

/*
 * Un module seul dans son contexte. `importModule` dit au module où
 * trouver ses dépendances : c'est au banc de décider lesquelles sont
 * réelles et lesquelles sont des doublures.
 */
export function isolatedModule(name, { globals = {}, importModule, source = readScript(name) } = {}) {
  const module = { exports: {} }
  const sandbox = scriptableGlobals({ module, importModule, ...globals })

  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: `${name}.js` })

  return module.exports
}

/*
 * Plusieurs modules dans un même contexte, comme importModule les voit sur
 * l'iPhone : chacun n'est exécuté qu'une fois, et un nom que le banc
 * remplace par une doublure n'atteint jamais le disque.
 */
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

/*
 * Un script exécuté sans son point d'entrée : ses fonctions restent sur
 * l'objet global, où un outil de mesure ou de prévisualisation les appelle
 * une à une. Au banc de retirer `await main()` de la source.
 */
export function evaluateScript(name, sandbox, { source = readScript(name) } = {}) {
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: scriptPath(name) })

  return sandbox
}

/*
 * Un script exécuté en entier, `await main()` compris, comme Scriptable le
 * lance : c'est le seul contrôle qui voie une constante restée dans sa
 * zone morte temporelle.
 */
export function runScript(name, sandbox, { source = readScript(name) } = {}) {
  if (!vm.isContext(sandbox)) vm.createContext(sandbox)

  return vm.runInContext(`(async () => {\n${source}\n})()`, sandbox, {
    filename: scriptPath(name)
  })
}
