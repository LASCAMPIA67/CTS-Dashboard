// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: paintpalette;

/*
 * Palette calibrée pour la lecture en plein soleil.
 *
 * Un écran d'iPhone en plein jour reçoit une lumière ambiante qui se
 * réfléchit sur la dalle et s'ajoute également au texte et au fond. Cet
 * apport commun écrase les rapports de contraste : un écart confortable
 * en intérieur devient illisible dehors. La seule parade est d'augmenter
 * le contraste natif, donc d'assombrir franchement le fond et d'éclaircir
 * le texte, sans perdre la couleur qui identifie l'état.
 *
 * Chaque teinte est donc conservée mais très désaturée en luminance : le
 * bleu reste bleu, le vert reste vert, à un niveau proche du noir. Les
 * accents, eux, montent en luminosité pour rester lisibles et distincts.
 *
 * Cibles vérifiées sur le pire cas — coin le plus clair du dégradé,
 * recouvert du voile blanc le plus opaque d'une carte :
 *   texte principal ≥ 12:1, texte secondaire ≥ 7:1, accent ≥ 7:1.
 */
const GRADIENT_LOCATIONS = Object.freeze([0, 0.32, 0.68, 1])
const PALETTES = Object.freeze({
  NEXT: Object.freeze({ gradient: ["#122435", "#0C1A2C", "#07111D", "#03080F"], accent: "#98CCFF" }),
  BEFORE: Object.freeze({ gradient: ["#122435", "#0C1A2C", "#07111D", "#03080F"], accent: "#98CCFF" }),
  WORK: Object.freeze({ gradient: ["#0B2620", "#081D18", "#051310", "#020908"], accent: "#6FE0AF" }),
  PAUSE: Object.freeze({ gradient: ["#2B1D0F", "#20160B", "#150E07", "#090603"], accent: "#FFC96B" }),
  CUT: Object.freeze({ gradient: ["#251937", "#1B1229", "#110B1B", "#08050D"], accent: "#D6B2FF" }),
  DONE: Object.freeze({ gradient: ["#1F2126", "#17191D", "#0F1013", "#070809"], accent: "#D6DBE2" }),
  UNKNOWN: Object.freeze({ gradient: ["#1A1F27", "#13171D", "#0C0F13", "#05070A"], accent: "#B9C4D2" })
})

const COLORS = Object.freeze({
  primaryText: "#FFFFFF",
  secondaryText: "#D3DAE3",
  inactiveText: "#EDF0F4",
  inactiveTime: "#E4E9EF",
  errorBackground: "#12070A"
})

function createBaseWidget(stateType) {
  const widget = new ListWidget()
  widget.backgroundGradient = createGradient(getGradientColors(stateType))
  return widget
}

function createGradient(colors) {
  const gradient = new LinearGradient()
  gradient.locations = [...GRADIENT_LOCATIONS]
  gradient.colors = colors.map(hex => new Color(hex))
  gradient.startPoint = new Point(0, 0)
  gradient.endPoint = new Point(1, 1)
  return gradient
}

function getPalette(stateType) {
  return PALETTES[normalizeStateType(stateType)] || PALETTES.UNKNOWN
}

function normalizeStateType(value) {
  const normalized = String(value || "").trim().toUpperCase()
  return Object.prototype.hasOwnProperty.call(PALETTES, normalized)
    ? normalized
    : "UNKNOWN"
}

function clampOpacity(value) {
  const opacity = Number(value)
  return Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 0
}

function getGradientColors(stateType) { return [...getPalette(stateType).gradient] }
function getAccentHex(stateType) { return getPalette(stateType).accent }
function getAccentColor(stateType) { return new Color(getAccentHex(stateType)) }
function getSecondaryColor() { return new Color(COLORS.secondaryText) }
function getPrimaryTextColor() { return new Color(COLORS.primaryText) }
function getInactiveTextColor() { return new Color(COLORS.inactiveText) }
function getInactiveTimeColor() { return new Color(COLORS.inactiveTime) }
function getErrorBackgroundColor() { return new Color(COLORS.errorBackground) }
function translucentWhite(opacity) { return new Color("#FFFFFF", clampOpacity(opacity)) }

module.exports = {
  createBaseWidget,
  getGradientColors,
  getAccentHex,
  getAccentColor,
  getSecondaryColor,
  getPrimaryTextColor,
  getInactiveTextColor,
  getInactiveTimeColor,
  getErrorBackgroundColor,
  translucentWhite,
  normalizeStateType
}
