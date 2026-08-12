import { symbolPath } from "./scriptable-shim.mjs"

/*
 * Hauteur de ligne et resserrement calibrés sur une capture iPhone réelle
 * (service CL09, trois tranches, Pro Max) : Liberation Sans est plus haute
 * et plus large que San Francisco, ces deux facteurs compensent l'écart.
 * Voir tools/preview/CALIBRATION.md.
 */
const LINE_HEIGHT = Number(process.env.PREVIEW_LINE_HEIGHT) || 1.2
const TRACKING = Number(process.env.PREVIEW_TRACKING)
const LETTER_SPACING = Number.isFinite(TRACKING) ? TRACKING : -0.012

/*
 * Traduction de l'arbre Scriptable en flexbox.
 *
 * Règle centrale : dans Scriptable, une pile se dimensionne sur son
 * contenu, sauf si elle contient un ressort souple — auquel cas elle
 * occupe tout l'espace disponible le long de son axe. Cette propriété se
 * propage aux parents. On la calcule donc de bas en haut avant d'écrire
 * le HTML, puis on la traduit en `flex-grow` (axe principal du parent)
 * ou `align-self: stretch` (axe transversal).
 */
function analyze(node) {
  if (node.kind === "spacer") {
    node.flexible = node.length === undefined || node.length === null
    node.expandsH = false
    node.expandsV = false
    return node
  }

  if (node.kind !== "stack" && node.kind !== undefined) {
    node.expandsH = false
    node.expandsV = false
    return node
  }

  const children = node.children.map(analyze)
  const hasFlexible = children.some(child => child.kind === "spacer" && child.flexible)

  const alongMain = hasFlexible || children.some(child => (node.vertical ? child.expandsV : child.expandsH))
  const alongCross = children.some(child => (node.vertical ? child.expandsH : child.expandsV))

  node.expandsH = node.vertical ? alongCross : alongMain
  node.expandsV = node.vertical ? alongMain : alongCross

  if (node.size?.width > 0) node.expandsH = false
  if (node.size?.height > 0) node.expandsV = false
  return node
}

function gradientCss(gradient) {
  if (!gradient?.colors?.length) return ""
  const stops = gradient.colors
    .map((color, index) => {
      const location = gradient.locations?.[index]
      const percent = Number.isFinite(location) ? location * 100 : (index / (gradient.colors.length - 1)) * 100
      return `${color.css()} ${percent.toFixed(2)}%`
    })
    .join(", ")
  /* startPoint (0,0) → endPoint (1,1) correspond au coin haut-gauche vers
     le coin bas-droit, soit 135deg en CSS. */
  return `background-image: linear-gradient(135deg, ${stops});`
}

function boxStyle(node, parentVertical) {
  const style = []
  style.push(`display:flex`)
  style.push(`flex-direction:${node.vertical ? "column" : "row"}`)
  style.push(`align-items:${node.centered ? "center" : "flex-start"}`)
  style.push(`justify-content:flex-start`)
  style.push(`box-sizing:border-box`)

  const [top, right, bottom, left] = node.padding
  if (top || right || bottom || left) style.push(`padding:${top}px ${right}px ${bottom}px ${left}px`)

  if (node.size?.width > 0) style.push(`width:${node.size.width}px;flex:0 0 ${node.size.width}px`)
  if (node.size?.height > 0) style.push(`height:${node.size.height}px`)

  if (node.cornerRadius) style.push(`border-radius:${node.cornerRadius}px`)
  if (node.backgroundColor) style.push(`background-color:${node.backgroundColor.css()}`)
  if (node.backgroundGradient) style.push(gradientCss(node.backgroundGradient))
  if (node.borderWidth) {
    style.push(`border:${node.borderWidth}px solid ${(node.borderColor || node.backgroundColor)?.css() || "transparent"}`)
  }

  /* Expansion héritée de Scriptable. */
  const mainExpands = parentVertical ? node.expandsV : node.expandsH
  const crossExpands = parentVertical ? node.expandsH : node.expandsV
  if (mainExpands && !(parentVertical ? node.size?.height > 0 : node.size?.width > 0)) {
    style.push(`flex-grow:1`)
  }
  if (crossExpands) style.push(`align-self:stretch`)

  /* Une pile doit pouvoir se comprimer pour que la réduction de police
     s'applique comme sur iOS, jamais déborder la carte. */
  style.push(`min-width:0`)
  return style.join(";")
}

function renderNode(node, parentVertical) {
  if (node.kind === "spacer") {
    if (node.flexible) return `<div style="flex:1 1 auto;min-width:0;min-height:0"></div>`
    const axis = parentVertical ? "height" : "width"
    return `<div style="flex:0 0 ${node.length}px;${axis}:${node.length}px"></div>`
  }

  if (node.kind === "text") {
    const font = node.font
    const family = font.monospaced ? "'Liberation Mono', monospace" : "'Liberation Sans', sans-serif"
    const style = [
      `font-family:${family}`,
      `font-size:${font.size}px`,
      `font-weight:${font.weight}`,
      `color:${node.textColor.css()}`,
      `text-align:${node.align}`,
      `white-space:nowrap`,
      `overflow:hidden`,
      `min-width:0`,
      /* San Francisco est un peu plus resserré que Liberation Sans ; ce
         réglage rapproche les largeurs sans déformer les glyphes. */
      `letter-spacing:${(font.monospaced ? LETTER_SPACING - 0.008 : LETTER_SPACING).toFixed(4)}em`,
      `line-height:${LINE_HEIGHT}`
    ].join(";")
    const attrs = `data-fit="1" data-size="${font.size}" data-min="${node.minimumScaleFactor}"`
    const width = node.align === "left" ? "" : "align-self:stretch;"
    return `<span ${attrs} style="${width}${style}">${escapeHtml(node.value)}</span>`
  }

  if (node.kind === "image") {
    const size = node.imageSize.width
    return (
      `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
      `stroke="${node.tintColor.css()}" stroke-width="2.2" stroke-linecap="round" ` +
      `stroke-linejoin="round" style="flex:0 0 ${size}px">` +
      `<path d="${symbolPath(node.symbol)}"/></svg>`
    )
  }

  const inner = node.children.map(child => renderNode(child, node.vertical)).join("")
  return `<div style="${boxStyle(node, parentVertical)}">${inner}</div>`
}

function escapeHtml(value) {
  return String(value).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c])
}

/*
 * Reproduction de `minimumScaleFactor` : iOS réduit la police jusqu'à ce
 * que le texte tienne, sans jamais descendre sous le facteur donné, puis
 * tronque. Mesuré après la mise en page, comme le fait le système.
 */
const FIT_SCRIPT = `
(function () {
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
    if (available / natural < min) element.style.textOverflow = 'ellipsis'
  })
})();
`

export function renderWidget(widget, { width, height, label }) {
  analyze(widget)
  const body = renderNode(widget, true)
  return `<!doctype html><meta charset="utf-8"><style>
    * { margin:0; padding:0; }
    body { background:#0A0A0B; font-family:'Liberation Sans',sans-serif; }
    .frame { width:${width}px; height:${height}px; overflow:hidden; border-radius:24px; position:relative; }
    .frame > div { width:100%; height:100%; }
    .caption { color:#8A8F98; font-size:11px; padding:6px 2px 10px; }
  </style>
  <div class="wrap">
    <div class="frame">${body}</div>
    <div class="caption">${escapeHtml(label || "")} · ${width}×${height}pt</div>
  </div>
  <script>${FIT_SCRIPT}</script>`
}

export function renderSheet(items) {
  const cards = items
    .map(
      item =>
        `<div style="display:inline-block;vertical-align:top;margin:10px">` +
        `<div class="frame" style="width:${item.width}px;height:${item.height}px">${item.body}</div>` +
        `<div class="caption" style="width:${item.width}px">${escapeHtml(item.label)}</div></div>`
    )
    .join("")
  return `<!doctype html><meta charset="utf-8"><style>
    * { margin:0; padding:0; }
    body { background:#0A0A0B; padding:8px; font-family:'Liberation Sans',sans-serif; }
    .frame { overflow:hidden; border-radius:24px; }
    .frame > div { width:100%; height:100%; }
    .caption { color:#8A8F98; font-size:11px; padding:6px 0 2px; }
  </style>${cards}<script>${FIT_SCRIPT}</script>`
}

export function widgetBody(widget) {
  analyze(widget)
  return renderNode(widget, true)
}
