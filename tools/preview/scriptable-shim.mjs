/*
 * Émulation minimale de l'API Scriptable utilisée par CTS Widget Renderer.
 *
 * Le but n'est pas de reproduire iOS au pixel près — c'est impossible sans
 * la police San Francisco — mais de rejouer la MISE EN PAGE réelle du
 * moteur de rendu : imbrication des piles, ressorts souples et fixes,
 * largeurs imposées, réduction de police avant troncature, dégradés et
 * couleurs. Ce sont exactement les propriétés que l'on cherche à valider :
 * symétrie, équilibre, alignement, contraste.
 *
 * Chaque objet produit un arbre décrivant la mise en page ; le rendu HTML
 * est fait par html.mjs, la capture par Chromium.
 */

export class Size {
  constructor(width, height) {
    this.width = width
    this.height = height
  }
}

export class Point {
  constructor(x, y) {
    this.x = x
    this.y = y
  }
}

export class Color {
  constructor(hex, alpha = 1) {
    this.hex = String(hex || "#000000")
    this.alpha = alpha
  }
  static white() {
    return new Color("#FFFFFF")
  }
  static black() {
    return new Color("#000000")
  }
  css() {
    const raw = this.hex.replace("#", "")
    const full = raw.length === 3 ? [...raw].map(c => c + c).join("") : raw
    const r = parseInt(full.slice(0, 2), 16)
    const g = parseInt(full.slice(2, 4), 16)
    const b = parseInt(full.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${this.alpha})`
  }
}

export class Font {
  constructor(size, weight, monospaced = false) {
    this.size = size
    this.weight = weight
    this.monospaced = monospaced
  }
  static systemFont(size) {
    return new Font(size, 400)
  }
  static mediumSystemFont(size) {
    return new Font(size, 500)
  }
  static semiboldSystemFont(size) {
    return new Font(size, 600)
  }
  static boldSystemFont(size) {
    return new Font(size, 700)
  }
  static boldMonospacedSystemFont(size) {
    return new Font(size, 700, true)
  }
}

export class LinearGradient {
  constructor() {
    this.colors = []
    this.locations = []
    this.startPoint = new Point(0, 0)
    this.endPoint = new Point(1, 1)
  }
}

/*
 * Les symboles SF n'existent pas hors iOS. On garde leur encombrement
 * exact — c'est lui qui compte pour la mise en page — et on dessine une
 * silhouette reconnaissable en SVG pour juger l'équilibre visuel.
 */
const SYMBOL_PATHS = {
  "arrow.right": "M3 12h16M13 6l6 6-6 6",
  "bus.fill": "M4 5h16v10H4zM6 18v2M18 18v2M4 10h16",
  "tram.fill": "M5 4h14v12H5zM9 20l-2 2M15 20l2 2M5 10h14",
  "rectangle.3.group.fill": "M3 4h8v6H3zM13 4h8v6h-8zM3 12h18v8H3z",
  "exclamationmark.triangle.fill": "M12 3l9 17H3zM12 9v5M12 17v.5",
  "tray.and.arrow.down.fill": "M4 14h16v6H4zM12 3v8M8 8l4 4 4-4"
}

export class SFSymbol {
  constructor(name) {
    this.name = name
    this.image = { symbol: name }
  }
  static named(name) {
    return SYMBOL_PATHS[name] ? new SFSymbol(name) : null
  }
  applyFont() {}
}

export function symbolPath(name) {
  return SYMBOL_PATHS[name] || SYMBOL_PATHS["arrow.right"]
}

class WidgetText {
  constructor(value) {
    this.kind = "text"
    this.value = String(value)
    this.font = Font.systemFont(12)
    this.textColor = Color.white()
    this.lineLimit = 0
    this.minimumScaleFactor = 1
    this.align = "left"
  }
  leftAlignText() {
    this.align = "left"
    return this
  }
  centerAlignText() {
    this.align = "center"
    return this
  }
  rightAlignText() {
    this.align = "right"
    return this
  }
}

class WidgetImage {
  constructor(image) {
    this.kind = "image"
    this.symbol = image?.symbol || "arrow.right"
    this.imageSize = new Size(16, 16)
    this.tintColor = Color.white()
  }
}

class WidgetSpacer {
  constructor(length) {
    this.kind = "spacer"
    this.length = length
  }
}

class WidgetStack {
  constructor() {
    this.kind = "stack"
    this.children = []
    this.vertical = false
    this.centered = false
    this.padding = [0, 0, 0, 0]
    this.size = new Size(0, 0)
    this.cornerRadius = 0
    this.backgroundColor = null
    this.backgroundGradient = null
    this.borderWidth = 0
    this.borderColor = null
  }
  addStack() {
    const stack = new WidgetStack()
    this.children.push(stack)
    return stack
  }
  addText(value) {
    const text = new WidgetText(value)
    this.children.push(text)
    return text
  }
  addImage(image) {
    const node = new WidgetImage(image)
    this.children.push(node)
    return node
  }
  addSpacer(length) {
    const spacer = new WidgetSpacer(length)
    this.children.push(spacer)
    return spacer
  }
  layoutVertically() {
    this.vertical = true
  }
  layoutHorizontally() {
    this.vertical = false
  }
  centerAlignContent() {
    this.centered = true
  }
  topAlignContent() {
    this.centered = false
  }
  setPadding(top, right, bottom, left) {
    this.padding = [top, right, bottom, left]
  }
}

export class ListWidget extends WidgetStack {
  constructor() {
    super()
    this.vertical = true
    this.refreshAfterDate = null
  }
}

export function installGlobals(target = globalThis) {
  Object.assign(target, {
    Size,
    Point,
    Color,
    Font,
    LinearGradient,
    SFSymbol,
    ListWidget
  })
}
