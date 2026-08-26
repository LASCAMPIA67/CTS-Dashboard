// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: doc.text.magnifyingglass;

const CONFIG = importModule("CTS Config")
const UTILS = importModule("CTS Utils")
const { fm, paths, files, pdf } = CONFIG
const errorMessage = UTILS.errorMessage
const PDFJS_VERSION = "6.1.200"

const PDFJS_BASE_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/legacy/build`

const PDFJS_URLS = {
  library: `${PDFJS_BASE_URL}/pdf.min.mjs`,

  worker: `${PDFJS_BASE_URL}/pdf.worker.min.mjs`
}

const ENGINE_METADATA_PATH = fm.joinPath(paths.pdfEngine, "engine.json")
const DOWNLOAD_TIMEOUT_SECONDS = 30
const ENGINE_START_TIMEOUT_MS = 20000
const MINIMUM_LIBRARY_SIZE_KB = 40
const FILE_READ_ATTEMPTS = 4
const FILE_READ_RETRY_MS = 250
const ICLOUD_READY_ATTEMPTS = 8
const ICLOUD_DOWNLOAD_TIMEOUT_MS = 12000
const WEBVIEW_LOAD_TIMEOUT_MS = 15000

function widgetBudget(key, fallback) {
  if (UTILS.runsInApplication()) return fallback

  const value = Number(pdf[key])

  return Number.isFinite(value) && value > 0 ? value : fallback
}

function callMargin() {
  return widgetBudget("widgetCallMarginMs", WEBVIEW_CALL_MARGIN_MS)
}

function budgets() {
  const load = loadTimeout()
  const engine = engineTimeout() + callMargin()
  const extraction = extractionTimeout() + callMargin()

  return { load, engine, extraction, total: load + engine + extraction }
}

function loadTimeout() {
  return widgetBudget("widgetLoadTimeoutMs", WEBVIEW_LOAD_TIMEOUT_MS)
}

function engineTimeout() {
  return widgetBudget("widgetEngineTimeoutMs", ENGINE_START_TIMEOUT_MS)
}

function extractionTimeout() {
  return widgetBudget(
    "widgetExtractionTimeoutMs",
    Math.max(1000, Number(pdf.extractionTimeoutMs) || 25000)
  )
}
const WEBVIEW_CALL_MARGIN_MS = 5000
const ICLOUD_READY_RETRY_MS = 150

async function ensureReady() {
  CONFIG.ensureDirectories()

  const library = await ensureLibraryFile(
    files.pdfJs,
    PDFJS_URLS.library,
    "Bibliothèque PDF.js",
    "library"
  )

  const worker = await ensureLibraryFile(
    files.pdfWorker,
    PDFJS_URLS.worker,
    "Worker PDF.js",
    "worker"
  )

  /*
   * Les métadonnées décrivent une installation : elles ne s'écrivent donc
   * qu'au moment où le moteur en reçoit une. Les réécrire à chaque lecture
   * revenait à écrire dans iCloud à chaque réveil du widget, pour un
   * fichier dont le contenu ne bouge pas.
   */
  if (library.installed || worker.installed) {
    await writeEngineMetadata()
  }

  return {
    ready: true,

    version: PDFJS_VERSION,

    libraryPath: files.pdfJs,

    workerPath: files.pdfWorker
  }
}

async function ensureLibraryFile(destinationPath, remoteUrl, label, component) {
  if (await isValidLibraryFile(destinationPath, component)) {
    return { installed: false }
  }

  await downloadLibraryFile(destinationPath, remoteUrl, label, component)

  if (!(await isValidLibraryFile(destinationPath, component))) {
    throw createTelemetryError(
      component === "worker" ? "PDF_ENGINE_WORKER_INVALID" : "PDF_ENGINE_LIBRARY_INVALID",

      "engine_install",

      `${label} téléchargé, mais le fichier obtenu est invalide.`
    )
  }

  return { installed: true }
}

async function isValidLibraryFile(path, component) {
  if (!fm.fileExists(path)) {
    return false
  }

  try {
    await ensureDownloaded(path, {
      missingCode:
        component === "worker" ? "PDF_ENGINE_WORKER_MISSING" : "PDF_ENGINE_LIBRARY_MISSING",

      downloadCode:
        component === "worker"
          ? "PDF_ENGINE_WORKER_ICLOUD_FAILED"
          : "PDF_ENGINE_LIBRARY_ICLOUD_FAILED",

      stage: "engine_install"
    })

    const sizeKilobytes = fm.fileSize(path)

    return Boolean(Number.isFinite(sizeKilobytes) && sizeKilobytes >= MINIMUM_LIBRARY_SIZE_KB)
  } catch (_) {
    return false
  }
}

async function downloadLibraryFile(destinationPath, remoteUrl, label, component) {
  const temporaryPath = `${destinationPath}.download`

  removeFileQuietly(temporaryPath)

  const request = new Request(remoteUrl)

  request.timeoutInterval = DOWNLOAD_TIMEOUT_SECONDS

  let data

  try {
    data = await request.load()
  } catch (error) {
    throw createTelemetryError(
      component === "worker"
        ? "PDF_ENGINE_WORKER_DOWNLOAD_FAILED"
        : "PDF_ENGINE_LIBRARY_DOWNLOAD_FAILED",

      "engine_install",

      `${label} impossible à télécharger : ${errorMessage(error)}`,

      error
    )
  }

  const statusCode = Number(request.response?.statusCode)

  if (Number.isFinite(statusCode) && (statusCode < 200 || statusCode >= 300)) {
    throw createTelemetryError(
      component === "worker" ? "PDF_ENGINE_WORKER_HTTP_ERROR" : "PDF_ENGINE_LIBRARY_HTTP_ERROR",

      "engine_install",

      `${label} impossible à télécharger : réponse HTTP ${statusCode}.`
    )
  }

  if (!data) {
    throw createTelemetryError(
      component === "worker"
        ? "PDF_ENGINE_WORKER_EMPTY_DOWNLOAD"
        : "PDF_ENGINE_LIBRARY_EMPTY_DOWNLOAD",

      "engine_install",

      `${label} impossible à télécharger : réponse vide.`
    )
  }

  try {
    fm.write(temporaryPath, data)

    const downloadedSizeKilobytes = fm.fileSize(temporaryPath)

    if (
      !Number.isFinite(downloadedSizeKilobytes) ||
      downloadedSizeKilobytes < MINIMUM_LIBRARY_SIZE_KB
    ) {
      throw new Error("Le fichier téléchargé est anormalement petit.")
    }

    removeFileQuietly(destinationPath)

    fm.move(temporaryPath, destinationPath)
  } catch (error) {
    removeFileQuietly(temporaryPath)

    throw createTelemetryError(
      component === "worker"
        ? "PDF_ENGINE_WORKER_WRITE_FAILED"
        : "PDF_ENGINE_LIBRARY_WRITE_FAILED",

      "engine_install",

      `${label} impossible à enregistrer : ${errorMessage(error)}`,

      error
    )
  }
}

async function writeEngineMetadata() {
  const metadata = {
    engine: "PDF.js",

    version: PDFJS_VERSION,

    installedAt: new Date().toISOString(),

    loadingMode: "local-blob-module",

    files: {
      library: "pdf.min.mjs",

      worker: "pdf.worker.min.mjs"
    }
  }

  /*
   * Ce fichier n'est lu par personne : ni le widget, ni le Diagnostic, ni
   * l'installateur. Il documente l'installation, rien de plus.
   *
   * Son écriture levait pourtant une erreur, et cet appel se trouvait sur
   * le chemin de toute lecture de PDF. Un collègue dont ce seul fichier ne
   * pouvait pas s'écrire n'a jamais pu lire une seule carte agent : 132
   * tentatives, 132 échecs, pour un fichier que rien n'ouvre. Ce qui ne
   * sert à personne ne doit pouvoir arrêter personne.
   *
   * Rien n'est perdu côté diagnostic : les deux fichiers dont dépend
   * réellement le moteur sont contrôlés juste au-dessus, et signalent leur
   * absence, leur téléchargement manqué ou leur taille anormale sous leur
   * propre code.
   */
  try {
    fm.writeString(
      ENGINE_METADATA_PATH,

      JSON.stringify(metadata, null, 2)
    )
  } catch (_) {}
}

async function extractText(pdfPath) {
  await ensureReady()

  await validatePdfPath(pdfPath)

  const libraryBase64 = await readFileAsBase64(
    files.pdfJs,

    "La bibliothèque PDF.js",

    {
      missingCode: "PDF_ENGINE_LIBRARY_MISSING",

      downloadCode: "PDF_ENGINE_LIBRARY_ICLOUD_FAILED",

      readCode: "PDF_ENGINE_LIBRARY_READ_FAILED",

      base64Code: "PDF_ENGINE_LIBRARY_BASE64_FAILED",

      stage: "engine"
    }
  )

  const workerBase64 = await readFileAsBase64(
    files.pdfWorker,

    "Le worker PDF.js",

    {
      missingCode: "PDF_ENGINE_WORKER_MISSING",

      downloadCode: "PDF_ENGINE_WORKER_ICLOUD_FAILED",

      readCode: "PDF_ENGINE_WORKER_READ_FAILED",

      base64Code: "PDF_ENGINE_WORKER_BASE64_FAILED",

      stage: "engine"
    }
  )

  const pdfBase64 = await readFileAsBase64(
    pdfPath,

    "Le PDF",

    {
      missingCode: "PDF_SOURCE_NOT_FOUND",

      downloadCode: "PDF_ICLOUD_DOWNLOAD_FAILED",

      readCode: "PDF_READ_FAILED",

      base64Code: "PDF_BASE64_FAILED",

      stage: "source"
    }
  )

  let webView

  try {
    webView = new WebView()
  } catch (error) {
    throw createTelemetryError(
      "PDF_ENGINE_WEBVIEW_CREATE_FAILED",
      "engine",
      `Le moteur PDF ne peut pas créer sa WebView : ${errorMessage(error)}`,
      error
    )
  }

  const runtimeHtml = buildRuntimeHtml(libraryBase64, workerBase64)

  try {
    const loaded = await UTILS.withTimeout(
      webView.loadHTML(runtimeHtml).then(() => "loaded"),
      loadTimeout()
    )

    if (loaded !== "loaded") {
      throw new Error("la WebView n’a pas répondu dans le délai imparti.")
    }
  } catch (error) {
    throw createTelemetryError(
      "PDF_ENGINE_WEBVIEW_LOAD_FAILED",
      "engine",
      `Le moteur PDF ne peut pas être chargé : ${errorMessage(error)}`,
      error
    )
  }

  const readiness = await waitForEngine(webView)

  if (!readiness.ok) {
    throw createTelemetryError(
      readiness.code || "PDF_ENGINE_INIT_FAILED",

      "engine",

      readiness.error || "Le moteur PDF ne s’est pas initialisé."
    )
  }

  const rawResult = await evaluateExtraction(webView, pdfBase64)
  const result = normalizeWebResult(rawResult)

  if (!result.ok) {
    throw createTelemetryError(
      result.code || "PDF_EXTRACTION_FAILED",

      "extraction",

      describeExtractionFailure(result)
    )
  }

  const text = normalizeExtractedText(result.text)

  if (text.length < pdf.minimumTextLength) {
    throw createTelemetryError(
      "PDF_TEXT_INSUFFICIENT",
      "extraction",
      "Le PDF ne contient pas assez de texte exploitable."
    )
  }

  return {
    text,

    pageCount: Number(result.pageCount) || 0,

    characterCount: text.length,

    engine: "PDF.js",

    engineVersion: PDFJS_VERSION
  }
}

async function validatePdfPath(path) {
  if (typeof path !== "string" || !path.trim()) {
    throw createTelemetryError(
      "PDF_PATH_MISSING",
      "source",
      "Aucun chemin de PDF n’a été fourni."
    )
  }

  if (!fm.fileExists(path)) {
    throw createTelemetryError(
      "PDF_SOURCE_NOT_FOUND",
      "source",
      "Le fichier PDF est introuvable."
    )
  }

  if (!String(path).toLowerCase().endsWith(pdf.extension)) {
    throw createTelemetryError(
      "PDF_INVALID_EXTENSION",
      "source",
      "Le fichier sélectionné n’est pas un PDF."
    )
  }

  await ensureDownloaded(path, {
    missingCode: "PDF_SOURCE_NOT_FOUND",

    downloadCode: "PDF_ICLOUD_DOWNLOAD_FAILED",

    stage: "source"
  })

  const fileSizeKilobytes = await readFileSizeWithRetry(path, {
    code: "PDF_METADATA_READ_FAILED",

    stage: "source",

    label: "La taille du fichier PDF"
  })

  if (!Number.isFinite(fileSizeKilobytes) || fileSizeKilobytes <= 0) {
    throw createTelemetryError(
      "PDF_EMPTY_OR_INACCESSIBLE",
      "source",
      "Le fichier PDF reste vide ou inaccessible après plusieurs tentatives."
    )
  }

  const maximumFileSizeBytes = Math.max(
    1,

    Number(pdf.maximumFileSizeBytes) || 20 * 1024 * 1024
  )

  const maximumFileSizeKilobytes = maximumFileSizeBytes / 1024

  if (fileSizeKilobytes > maximumFileSizeKilobytes) {
    const maximumMb = Math.round(maximumFileSizeBytes / 1024 / 1024)

    throw createTelemetryError(
      "PDF_TOO_LARGE",
      "source",

      `Le PDF dépasse la limite autorisée de ${maximumMb} Mo.`
    )
  }
}

async function readFileAsBase64(path, label, codes) {
  await ensureDownloaded(path, {
    missingCode: codes.missingCode,

    downloadCode: codes.downloadCode,

    stage: codes.stage
  })

  const data = await readFileDataWithRetry(path, label, codes)
  let base64

  try {
    base64 = data.toBase64String()
  } catch (error) {
    throw createTelemetryError(
      codes.base64Code,
      codes.stage,

      `${label} ne peut pas être converti en Base64.`,

      error
    )
  }

  if (!base64) {
    throw createTelemetryError(
      codes.base64Code,
      codes.stage,

      `${label} ne peut pas être converti en Base64.`
    )
  }

  return base64
}

async function readFileDataWithRetry(path, label, codes) {
  let lastError = null

  for (let attempt = 1; attempt <= FILE_READ_ATTEMPTS; attempt++) {
    try {
      if (!fm.fileExists(path)) {
        throw createTelemetryError(codes.missingCode, codes.stage, `${label} est introuvable.`)
      }

      if (!fm.isFileDownloaded(path)) {
        await ensureDownloaded(path, {
          missingCode: codes.missingCode,

          downloadCode: codes.downloadCode,

          stage: codes.stage
        })
      }

      const data = fm.read(path)

      if (data) {
        return data
      }

      lastError = new Error(`${label} est momentanément indisponible.`)
    } catch (error) {
      if (
        error?.telemetryCode === codes.missingCode ||
        error?.telemetryCode === codes.downloadCode
      ) {
        throw error
      }

      lastError = error
    }

    if (attempt < FILE_READ_ATTEMPTS) {
      await sleep(FILE_READ_RETRY_MS * attempt)
    }
  }

  throw createTelemetryError(
    codes.readCode,
    codes.stage,

    lastError
      ? `${label} ne peut pas être lu après ${FILE_READ_ATTEMPTS} tentatives : ${errorMessage(lastError)}`
      : `${label} reste vide ou inaccessible après ${FILE_READ_ATTEMPTS} tentatives.`,

    lastError
  )
}

async function readFileSizeWithRetry(path, { code, stage, label }) {
  let lastError = null

  for (let attempt = 1; attempt <= FILE_READ_ATTEMPTS; attempt++) {
    try {
      const value = fm.fileSize(path)

      if (Number.isFinite(value) && value > 0) {
        return value
      }

      lastError = new Error(`${label} est momentanément indisponible.`)
    } catch (error) {
      lastError = error
    }

    if (attempt < FILE_READ_ATTEMPTS) {
      await sleep(FILE_READ_RETRY_MS * attempt)
    }
  }

  if (lastError) {
    throw createTelemetryError(
      code,
      stage,
      `${label} ne peut pas être lue après plusieurs tentatives : ${errorMessage(lastError)}`,
      lastError
    )
  }

  return 0
}

async function waitForEngine(webView) {
  const script = `
    (() => {
      const startedAt = Date.now()
      let completed = false

      const finish = value => {
        if (completed) {
          return
        }

        completed = true
        completion(value)
      }

      const check = () => {
        if (
          window.__ctsPdfReady === true
        ) {
          finish({
            ok: true,
            code: "",
            error: ""
          })

          return
        }

        if (
          window.__ctsPdfBootError
        ) {
          finish({
            ok: false,

            code:
              "PDF_ENGINE_BOOT_FAILED",

            error: String(
              window.__ctsPdfBootError
            )
          })

          return
        }

        if (
          Date.now() - startedAt >
          ${engineTimeout()}
        ) {
          finish({
            ok: false,

            code:
              "PDF_ENGINE_INIT_TIMEOUT",

            error:
              "Délai dépassé pendant l’initialisation de PDF.js."
          })

          return
        }

        setTimeout(
          check,
          50
        )
      }

      check()
    })()
  `

  try {
    const result = await UTILS.withTimeout(
      webView.evaluateJavaScript(script, true),
      engineTimeout() + callMargin(),
      { ok: false, code: "PDF_ENGINE_INIT_TIMEOUT", error: "PDF.js n’a pas répondu." }
    )

    return normalizeWebResult(result)
  } catch (error) {
    return {
      ok: false,

      code: "PDF_ENGINE_INIT_FAILED",

      error: `Initialisation PDF.js impossible : ${errorMessage(error)}`
    }
  }
}

async function evaluateExtraction(webView, pdfBase64) {
  const timeoutMs = extractionTimeout()

  const encodedPdf = JSON.stringify(pdfBase64)

  const script = `
    (() => {
      let completed = false

      const finish = value => {
        if (completed) {
          return
        }

        completed = true
        completion(value)
      }

      const timeout =
        setTimeout(
          () => {
            finish({
              ok: false,

              code:
                "PDF_EXTRACTION_TIMEOUT",

              error:
                "Délai dépassé pendant l’extraction du PDF."
            })
          },
          ${timeoutMs}
        )

      Promise.resolve()
        .then(
          () =>
            window.__ctsExtractPdfText(
              ${encodedPdf}
            )
        )
        .then(result => {
          clearTimeout(timeout)
          finish(result)
        })
        .catch(error => {
          clearTimeout(timeout)

          finish({
            ok: false,

            code:
              "PDF_EXTRACTION_FAILED",

            error:
              error &&
              error.message
                ? String(
                    error.message
                  )
                : String(error)
          })
        })
    })()
  `

  try {
    return await UTILS.withTimeout(
      webView.evaluateJavaScript(script, true),
      timeoutMs + callMargin(),
      {
        ok: false,
        code: "PDF_EXTRACTION_TIMEOUT",
        error: "La lecture du PDF n’a pas répondu dans le délai imparti."
      }
    )
  } catch (error) {
    return {
      ok: false,

      code: "PDF_EXTRACTION_BRIDGE_FAILED",

      error: `Extraction PDF impossible : ${errorMessage(error)}`
    }
  }
}

function buildRuntimeHtml(libraryBase64, workerBase64) {
  const encodedLibrary = JSON.stringify(libraryBase64)
  const encodedWorker = JSON.stringify(workerBase64)

  const streamAsyncIterationPolyfill = String.raw`
;(function () {
  try {
    if (
      typeof ReadableStream !== "function" ||
      typeof Symbol === "undefined" ||
      !Symbol.asyncIterator
    ) {
      return
    }

    var target = ReadableStream.prototype

    if (target[Symbol.asyncIterator]) {
      if (typeof self !== "undefined") {
        self.__ctsStreamAsyncIteration = "native"
      }
      return
    }

    var iterate = function (options) {
      var preventCancel = Boolean(options && options.preventCancel)
      var reader = this.getReader()
      var released = false

      var release = function () {
        if (released) return
        released = true
        try { reader.releaseLock() } catch (_) {}
      }

      return {
        next: function () {
          return reader.read().then(function (result) {
            if (result.done) release()
            return result
          }, function (error) {
            release()
            throw error
          })
        },

        return: function (value) {
          var cancelled = preventCancel || released
            ? Promise.resolve()
            : Promise.resolve(reader.cancel(value)).catch(function () {})

          return cancelled.then(function () {
            release()
            return { done: true, value: value }
          })
        },

        [Symbol.asyncIterator]: function () { return this }
      }
    }

    target[Symbol.asyncIterator] = iterate

    if (typeof target.values !== "function") {
      target.values = iterate
    }

    if (typeof self !== "undefined") {
      self.__ctsStreamAsyncIteration = "polyfill"
    }
  } catch (_) {}
})();
`

  return String.raw`<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <title>CTS PDF Engine</title>
</head>

<body>
<script>${streamAsyncIterationPolyfill}</script>
<script>
  const __ctsStreamPolyfillSource = ${JSON.stringify(streamAsyncIterationPolyfill)}
</script>
<script>
  window.__ctsPdfReady = false
  window.__ctsPdfBootError = ""
  window.__ctsPdfLib = null
  window.__ctsLibraryUrl = ""
  window.__ctsWorkerUrl = ""
  window.__ctsWorkerMode = "unknown"
  window.__ctsPdfVersion = ""

  /*
   * Détail technique joint à chaque échec. Le message brut de
   * JavaScriptCore, seul, ne permet pas de localiser la panne.
   */
  function failureDetails(error, extra) {
    const details = {
      errorName:
        (error && error.name) ||
        "",

      stack:
        String(
          (error && error.stack) ||
          ""
        )
          .split("\n")
          .slice(0, 4)
          .join(" | "),

      workerMode:
        window.__ctsWorkerMode,

      pdfVersion:
        window.__ctsPdfVersion,

      streamAsyncIteration:
        window.__ctsStreamAsyncIteration ||
        "unknown"
    }

    return Object.assign(
      details,
      extra || {}
    )
  }

  function errorText(error) {
    if (
      error &&
      typeof error.message === "string" &&
      error.message.trim()
    ) {
      return error.message.trim()
    }

    return String(
      error ||
      "Erreur PDF.js inconnue"
    )
  }

  function bytesFromBase64(base64) {
    try {
      const binary =
        atob(base64)

      const bytes =
        new Uint8Array(
          binary.length
        )

      for (
        let index = 0;
        index < binary.length;
        index++
      ) {
        bytes[index] =
          binary.charCodeAt(
            index
          )
      }

      return bytes
    } catch (error) {
      const wrapped =
        new Error(
          errorText(error)
        )

      wrapped.ctsCode =
        "PDF_BASE64_DECODE_FAILED"

      throw wrapped
    }
  }

  function moduleUrlFromBase64(base64, prelude) {
    const bytes =
      bytesFromBase64(
        base64
      )

    const parts =
      prelude
        ? [prelude, bytes]
        : [bytes]

    const blob =
      new Blob(
        parts,
        {
          type:
            "text/javascript"
        }
      )

    return URL.createObjectURL(
      blob
    )
  }

  function textFromContent(content) {
    const lines = []

    let currentLine = []
    let previousY = null

    const flushLine = () => {
      const line =
        currentLine
          .join(" ")
          .replace(
            /\s+/g,
            " "
          )
          .trim()

      if (line) {
        lines.push(line)
      }

      currentLine = []
    }

    for (
      const item
      of content.items || []
    ) {
      if (
        !item ||
        typeof item.str !==
          "string"
      ) {
        continue
      }

      const currentY =
        Array.isArray(
          item.transform
        )
          ? Number(
              item.transform[5]
            )
          : null

      if (
        currentLine.length &&
        Number.isFinite(
          previousY
        ) &&
        Number.isFinite(
          currentY
        ) &&
        Math.abs(
          currentY -
          previousY
        ) > 2
      ) {
        flushLine()
      }

      const value =
        item.str
          .replace(
            /\s+/g,
            " "
          )
          .trim()

      if (value) {
        currentLine.push(
          value
        )
      }

      if (item.hasEOL) {
        flushLine()
      }

      if (
        Number.isFinite(
          currentY
        )
      ) {
        previousY =
          currentY
      }
    }

    flushLine()

    return lines.join(
      "\n"
    )
  }

  function storeBootError(value) {
    if (
      window.__ctsPdfBootError
    ) {
      return
    }

    window.__ctsPdfBootError =
      errorText(value)
  }

  window.addEventListener(
    "error",
    event => {
      storeBootError(
        event.error ||
        event.message
      )
    }
  )

  window.addEventListener(
    "unhandledrejection",
    event => {
      storeBootError(
        event.reason
      )
    }
  )

  ;(async () => {
    try {
      window.__ctsLibraryUrl =
        moduleUrlFromBase64(
          ${encodedLibrary}
        )

      window.__ctsWorkerUrl =
        moduleUrlFromBase64(
          ${encodedWorker},
          __ctsStreamPolyfillSource
        )

      const pdfjsLib =
        await import(
          window.__ctsLibraryUrl
        )

      if (
        !pdfjsLib ||
        typeof pdfjsLib.getDocument !==
          "function"
      ) {
        throw new Error(
          "La bibliothèque PDF.js chargée est incomplète."
        )
      }

      if (
        !pdfjsLib.GlobalWorkerOptions
      ) {
        throw new Error(
          "La configuration du worker PDF.js est absente."
        )
      }

      pdfjsLib
        .GlobalWorkerOptions
        .workerSrc =
          window.__ctsWorkerUrl

      window.__ctsPdfVersion =
        String(
          pdfjsLib.version ||
          ""
        )

      /*
       * PDF.js construit son worker avec
       * new Worker(url, { type: "module" }).
       * Certaines WebView refusent un worker de
       * module servi depuis une URL blob et PDF.js
       * bascule alors silencieusement sur un worker
       * de repli. Savoir lequel a servi est
       * déterminant pour diagnostiquer un échec.
       *
       * Cette sonde ne doit jamais empêcher le
       * démarrage du moteur.
       */
      try {
        const probe =
          new Worker(
            window.__ctsWorkerUrl,
            {
              type: "module"
            }
          )

        probe.terminate()

        window.__ctsWorkerMode =
          "module-worker"
      } catch (error) {
        window.__ctsWorkerMode =
          "fallback:" +
          errorText(error)
      }

      window.__ctsPdfLib =
        pdfjsLib

      window.__ctsExtractPdfText =
        async pdfBase64 => {
          let document = null

          try {
            let bytes

            try {
              bytes =
                bytesFromBase64(
                  pdfBase64
                )
            } catch (error) {
              return {
                ok: false,
                text: "",
                pageCount: 0,

                code:
                  error?.ctsCode ||
                  "PDF_BASE64_DECODE_FAILED",

                error:
                  errorText(error)
              }
            }

            let loadingTask

            try {
              loadingTask =
                pdfjsLib.getDocument({
                  data: bytes,
                  isEvalSupported: false
                })

              document =
                await loadingTask.promise

            } catch (error) {
              return {
                ok: false,
                text: "",
                pageCount: 0,

                code:
                  "PDF_DOCUMENT_OPEN_FAILED",

                error:
                  errorText(error)
              }
            }

            const pages = []

            for (
              let pageNumber = 1;
              pageNumber <=
                document.numPages;
              pageNumber++
            ) {
              try {
                const page =
                  await document.getPage(
                    pageNumber
                  )

                const content =
                  await page
                    .getTextContent()

                pages.push(
                  textFromContent(
                    content
                  )
                )

                page.cleanup()

              } catch (error) {
                return {
                  ok: false,
                  text: "",
                  pageCount:
                    document.numPages,

                  code:
                    "PDF_PAGE_TEXT_EXTRACTION_FAILED",

                  error:
                    errorText(error),

                  details:
                    failureDetails(
                      error,
                      {
                        pageNumber,

                        totalPages:
                          document.numPages
                      }
                    )
                }
              }
            }

            const text =
              pages
                .join("\n")
                .replace(
                  /[ \t]+/g,
                  " "
                )
                .replace(
                  / *\n */g,
                  "\n"
                )
                .replace(
                  /\n{3,}/g,
                  "\n\n"
                )
                .trim()

            return {
              ok:
                true,

              text,

              pageCount:
                document.numPages,

              code:
                "",

              error:
                ""
            }

          } catch (error) {
            return {
              ok:
                false,

              text:
                "",

              pageCount:
                0,

              code:
                "PDF_EXTRACTION_FAILED",

              error:
                errorText(error),

              details:
                failureDetails(
                  error
                )
            }

          } finally {
            if (
              document &&
              typeof document.destroy ===
                "function"
            ) {
              try {
                await document.destroy()
              } catch (_) {}
            }
          }
        }

      window.__ctsPdfReady =
        true

    } catch (error) {
      storeBootError(
        error
      )
    }
  })()
</script>
</body>
</html>`
}

function normalizeExtractedText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")

    .replace(/^\s*(\d{1,3})\s*-\s*(\d{1,3})\s+Voiture\s*$/gim, "Voiture $1 - $2")

    .replace(/[ \t]+\n/g, "\n")

    .replace(/\n{3,}/g, "\n\n")

    .trim()
}

async function ensureDownloaded(
  path,
  {
    missingCode = "FILE_NOT_FOUND",

    downloadCode = "ICLOUD_DOWNLOAD_FAILED",

    stage = "file"
  } = {}
) {
  if (!fm.fileExists(path)) {
    throw createTelemetryError(missingCode, stage, "Le fichier demandé est introuvable.")
  }

  if (!fm.isFileDownloaded(path)) {
    try {
      await UTILS.withTimeout(fm.downloadFileFromiCloud(path), ICLOUD_DOWNLOAD_TIMEOUT_MS)
    } catch (error) {
      throw createTelemetryError(
        downloadCode,
        stage,

        `Le fichier n’a pas pu être téléchargé depuis iCloud : ${errorMessage(error)}`,

        error
      )
    }
  }

  for (let attempt = 1; attempt <= ICLOUD_READY_ATTEMPTS; attempt++) {
    try {
      if (fm.isFileDownloaded(path)) {
        return
      }
    } catch (_) {}

    if (attempt < ICLOUD_READY_ATTEMPTS) {
      await sleep(ICLOUD_READY_RETRY_MS)
    }
  }

  throw createTelemetryError(
    downloadCode,
    stage,
    "Le fichier est présent dans iCloud mais n’est pas encore disponible localement."
  )
}

async function sleep(milliseconds) {
  await new Promise(resolve => {
    Timer.schedule(Math.max(0, Number(milliseconds) || 0), false, resolve)
  })
}

function describeExtractionFailure(result) {
  const message = String(result?.error || "L’extraction du PDF a échoué.").trim()

  const details =
    result?.details && typeof result.details === "object" && !Array.isArray(result.details)
      ? result.details
      : {}

  const parts = []

  if (Number.isFinite(Number(details.pageNumber))) {
    parts.push(`page ${details.pageNumber}/${details.totalPages || "?"}`)
  }

  for (const [label, value] of [
    ["type", details.errorName],
    ["worker", details.workerMode],
    ["flux", details.streamAsyncIteration],
    ["PDF.js", details.pdfVersion],
    ["pile", details.stack]
  ]) {
    const text = String(value || "").trim()

    if (text) {
      parts.push(`${label} ${text}`)
    }
  }

  return parts.length ? `${message} [${parts.join(" · ").slice(0, 500)}]` : message
}

function normalizeWebResult(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed
      }
    } catch (_) {}
  }

  return {
    ok: false,

    code: "PDF_ENGINE_INVALID_RESULT",

    error: "Le moteur PDF a renvoyé un résultat invalide."
  }
}

function createTelemetryError(code, stage, message, cause = null) {
  const safeMessage = String(message || code || "Erreur PDF inconnue.")

  return UTILS.createTelemetryError(
    UTILS.normalizeTelemetryCode(code, "PDF_UNKNOWN_ERROR"),
    UTILS.normalizeTelemetryStage(stage, "pdf"),
    safeMessage,
    cause
  )
}

function removeFileQuietly(path) {
  try {
    if (fm.fileExists(path)) {
      fm.remove(path)
    }
  } catch (_) {}
}

module.exports = {
  budgets,
  PDFJS_VERSION,
  ensureReady,
  extractText
}
