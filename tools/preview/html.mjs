import { symbolPath } from "./scriptable-shim.mjs"

// Les mesures gardent Liberation, pessimiste ; les images prennent Inter, plus proche de San Francisco. Voir CALIBRATION.md.
export const IMAGE_FONTS = ["Inter", "JetBrains Mono"]

const TYPOGRAPHY =
  process.env.PREVIEW_MODE === "images"
    ? { sans: `'${IMAGE_FONTS[0]}', sans-serif`, mono: `'${IMAGE_FONTS[1]}', monospace`, lineHeight: 1.05 }
    : { sans: "'Liberation Sans', sans-serif", mono: "'Liberation Mono', monospace", lineHeight: 1.2 }

const LINE_HEIGHT = Number(process.env.PREVIEW_LINE_HEIGHT) || TYPOGRAPHY.lineHeight
const TRACKING = Number(process.env.PREVIEW_TRACKING)
const LETTER_SPACING = Number.isFinite(TRACKING) ? TRACKING : -0.012

// Une pile ne s'étend sur son axe que si un ressort souple est parmi ses enfants directs.
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
  const alongMain = children.some(child => child.kind === "spacer" && child.flexible)
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
  return `background-image: linear-gradient(135deg, ${stops});`
}

function boxStyle(node, parentVertical) {
  const style = []
  style.push(`display:flex`)
  style.push(`flex-direction:${node.vertical ? "column" : "row"}`)
  // centerAlignContent() ne centre que dans une pile horizontale, comme sur iPhone.
  const centered = node.centered && !node.vertical
  style.push(`align-items:${centered ? "center" : "flex-start"}`)
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

  const mainExpands = parentVertical ? node.expandsV : node.expandsH
  const crossExpands = parentVertical ? node.expandsH : node.expandsV
  if (mainExpands && !(parentVertical ? node.size?.height > 0 : node.size?.width > 0)) {
    style.push(`flex-grow:1`)
  }
  if (crossExpands) style.push(`align-self:stretch`)

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
    const family = font.monospaced ? TYPOGRAPHY.mono : TYPOGRAPHY.sans
    const style = [
      `font-family:${family}`,
      `font-size:${font.size}px`,
      `font-weight:${font.weight}`,
      `color:${node.textColor.css()}`,
      `text-align:${node.align}`,
      `white-space:nowrap`,
      `overflow:hidden`,
      `min-width:0`,
      `letter-spacing:${(font.monospaced ? LETTER_SPACING - 0.008 : LETTER_SPACING).toFixed(4)}em`,
      `line-height:${LINE_HEIGHT}`
    ].join(";")
    const attrs = `data-fit="1" data-size="${font.size}" data-min="${node.minimumScaleFactor}"`
    // centerAlignText() centre les glyphes dans leur cadre : jamais d'étirement dans une pile verticale.
    const width = node.align === "left" || parentVertical ? "" : "align-self:stretch;"
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

export function renderImage(item) {
  return `<!doctype html><meta charset="utf-8"><style>
    * { margin:0; padding:0; }
    html, body { background:transparent; }
    .frame { width:${item.width}px; height:${item.height}px; overflow:hidden; border-radius:24px; }
    .frame > div { width:100%; height:100%; }
  </style><div class="frame">${item.body}</div><script>${FIT_SCRIPT}</script>`
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
