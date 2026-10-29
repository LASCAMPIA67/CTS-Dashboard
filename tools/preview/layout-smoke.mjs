import * as shim from "./scriptable-shim.mjs"
import { moduleSpace } from "./sandbox.mjs"

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
  { label: "inconnu entre deux lignes", width: 400, height: 860 },
  { label: "inconnu large et court", width: 420, height: 900 },
  { label: "inconnu plus petit", width: 360, height: 780 },
  { label: "inconnu sous la table", width: 300, height: 500 }
]

function loadRenderer() {
  const globals = {
    Intl,
    Device: { screenSize: () => new shim.Size(SCREEN.width, SCREEN.height) }
  }

  shim.installGlobals(globals)

  return moduleSpace(globals).load("CTS Widget Renderer")
}

let SCREEN = SCREENS[0]
const RENDERER = loadRenderer()
const failures = []

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

for (const screen of SCREENS) {
  SCREEN = screen

  for (const slices of [1, 2, 3, 4]) {
    for (const textScale of [1, 1.25]) {
      const density = RENDERER.getDensity(slices, textScale)

      const card = RENDERER.estimateWidgetWidth(screen) - 2 * density.paddingHorizontal
      const demanded = 2 * density.statColumnWidth + RENDERER.statSeparatorWidth()
      const slack = card - demanded

      // Le même jeu que le bandeau : des colonnes rigides ne se compriment pas, c'est la carte qui cède.
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
    `(${SCREENS.length} écrans × 4 découpages, jeu ≥ ${MINIMUM_SLACK} pt)`
)
