/*
 * Mesure la hauteur réellement occupée par le contenu du widget, sans
 * cadre imposé. Sert à calibrer le banc sur une capture iPhone connue,
 * puis à contrôler qu'une modification ne fait pas déborder le widget.
 *
 * Chromium rend la page, un script écrit les mesures dans le DOM, et
 * --dump-dom nous les rend.
 */
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { pathToFileURL } from "node:url"

/*
 * Le navigateur des mesures et des captures, cherché ici pour tous les
 * outils du dossier.
 *
 * Chacun tenait sa liste, et toutes nommaient un dossier de version que
 * l'environnement a remplacé depuis : la mesure échouait, la capture
 * s'arrêtait sur « Chromium introuvable ». /opt/pw-browsers/chromium est
 * désormais un lien vers le binaire en place, quelle que soit sa version ;
 * il a été un dossier, d'où le chemin qui y entre et le contrôle du
 * fichier, un dossier n'étant pas un exécutable.
 */
export const CHROMIUM = [
  "/opt/pw-browsers/chromium",
  "/opt/pw-browsers/chromium/chrome-linux/chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile())

export function measureBodies(items, workDirectory) {
  fs.mkdirSync(workDirectory, { recursive: true })

  const cards = items
    .map(
      (item, index) =>
        `<div class="probe" data-index="${index}" data-label="${escapeAttribute(item.label)}" ` +
        `data-frame="${item.height}" style="width:${item.width}px">${item.body}</div>`
    )
    .join("")

  const html = `<!doctype html><meta charset="utf-8"><style>
    * { margin:0; padding:0; }
    body { font-family:'Liberation Sans',sans-serif; }
    .probe { position:relative; overflow:visible; }
    .probe > div { width:100%; height:auto !important; }
  </style>${cards}<script>
    ${FIT}
    var results = []
    document.querySelectorAll('.probe').forEach(function (probe) {
      var widget = probe.firstElementChild
      results.push({
        label: probe.dataset.label,
        frame: parseFloat(probe.dataset.frame),
        content: Math.round(widget.getBoundingClientRect().height * 100) / 100
      })
    })
    document.body.setAttribute('data-metrics', JSON.stringify(results))
  </script>`

  const file = path.join(workDirectory, "measure.html")
  fs.writeFileSync(file, html)
  return readMetrics(file)
}

/*
 * Largeur de chaque carte de premier niveau. Sert à contrôler qu'elles
 * atteignent toutes le même bord droit : une pile qui ne réclame pas la
 * largeur disponible s'arrête sur son contenu, ce qui ne se voit qu'à
 * l'œil ou ici.
 */
export function measureCardWidths(items, workDirectory) {
  fs.mkdirSync(workDirectory, { recursive: true })

  const cards = items
    .map(
      item =>
        `<div class="probe" data-label="${escapeAttribute(item.label)}" ` +
        `style="width:${item.width}px;height:${item.height}px;overflow:hidden">${item.body}</div>`
    )
    .join("")

  const html = `<!doctype html><meta charset="utf-8"><style>
    * { margin:0; padding:0; }
    body { font-family:'Liberation Sans',sans-serif; }
    .probe > div { width:100%; height:100%; }
  </style>${cards}<script>
    ${FIT}
    var results = []
    document.querySelectorAll('.probe').forEach(function (probe) {
      var widget = probe.firstElementChild
      var cards = []
      Array.prototype.forEach.call(widget.children, function (child) {
        var box = child.getBoundingClientRect()
        if (box.height >= 4) cards.push(Math.round(box.width * 10) / 10)
      })
      results.push({
        label: probe.dataset.label,
        widget: Math.round(widget.getBoundingClientRect().width * 10) / 10,
        cards: cards
      })
    })
    document.body.setAttribute('data-metrics', JSON.stringify(results))
  </script>`

  const file = path.join(workDirectory, "widths.html")
  fs.writeFileSync(file, html)
  return readMetrics(file)
}

function readMetrics(file) {
  const dom = execFileSync(
    CHROMIUM,
    [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--virtual-time-budget=3000",
      "--window-size=1200,4000",
      "--dump-dom",
      pathToFileURL(file).href
    ],
    { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] }
  )

  const match = dom.match(/data-metrics="([^"]*)"/)
  if (!match) throw new Error("Mesures introuvables dans le DOM")
  return JSON.parse(decodeEntities(match[1]))
}

function escapeAttribute(value) {
  return String(value).replace(/"/g, "&quot;").replace(/&(?!quot;)/g, "&amp;")
}

function decodeEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

const FIT = `
document.querySelectorAll('[data-fit]').forEach(function (element) {
  var base = parseFloat(element.dataset.size)
  var min = parseFloat(element.dataset.min) || 1
  var available = element.clientWidth
  if (!available) return
  var probe = element.cloneNode(true)
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  probe.style.width = 'auto'
  probe.style.maxWidth = 'none'
  document.body.appendChild(probe)
  var natural = probe.scrollWidth
  document.body.removeChild(probe)
  if (natural <= available + 0.5) return
  var scale = Math.max(min, available / natural)
  element.style.fontSize = (base * scale).toFixed(2) + 'px'
});
`
