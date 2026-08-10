// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: gray; icon-glyph: wrench;

const MINUTES_PER_HOUR = 60
const MAX_SERVICE_HOUR = 47
const DAY_MS = 24 * MINUTES_PER_HOUR * 60 * 1000
const UNKNOWN_DATE = "Date inconnue"

function normalizeText(value) {
  return String(value || "")
    .replace(/\u00A0/g, " ")
    .replace(/[‐-‒–—]/g, "-")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function normalizeTime(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return ""

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 || hours > MAX_SERVICE_HOUR ||
    minutes < 0 || minutes > 59
  ) return ""

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

function isValidTime(value) {
  return normalizeTime(value) !== ""
}

function toMinutes(value) {
  const normalized = normalizeTime(value)
  if (!normalized) return NaN
  const [hours, minutes] = normalized.split(":").map(Number)
  return hours * MINUTES_PER_HOUR + minutes
}

function durationMinutes(start, end) {
  const startMinutes = toMinutes(start)
  const endMinutes = toMinutes(end)
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return 0
  return Math.max(0, endMinutes - startMinutes)
}

function formatDuration(totalMinutes) {
  const safeMinutes = Math.max(0, Math.floor(Number(totalMinutes) || 0))
  const hours = Math.floor(safeMinutes / MINUTES_PER_HOUR)
  const minutes = safeMinutes % MINUTES_PER_HOUR
  if (!hours) return `${minutes} min`
  if (!minutes) return `${hours} h`
  return `${hours} h ${String(minutes).padStart(2, "0")}`
}

function parseDate(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  ) ? date : null
}

function isValidDate(value) {
  return value instanceof Date && Number.isFinite(value.getTime())
}

function startOfDay(date) {
  return isValidDate(date)
    ? new Date(date.getFullYear(), date.getMonth(), date.getDate())
    : null
}

function dayDifference(firstDate, secondDate) {
  const first = startOfDay(firstDate)
  const second = startOfDay(secondDate)
  if (!first || !second) return 0
  return Math.round((first.getTime() - second.getTime()) / DAY_MS)
}

function formatDateLong(date) {
  return isValidDate(date)
    ? date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
    : UNKNOWN_DATE
}

function formatDateFull(date) {
  return isValidDate(date)
    ? date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : UNKNOWN_DATE
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase()
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’`]/g, "'")
    .replace(/[^A-Z0-9']/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

function errorMessage(error) {
  return error?.message?.trim?.() || String(error || "Erreur inconnue")
}

function normalizeTelemetryCode(value, fallback = "UNKNOWN_ERROR") {
  return String(value || fallback || "UNKNOWN_ERROR")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .slice(0, 64) || "UNKNOWN_ERROR"
}

function normalizeTelemetryStage(value, fallback = "runtime") {
  return String(value || fallback || "runtime")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 50) || "runtime"
}

function createTelemetryError(code, stage, message, cause = null) {
  const error = new Error(String(message || code || "Erreur inconnue."))
  error.telemetryCode = normalizeTelemetryCode(code)
  error.telemetryStage = normalizeTelemetryStage(stage)
  if (cause) {
    try { error.cause = cause } catch (_) {}
  }
  return error
}

function hasTelemetryError(error) {
  return Boolean(
    error && typeof error === "object" &&
    typeof error.telemetryCode === "string" && error.telemetryCode.trim()
  )
}

function telemetryFromError(error, fallbackCode, fallbackStage) {
  return {
    code: normalizeTelemetryCode(error?.telemetryCode, fallbackCode),
    stage: normalizeTelemetryStage(error?.telemetryStage, fallbackStage)
  }
}

function sleep(milliseconds) {
  return new Promise(resolve => Timer.schedule(
    Math.max(0, Number(milliseconds) || 0) / 1000,
    false,
    resolve
  ))
}

function hasPlainTextInput() {
  return Array.isArray(args.plainTexts) && args.plainTexts.length > 0
}

function isShortcutExecution() {
  const parameter = args.shortcutParameter
  return Boolean(
    config.runsWithSiri ||
    (parameter !== null && parameter !== undefined) ||
    hasPlainTextInput()
  )
}

function getShortcutInput() {
  const parameter = args.shortcutParameter
  if (typeof parameter === "string") return parameter
  if (Array.isArray(parameter)) return parameter.join("\n")
  if (hasPlainTextInput()) return args.plainTexts.join("\n")

  if (parameter && typeof parameter === "object") {
    if (typeof parameter.text === "string") return parameter.text
    if (typeof parameter.value === "string") return parameter.value
    if (Array.isArray(parameter.texts)) return parameter.texts.join("\n")
  }
  return ""
}

async function finishWithResult({ success, title, message, output = {} }) {
  const result = {
    success: Boolean(success),
    title: String(title || ""),
    message: String(message || ""),
    ...output
  }

  if (isShortcutExecution()) {
    Script.setShortcutOutput(result)
    return result
  }

  const alert = new Alert()
  alert.title = result.title
  alert.message = result.message
  alert.addAction("OK")
  await alert.present()
  return result
}

function finishSuccess(title, message, output = {}) {
  return finishWithResult({ success: true, title, message, output })
}

function finishError(title, message, output = {}) {
  return finishWithResult({ success: false, title, message, output })
}

function safeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message || String(error),
      stack: error.stack || ""
    }
  }
  return { name: "Error", message: String(error || "Erreur inconnue"), stack: "" }
}

module.exports = {
  normalizeText,
  normalizeTime,
  isValidTime,
  toMinutes,
  durationMinutes,
  formatDuration,
  parseDate,
  isValidDate,
  startOfDay,
  dayDifference,
  formatDateLong,
  formatDateFull,
  escapeRegex,
  normalizeCode,
  normalizeKey,
  errorMessage,
  normalizeTelemetryCode,
  normalizeTelemetryStage,
  createTelemetryError,
  hasTelemetryError,
  telemetryFromError,
  sleep,
  isShortcutExecution,
  getShortcutInput,
  finishWithResult,
  finishSuccess,
  finishError,
  safeError
}
