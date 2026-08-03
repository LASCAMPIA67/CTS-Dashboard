// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: doc.text.magnifyingglass;

// CTS PDF Engine.js
// Installation locale de PDF.js et extraction du texte des PDF HASTUS.

const CONFIG = importModule("CTS Config")

const {
  fm,
  paths,
  files,
  pdf
} = CONFIG

// =====================================================
// VERSION LOCALE DE PDF.JS
// =====================================================

const PDFJS_VERSION = "6.1.200"

const PDFJS_BASE_URL =
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/legacy/build`

const PDFJS_URLS = {
  library:
    `${PDFJS_BASE_URL}/pdf.min.mjs`,

  worker:
    `${PDFJS_BASE_URL}/pdf.worker.min.mjs`
}

const ENGINE_METADATA_PATH =
  fm.joinPath(
    paths.pdfEngine,
    "engine.json"
  )

const DOWNLOAD_TIMEOUT_SECONDS = 30
const ENGINE_START_TIMEOUT_MS = 20000
const MINIMUM_LIBRARY_SIZE_KB = 40

// =====================================================
// INSTALLATION DU MOTEUR
// =====================================================

async function ensureReady() {
  CONFIG.ensureDirectories()

  await ensureLibraryFile(
    files.pdfJs,
    PDFJS_URLS.library,
    "Bibliothèque PDF.js"
  )

  await ensureLibraryFile(
    files.pdfWorker,
    PDFJS_URLS.worker,
    "Worker PDF.js"
  )

  await writeEngineMetadata()

  return {
    ready: true,
    version: PDFJS_VERSION,
    libraryPath: files.pdfJs,
    workerPath: files.pdfWorker
  }
}

async function ensureLibraryFile(
  destinationPath,
  remoteUrl,
  label
) {
  if (
    await isValidLibraryFile(
      destinationPath
    )
  ) {
    return
  }

  await downloadLibraryFile(
    destinationPath,
    remoteUrl,
    label
  )

  if (
    !await isValidLibraryFile(
      destinationPath
    )
  ) {
    throw new Error(
      `${label} téléchargé, mais le fichier obtenu est invalide.`
    )
  }
}

async function isValidLibraryFile(path) {
  if (!fm.fileExists(path)) {
    return false
  }

  try {
    await ensureDownloaded(path)

    const sizeKilobytes =
      fm.fileSize(path)

    return Boolean(
      Number.isFinite(
        sizeKilobytes
      ) &&
      sizeKilobytes >=
        MINIMUM_LIBRARY_SIZE_KB
    )
  } catch (error) {
    return false
  }
}

async function downloadLibraryFile(
  destinationPath,
  remoteUrl,
  label
) {
  const temporaryPath =
    `${destinationPath}.download`

  removeFileQuietly(
    temporaryPath
  )

  const request =
    new Request(remoteUrl)

  request.timeoutInterval =
    DOWNLOAD_TIMEOUT_SECONDS

  let data

  try {
    data =
      await request.load()
  } catch (error) {
    throw new Error(
      `${label} impossible à télécharger : ${errorMessage(error)}`
    )
  }

  const statusCode =
    Number(
      request.response?.statusCode
    )

  if (
    Number.isFinite(statusCode) &&
    (
      statusCode < 200 ||
      statusCode >= 300
    )
  ) {
    throw new Error(
      `${label} impossible à télécharger : réponse HTTP ${statusCode}.`
    )
  }

  if (!data) {
    throw new Error(
      `${label} impossible à télécharger : réponse vide.`
    )
  }

  try {
    fm.write(
      temporaryPath,
      data
    )

    const downloadedSizeKilobytes =
      fm.fileSize(
        temporaryPath
      )

    if (
      !Number.isFinite(
        downloadedSizeKilobytes
      ) ||
      downloadedSizeKilobytes <
        MINIMUM_LIBRARY_SIZE_KB
    ) {
      throw new Error(
        "Le fichier téléchargé est anormalement petit."
      )
    }

    removeFileQuietly(
      destinationPath
    )

    fm.move(
      temporaryPath,
      destinationPath
    )
  } catch (error) {
    removeFileQuietly(
      temporaryPath
    )

    throw new Error(
      `${label} impossible à enregistrer : ${errorMessage(error)}`
    )
  }
}

async function writeEngineMetadata() {
  const metadata = {
    engine: "PDF.js",
    version: PDFJS_VERSION,

    installedAt:
      new Date().toISOString(),

    loadingMode:
      "local-blob-module",

    files: {
      library:
        "pdf.min.mjs",

      worker:
        "pdf.worker.min.mjs"
    }
  }

  fm.writeString(
    ENGINE_METADATA_PATH,
    JSON.stringify(
      metadata,
      null,
      2
    )
  )
}

// =====================================================
// EXTRACTION DU TEXTE
// =====================================================

async function extractText(pdfPath) {
  await ensureReady()
  await validatePdfPath(pdfPath)

  const libraryBase64 =
    await readFileAsBase64(
      files.pdfJs,
      "La bibliothèque PDF.js"
    )

  const workerBase64 =
    await readFileAsBase64(
      files.pdfWorker,
      "Le worker PDF.js"
    )

  const pdfBase64 =
    await readFileAsBase64(
      pdfPath,
      "Le PDF"
    )

  const webView =
    new WebView()

  const runtimeHtml =
    buildRuntimeHtml(
      libraryBase64,
      workerBase64
    )

  try {
    await webView.loadHTML(
      runtimeHtml
    )
  } catch (error) {
    throw new Error(
      `Le moteur PDF ne peut pas être chargé : ${errorMessage(error)}`
    )
  }

  const readiness =
    await waitForEngine(
      webView
    )

  if (!readiness.ok) {
    throw new Error(
      readiness.error ||
      "Le moteur PDF ne s’est pas initialisé."
    )
  }

  const rawResult =
    await evaluateExtraction(
      webView,
      pdfBase64
    )

  const result =
    normalizeWebResult(
      rawResult
    )

  if (!result.ok) {
    throw new Error(
      result.error ||
      "L’extraction du PDF a échoué."
    )
  }

  const text =
    normalizeExtractedText(
      result.text
    )

  if (
    text.length <
    pdf.minimumTextLength
  ) {
    throw new Error(
      "Le PDF ne contient pas assez de texte exploitable."
    )
  }

  return {
    text,

    pageCount:
      Number(
        result.pageCount
      ) || 0,

    characterCount:
      text.length,

    engine:
      "PDF.js",

    engineVersion:
      PDFJS_VERSION
  }
}

async function validatePdfPath(path) {
  if (
    typeof path !== "string" ||
    !path.trim()
  ) {
    throw new Error(
      "Aucun chemin de PDF n’a été fourni."
    )
  }

  if (!fm.fileExists(path)) {
    throw new Error(
      "Le fichier PDF est introuvable."
    )
  }

  if (
    !String(path)
      .toLowerCase()
      .endsWith(
        pdf.extension
      )
  ) {
    throw new Error(
      "Le fichier sélectionné n’est pas un PDF."
    )
  }

  await ensureDownloaded(path)

  const fileSizeKilobytes =
    fm.fileSize(path)

  if (
    !Number.isFinite(
      fileSizeKilobytes
    ) ||
    fileSizeKilobytes <= 0
  ) {
    throw new Error(
      "Le fichier PDF est vide ou inaccessible."
    )
  }

  const maximumFileSizeBytes =
    Math.max(
      1,

      Number(
        pdf.maximumFileSizeBytes
      ) ||
      20 * 1024 * 1024
    )

  const maximumFileSizeKilobytes =
    maximumFileSizeBytes /
    1024

  if (
    fileSizeKilobytes >
    maximumFileSizeKilobytes
  ) {
    const maximumMb =
      Math.round(
        maximumFileSizeBytes /
        1024 /
        1024
      )

    throw new Error(
      `Le PDF dépasse la limite autorisée de ${maximumMb} Mo.`
    )
  }
}

async function readFileAsBase64(
  path,
  label
) {
  await ensureDownloaded(path)

  let data

  try {
    data =
      fm.read(path)
  } catch (error) {
    throw new Error(
      `${label} ne peut pas être lu : ${errorMessage(error)}`
    )
  }

  if (!data) {
    throw new Error(
      `${label} est vide ou inaccessible.`
    )
  }

  const base64 =
    data.toBase64String()

  if (!base64) {
    throw new Error(
      `${label} ne peut pas être converti en Base64.`
    )
  }

  return base64
}

// =====================================================
// INITIALISATION DE LA WEBVIEW
// =====================================================

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
            error: ""
          })

          return
        }

        if (
          window.__ctsPdfBootError
        ) {
          finish({
            ok: false,

            error: String(
              window.__ctsPdfBootError
            )
          })

          return
        }

        if (
          Date.now() - startedAt >
          ${ENGINE_START_TIMEOUT_MS}
        ) {
          finish({
            ok: false,

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
    return normalizeWebResult(
      await webView
        .evaluateJavaScript(
          script,
          true
        )
    )
  } catch (error) {
    return {
      ok: false,

      error:
        `Initialisation PDF.js impossible : ${errorMessage(error)}`
    }
  }
}

async function evaluateExtraction(
  webView,
  pdfBase64
) {
  const timeoutMs =
    Math.max(
      1000,

      Number(
        pdf.extractionTimeoutMs
      ) ||
      25000
    )

  const encodedPdf =
    JSON.stringify(
      pdfBase64
    )

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
    return await webView
      .evaluateJavaScript(
        script,
        true
      )
  } catch (error) {
    return {
      ok: false,

      error:
        `Extraction PDF impossible : ${errorMessage(error)}`
    }
  }
}

// =====================================================
// PAGE HTML DU MOTEUR
// =====================================================

function buildRuntimeHtml(
  libraryBase64,
  workerBase64
) {
  const encodedLibrary =
    JSON.stringify(
      libraryBase64
    )

  const encodedWorker =
    JSON.stringify(
      workerBase64
    )

  return `<!doctype html>
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
<script>
  window.__ctsPdfReady = false
  window.__ctsPdfBootError = ""
  window.__ctsPdfLib = null
  window.__ctsLibraryUrl = ""
  window.__ctsWorkerUrl = ""

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

  function storeBootError(value) {
    if (
      window.__ctsPdfBootError
    ) {
      return
    }

    window.__ctsPdfBootError =
      errorText(value)
  }

  function bytesFromBase64(base64) {
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
  }

  function moduleUrlFromBase64(base64) {
    const bytes =
      bytesFromBase64(
        base64
      )

    const blob =
      new Blob(
        [bytes],
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
            /\\s+/g,
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
            /\\s+/g,
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
      "\\n"
    )
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
          ${encodedWorker}
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

      window.__ctsPdfLib =
        pdfjsLib

      window.__ctsExtractPdfText =
        async pdfBase64 => {
          let document = null

          try {
            const bytes =
              bytesFromBase64(
                pdfBase64
              )

            const loadingTask =
              pdfjsLib.getDocument({
                data: bytes,
                isEvalSupported: false
              })

            document =
              await loadingTask.promise

            const pages = []

            for (
              let pageNumber = 1;
              pageNumber <=
                document.numPages;
              pageNumber++
            ) {
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
            }

            const text =
              pages
                .join("\\n")
                .replace(
                  /[ \\t]+/g,
                  " "
                )
                .replace(
                  / *\\n */g,
                  "\\n"
                )
                .replace(
                  /\\n{3,}/g,
                  "\\n\\n"
                )
                .trim()

            return {
              ok: true,
              text,

              pageCount:
                document.numPages,

              error: ""
            }
          } catch (error) {
            return {
              ok: false,
              text: "",
              pageCount: 0,

              error:
                errorText(error)
            }
          } finally {
            if (
              document &&
              typeof document.destroy ===
                "function"
            ) {
              try {
                await document.destroy()
              } catch (error) {}
            }
          }
        }

      window.__ctsPdfReady =
        true
    } catch (error) {
      storeBootError(error)
    }
  })()
</script>
</body>
</html>`
}

// =====================================================
// NORMALISATION HASTUS
// =====================================================

function normalizeExtractedText(value) {
  return String(value || "")
    .replace(
      /\r\n?/g,
      "\n"
    )

    /*
     * PDF.js inverse parfois l’ordre visuel
     * des en-têtes de section HASTUS.
     *
     * Exemple extrait :
     * 07 - 6 Voiture
     *
     * Forme attendue par CTS Parser :
     * Voiture 07 - 6
     */
    .replace(
      /^\s*(\d{1,3})\s*-\s*(\d{1,3})\s+Voiture\s*$/gim,
      "Voiture $1 - $2"
    )

    .replace(
      /[ \t]+\n/g,
      "\n"
    )

    .replace(
      /\n{3,}/g,
      "\n\n"
    )

    .trim()
}

// =====================================================
// OUTILS INTERNES
// =====================================================

async function ensureDownloaded(path) {
  if (!fm.fileExists(path)) {
    throw new Error(
      "Le fichier demandé est introuvable."
    )
  }

  if (
    !fm.isFileDownloaded(path)
  ) {
    await fm
      .downloadFileFromiCloud(
        path
      )
  }
}

function normalizeWebResult(value) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value
  }

  if (
    typeof value === "string"
  ) {
    try {
      const parsed =
        JSON.parse(value)

      if (
        parsed &&
        typeof parsed ===
          "object" &&
        !Array.isArray(parsed)
      ) {
        return parsed
      }
    } catch (error) {}
  }

  return {
    ok: false,

    error:
      "Le moteur PDF a renvoyé un résultat invalide."
  }
}

function removeFileQuietly(path) {
  try {
    if (fm.fileExists(path)) {
      fm.remove(path)
    }
  } catch (error) {}
}

function errorMessage(error) {
  if (
    error &&
    typeof error.message ===
      "string" &&
    error.message.trim()
  ) {
    return error.message.trim()
  }

  return String(
    error ||
    "Erreur inconnue"
  )
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  PDFJS_VERSION,
  ensureReady,
  extractText
}