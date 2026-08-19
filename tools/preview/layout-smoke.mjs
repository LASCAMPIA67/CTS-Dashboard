/*
 * Invariant de la grille du bandeau horaires.
 *
 * La carte des horaires est une grille symétrique : deux colonnes de
 * largeur identique, la flèche dans la gouttière, un ressort souple à
 * chaque extrémité. La symétrie ne tient que si la ligne entre dans la
 * largeur intérieure de la carte. Si elle déborde, les ressorts
 * s'écrasent, les colonnes se décalent et la flèche quitte le centre.
 *
 * Or la largeur du widget n'est pas mesurable : Scriptable ne l'expose
 * pas. Le renderer l'estime à partir d'une table de tailles d'écran. Une
 * estimation trop optimiste suffit donc à casser l'alignement — c'est ce
 * qui est arrivé sur un iPhone situé exactement sur la dernière ligne
 * connue de la table, quand la marge de sécurité n'était que de 6 pt.
 *
 * Ce banc vérifie que la ligne tient, sur chaque écran supporté et pour
 * chaque nombre de tranches, avec du jeu.
 */

import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"
import * as shim from "./scriptable-shim.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, "..", "..")

/* Écrans supportés, du plus petit au plus grand, plus un inconnu à venir. */
const SCREENS = [
  { label: "SE 1re génération", width: 320, height: 568 },
  { label: "SE 2e / 3e", width: 375, height: 667 },
  { label: "X / 11 Pro", width: 375, height: 812 },
  { label: "12 / 13 / 14", width: 390, height: 844 },
  { label: "15 / 16", width: 393, height: 852 },
  { label: "8 Plus", width: 414, height: 736 },
  { label: "11 / XR", width: 414, height: 896 },
  { label: "12 Pro Max", width: 428, height: 926 },
  { label: "15 Pro Max", width: 430, height: 932 },
  { label: "16 Pro Max", width: 440, height: 956 },
  { label: "modèle inconnu plus grand", width: 460, height: 1000 }
]

function loadRenderer() {
  const modules = new Map()
  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Date, Math, JSON, Number, String, Boolean, Array, Object, Set, Map,
    Promise, RegExp, Error, isNaN, parseInt, parseFloat, Intl,
    Device: { screenSize: () => new shim.Size(SCREEN.width, SCREEN.height) },
    importModule: name => loadModule(name)
  }

  shim.installGlobals(sandbox)
  vm.createContext(sandbox)

  function loadModule(name) {
    if (modules.has(name)) return modules.get(name)
    const file = path.join(repository, `${name}.js`)
    const source = fs.readFileSync(file, "utf8")
    const moduleObject = { exports: {} }
    modules.set(name, moduleObject.exports)
    const wrapper = vm.runInContext(
      `(function (module, exports) {\n${source}\n})`,
      sandbox,
      { filename: file }
    )
    wrapper(moduleObject, moduleObject.exports)
    modules.set(name, moduleObject.exports)
    return moduleObject.exports
  }

  return loadModule("CTS Widget Renderer")
}

let SCREEN = SCREENS[0]
const RENDERER = loadRenderer()
const failures = []

/*
 * Jeu minimal exigé. Zéro suffirait en théorie ; on en demande davantage
 * parce que la table des largeurs ne peut pas être vérifiée pour chaque
 * modèle, présent ou futur.
 */
const MINIMUM_SLACK = 10

for (const screen of SCREENS) {
  SCREEN = screen

  for (const slices of [1, 2, 3, 4]) {
    const density = RENDERER.getDensity(slices)
    const widget = RENDERER.estimateWidgetWidth(screen)

    const inner = widget - 2 * density.paddingHorizontal - 2 * density.cardPaddingHorizontal
    const demanded = 2 * density.columnWidth + RENDERER.gridGutter(density)
    const slack = inner - demanded

    if (slack < 0) {
      failures.push(
        `${screen.label} · ${slices} tranche(s) : la grille demande ${demanded} pt ` +
        `pour ${inner} pt disponibles — la symétrie casse`
      )
    } else if (slack < MINIMUM_SLACK) {
      failures.push(
        `${screen.label} · ${slices} tranche(s) : seulement ${slack} pt de jeu, ` +
        `il en faut ${MINIMUM_SLACK}`
      )
    }
  }
}

/* La largeur estimée ne doit jamais dépasser l'écran : garde-fou de la table. */
for (const screen of SCREENS) {
  SCREEN = screen
  const widget = RENDERER.estimateWidgetWidth(screen)

  if (widget >= screen.width) {
    failures.push(`${screen.label} : widget estimé à ${widget} pt pour un écran de ${screen.width} pt`)
  }
}

if (failures.length) {
  console.log("ÉCHEC  géométrie de la grille")
  for (const failure of failures) console.log(`         ${failure}`)
  process.exit(1)
}

console.log(
  `ok     géométrie de la grille (${SCREENS.length} écrans × 4 densités, jeu ≥ ${MINIMUM_SLACK} pt)`
)
