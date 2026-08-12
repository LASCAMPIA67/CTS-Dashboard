/*
 * Émulation de l'UITable de Scriptable, suffisante pour rejouer les pages
 * de CTS Installer : progression, résultat et diagnostic.
 *
 * Une UITable est une liste de lignes de hauteur fixe. Chaque ligne
 * contient des cellules — texte à deux niveaux, ou image — réparties
 * proportionnellement à leur `widthWeight`. C'est tout le modèle, ce qui
 * le rend fidèle à reproduire, contrairement au widget.
 */

export class Color {
  constructor(hex, alpha = 1) {
    this.hex = String(hex || "#000000")
    this.alpha = alpha
    this.light = null
    this.dark = null
  }
  static dynamic(light, dark) {
    const color = new Color(light.hex, light.alpha)
    color.light = light
    color.dark = dark
    return color
  }
  static white() {
    return new Color("#FFFFFF")
  }
  static black() {
    return new Color("#000000")
  }
  resolve(scheme) {
    if (!this.light || !this.dark) return this
    return scheme === "dark" ? this.dark : this.light
  }
  css(scheme) {
    const resolved = this.resolve(scheme)
    const raw = resolved.hex.replace("#", "")
    const full = raw.length === 3 ? [...raw].map(c => c + c).join("") : raw
    const [r, g, b] = [0, 1, 2].map(i => parseInt(full.slice(i * 2, i * 2 + 2), 16))
    return `rgba(${r}, ${g}, ${b}, ${resolved.alpha})`
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
  static monospacedSystemFont(size) {
    return new Font(size, 400, true)
  }
  static boldMonospacedSystemFont(size) {
    return new Font(size, 700, true)
  }
}

/*
 * Les symboles SF n'existent pas hors iOS. On garde leur encombrement et
 * on dessine une silhouette : ce qui compte ici est la hauteur des lignes
 * et l'équilibre des colonnes, pas le dessin exact du pictogramme.
 */
export class SFSymbol {
  constructor(name) {
    this.name = name
    this.image = { symbol: name }
  }
  static named(name) {
    return new SFSymbol(name)
  }
  applyFont(font) {
    this.font = font
  }
}

class UITableCell {
  constructor(kind) {
    this.kind = kind
    this.widthWeight = 0
    this.titleFont = null
    this.subtitleFont = null
    this.titleColor = null
    this.subtitleColor = null
    this.centered = false
    this.left = true
    this.right = false
  }
  centerAligned() {
    this.centered = true
    this.left = false
  }
  leftAligned() {
    this.left = true
    this.centered = false
  }
  rightAligned() {
    this.right = true
    this.left = false
  }
}

export class UITableRow {
  constructor() {
    this.cells = []
    this.height = 44
    this.isHeader = false
    this.dismissOnSelect = true
    this.backgroundColor = null
    this.onSelect = null
  }
  addText(title, subtitle) {
    const cell = new UITableCell("text")
    cell.title = title === undefined || title === null ? "" : String(title)
    cell.subtitle = subtitle === undefined || subtitle === null ? "" : String(subtitle)
    this.cells.push(cell)
    return cell
  }
  addImage(image) {
    const cell = new UITableCell("image")
    cell.symbol = image?.symbol || "circle"
    this.cells.push(cell)
    return cell
  }
  addButton(title) {
    return this.addText(title, "")
  }
}

export class UITable {
  constructor() {
    this.rows = []
    this.showSeparators = false
  }
  addRow(row) {
    this.rows.push(row)
  }
  removeAllRows() {
    this.rows = []
  }
  reload() {}
  present() {
    return Promise.resolve()
  }
}

export function totalHeight(table) {
  return table.rows.reduce((sum, row) => sum + row.height, 0)
}
