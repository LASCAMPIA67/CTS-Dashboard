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

const CHROMIUM = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium/chrome-linux/chrome",
  "/usr/bin/chromium"
].find(candidate => fs.existsSync(candidate))

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

  const dom = execFileSync(
    CHROMIUM,
    [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--virtual-time-budget=3000",
      "--window-size=1200,4000",
      "--dump-dom",
      `file://${file}`
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
