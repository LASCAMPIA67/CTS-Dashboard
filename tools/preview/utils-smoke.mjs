/*
 * Primitives partagées de CTS Utils.
 *
 * withTimeout borne désormais tout ce que le projet ne peut pas annuler :
 * les téléchargements iCloud et les appels WebView du moteur PDF. Une
 * régression ici rendrait à nouveau possible un widget qui attend sans
 * fin — donc qui ne dessine rien et laisse l'écran d'accueil figé.
 */

import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, "..", "..")

function loadUtils(runsInWidget = true) {
  const source = fs.readFileSync(path.join(repository, "CTS Utils.js"), "utf8")
  const module = { exports: {} }

  const sandbox = {
    module,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Date, Math, JSON, Number, String, Boolean, Array, Object, Set, Map,
    Promise, RegExp, Error, isNaN, parseInt, parseFloat,
    config: { runsInWidget },
    args: { plainTexts: [], shortcutParameter: null },
    /* Le Timer de Scriptable compte en millisecondes. */
    Timer: class {
      static schedule(milliseconds, repeats, callback) {
        setTimeout(callback, Number(milliseconds) || 0)
        return new this()
      }
      invalidate() {}
    }
  }

  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: "CTS Utils.js" })

  return module.exports
}

const failures = []
const UTILS = loadUtils()

/* Une promesse qui aboutit passe sans être altérée. */
{
  const value = await UTILS.withTimeout(Promise.resolve("réponse"), 1000, "REPLI")

  if (value !== "réponse") {
    failures.push(`withTimeout altère une réponse rapide : ${JSON.stringify(value)}`)
  }
}

/* Une promesse qui ne se résout jamais doit rendre la main. */
{
  const startedAt = Date.now()
  const value = await UTILS.withTimeout(new Promise(() => {}), 120, "REPLI")
  const elapsed = Date.now() - startedAt

  if (value !== "REPLI") {
    failures.push(`withTimeout ne rend pas le repli : ${JSON.stringify(value)}`)
  }

  if (elapsed > 1500) {
    failures.push(`withTimeout a mis ${elapsed} ms à renoncer`)
  }
}

/* Une promesse plus lente que la borne rend le repli, pas sa valeur. */
{
  const slow = new Promise(resolve => setTimeout(() => resolve("tardif"), 400))
  const value = await UTILS.withTimeout(slow, 80, "REPLI")

  if (value !== "REPLI") {
    failures.push(`withTimeout attend une promesse trop lente : ${JSON.stringify(value)}`)
  }
}

/* Un rejet reste un rejet : l'appelant garde sa gestion d'erreur. */
{
  let rejected = false

  try {
    await UTILS.withTimeout(Promise.reject(new Error("panne")), 1000, "REPLI")
  } catch (error) {
    rejected = error?.message === "panne"
  }

  if (!rejected) failures.push("withTimeout avale un rejet au lieu de le propager")
}

/*
 * runsInApplication décide de la patience accordée à iCloud et du nombre
 * de cartes agent lues par réveil. En cas de doute, il doit répondre
 * « non » : le contexte contraint est le plus exigeant.
 */
{
  if (loadUtils(true).runsInApplication() !== false) {
    failures.push("runsInApplication répond « oui » dans un widget")
  }

  if (loadUtils(false).runsInApplication() !== true) {
    failures.push("runsInApplication répond « non » dans l'application")
  }
}

/*
 * isUsableDate accepte une date venue d'un autre contexte d'exécution,
 * là où instanceof échoue. Le point d'entrée du widget en dépend pour
 * programmer son propre rafraîchissement.
 */
{
  const foreign = {
    getTime: () => 1_770_000_000_000,
    getFullYear: () => 2026,
    getMonth: () => 7,
    getDate: () => 19,
    getHours: () => 6,
    getMinutes: () => 30
  }

  if (!UTILS.isUsableDate(foreign)) {
    failures.push("isUsableDate rejette une date venue d'un autre module")
  }

  if (UTILS.isValidDate(foreign)) {
    failures.push("isValidDate accepte une date étrangère : le piège aurait disparu")
  }

  for (const value of [null, undefined, "2026-08-19", {}, new Date("nope")]) {
    if (UTILS.isUsableDate(value)) {
      failures.push(`isUsableDate accepte ${JSON.stringify(String(value))}`)
    }
  }
}

if (failures.length) {
  console.log("ÉCHEC  primitives partagées")
  for (const failure of failures) console.log(`         ${failure}`)
  process.exit(1)
}

console.log("ok     primitives partagées (bornes, contexte d'exécution, dates inter-modules)")
