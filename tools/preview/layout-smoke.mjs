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
  { label: "modèle inconnu plus grand", width: 460, height: 1000 },
  /*
   * Écrans qui ne figurent dans aucune ligne de la table du renderer.
   * L'estimation retombe alors sur la ligne connue immédiatement
   * inférieure, donc sous-estime — ce qui est le bon sens de l'erreur.
   * Encore faut-il que la grille tienne quand même : c'est ce que ces
   * quatre-là vérifient, entre deux lignes, en dessous de la plus petite
   * et au-delà de la plus grande.
   */
  { label: "inconnu entre deux lignes", width: 400, height: 860 },
  { label: "inconnu large et court", width: 420, height: 900 },
  { label: "inconnu plus petit", width: 360, height: 780 },
  { label: "inconnu sous la table", width: 300, height: 500 }
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

/*
 * Les deux colonnes du bloc Travail / Amplitude.
 *
 * Elles portaient auparavant quatre ressorts souples qui se partageaient
 * l'espace restant : leur taille dépendait donc de la largeur des durées
 * du jour, et le séparateur — censé marquer le milieu — se décalait de la
 * moitié de l'écart entre « Travail » et « Amplitude ». Il bougeait selon
 * le service affiché.
 *
 * Chaque colonne vaut désormais exactement la moitié de la carte. Ce qui
 * doit être tenu ici est donc que les deux moitiés plus le séparateur
 * entrent bien dans cette carte : une colonne trop large ferait déborder
 * le bloc, et surtout écraserait le ressort qui garantit la symétrie.
 */
for (const screen of SCREENS) {
  SCREEN = screen

  for (const slices of [1, 2, 3, 4]) {
    for (const textScale of [1, 1.25]) {
      const density = RENDERER.getDensity(slices, textScale)

      const card = RENDERER.estimateWidgetWidth(screen) - 2 * density.paddingHorizontal
      const demanded = 2 * density.statColumnWidth + RENDERER.statSeparatorWidth()
      const slack = card - demanded

      /*
       * Le jeu exigé est celui du bandeau, et pour la même raison.
       *
       * Ce contrôle demandait d'abord l'inverse : il refusait plus de
       * quatre points de jeu, au motif que des colonnes trop étroites
       * laisseraient le contenu se tasser vers le séparateur. Il n'a donc
       * pas laissé passer le défaut suivant, il l'a imposé — la carte du
       * bas est partie en production plus large que celles du dessus, sur
       * un iPhone dont la table des largeurs surestime.
       *
       * Une colonne au cadre rigide ne se comprime pas : si les deux
       * réclament plus que la carte, c'est la carte qui cède. Le jeu est
       * donc ce qui absorbe l'erreur de la table, exactement comme pour la
       * grille du bandeau.
       */
      if (slack < MINIMUM_SLACK) {
        failures.push(
          `${screen.label} · ${slices} tranche(s) · texte ×${textScale} : les deux ` +
          `colonnes demandent ${demanded} pt pour ${card} pt de carte, soit ${slack} pt ` +
          `de jeu au lieu de ${MINIMUM_SLACK} — la carte s'élargirait au-delà des autres`
        )
      }
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
  `ok     géométrie de la grille et des colonnes du bas ` +
    `(${SCREENS.length} écrans × 4 densités, jeu ≥ ${MINIMUM_SLACK} pt)`
)
