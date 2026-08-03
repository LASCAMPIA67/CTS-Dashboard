// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: brown; icon-glyph: archivebox;

// CTS Storage.js
// Lecture, écriture, sauvegarde et journalisation des données CTS.

const CONFIG =
  importModule("CTS Config")

const {
  fm,
  files,
  ensureDirectories
} = CONFIG

const MAX_LOG_ENTRIES = 100

// =====================================================
// TÉLÉCHARGEMENT ICLOUD
// =====================================================

async function ensureDownloaded(
  path
) {
  if (!fm.fileExists(path)) {
    return false
  }

  if (!fm.isFileDownloaded(path)) {
    await fm.downloadFileFromiCloud(
      path
    )
  }

  return true
}

// =====================================================
// LECTURE
// =====================================================

async function readText(
  path,
  fallback = ""
) {
  try {
    const exists =
      await ensureDownloaded(
        path
      )

    if (!exists) {
      return fallback
    }

    return fm.readString(
      path
    )
  } catch (error) {
    return fallback
  }
}

async function readJson(
  path,
  fallback = null
) {
  try {
    const content =
      await readText(
        path,
        ""
      )

    if (!content.trim()) {
      return fallback
    }

    return JSON.parse(
      content
    )
  } catch (error) {
    return fallback
  }
}

// =====================================================
// ÉCRITURE DIRECTE
// =====================================================

function writeText(
  path,
  value
) {
  ensureDirectories()

  fm.writeString(
    path,
    String(value)
  )
}

function writeJson(
  path,
  value,
  pretty = true
) {
  const content =
    JSON.stringify(
      value,
      null,
      pretty ? 2 : 0
    )

  writeText(
    path,
    content
  )
}

// =====================================================
// ÉCRITURE SÉCURISÉE
// =====================================================

async function writeJsonSafely(
  path,
  value
) {
  const content =
    JSON.stringify(
      value,
      null,
      2
    )

  await writeTextSafely(
    path,
    content
  )
}

async function writeTextSafely(
  path,
  value
) {
  ensureDirectories()

  const content =
    String(value)

  const temporaryPath =
    `${path}.tmp-${buildUniqueToken()}`

  /*
   * Supprime les anciens fichiers temporaires fixes
   * laissés par la précédente méthode d’écriture.
   */
  cleanupLegacyWriteFiles(
    path
  )

  let previousFileExisted =
    false

  let previousContent =
    ""

  try {
    const exists =
      await ensureDownloaded(
        path
      )

    if (exists) {
      previousFileExisted =
        true

      previousContent =
        fm.readString(
          path
        )
    }

    /*
     * Écriture dans un fichier temporaire unique.
     */
    fm.writeString(
      temporaryPath,
      content
    )

    const stagedContent =
      fm.readString(
        temporaryPath
      )

    if (
      stagedContent !==
      content
    ) {
      throw new Error(
        "La vérification du fichier temporaire a échoué."
      )
    }

    /*
     * Remplacement direct du fichier final.
     *
     * Aucun fm.move() n’est utilisé afin d’éviter
     * les conflits de noms rencontrés avec iCloud.
     */
    fm.writeString(
      path,
      stagedContent
    )

    const savedContent =
      fm.readString(
        path
      )

    if (
      savedContent !==
      content
    ) {
      throw new Error(
        "La vérification du fichier enregistré a échoué."
      )
    }
  } catch (error) {
    /*
     * Restaure l’ancien contenu lorsqu’une erreur
     * survient après le début de l’écriture.
     */
    try {
      if (previousFileExisted) {
        fm.writeString(
          path,
          previousContent
        )
      } else if (
        fm.fileExists(path)
      ) {
        fm.remove(
          path
        )
      }
    } catch (restoreError) {
      /*
       * L’erreur initiale reste prioritaire.
       */
    }

    throw error
  } finally {
    removeFileQuietly(
      temporaryPath
    )
  }
}

// =====================================================
// NETTOYAGE DES ANCIENS TEMPORAIRES
// =====================================================

function cleanupLegacyWriteFiles(
  path
) {
  removeFileQuietly(
    `${path}.tmp`
  )

  removeFileQuietly(
    `${path}.rollback`
  )
}

function buildUniqueToken() {
  return [
    Date.now(),

    Math.random()
      .toString(36)
      .slice(2, 10)
  ].join("-")
}

function removeFileQuietly(
  path
) {
  try {
    if (
      path &&
      fm.fileExists(path)
    ) {
      fm.remove(
        path
      )
    }
  } catch (error) {
    /*
     * Un éventuel résidu sera supprimé
     * lors d’une prochaine écriture.
     */
  }
}

// =====================================================
// SERVICE PRINCIPAL ET SAUVEGARDE
// =====================================================

async function backupService() {
  try {
    const exists =
      await ensureDownloaded(
        files.service
      )

    if (!exists) {
      return false
    }

    const content =
      fm.readString(
        files.service
      )

    await writeTextSafely(
      files.serviceBackup,
      content
    )

    return true
  } catch (error) {
    return false
  }
}

async function saveService(
  service
) {
  await backupService()

  await writeJsonSafely(
    files.service,
    service
  )
}

async function loadService() {
  return readJson(
    files.service,
    null
  )
}

async function loadBackupService() {
  return readJson(
    files.serviceBackup,
    null
  )
}

// =====================================================
// JOURNAL
// =====================================================

async function appendLog(
  type,
  message,
  details = null
) {
  const current =
    await readJson(
      files.importLog,
      []
    )

  const logs =
    Array.isArray(current)
      ? current
      : []

  logs.push({
    timestamp:
      new Date().toISOString(),

    type:
      String(
        type || "info"
      ),

    message:
      String(
        message || ""
      ),

    details:
      sanitizeDetails(
        details
      )
  })

  try {
    await writeJsonSafely(
      files.importLog,
      logs.slice(
        -MAX_LOG_ENTRIES
      )
    )

    return true
  } catch (error) {
    return false
  }
}

async function clearLog() {
  try {
    await writeJsonSafely(
      files.importLog,
      []
    )

    return true
  } catch (error) {
    return false
  }
}

async function loadLog() {
  const value =
    await readJson(
      files.importLog,
      []
    )

  return Array.isArray(value)
    ? value
    : []
}

// =====================================================
// OUTILS PUBLICS
// =====================================================

function fileExists(
  path
) {
  return fm.fileExists(
    path
  )
}

function removeFile(
  path
) {
  try {
    if (!fm.fileExists(path)) {
      return false
    }

    fm.remove(
      path
    )

    return true
  } catch (error) {
    return false
  }
}

function sanitizeDetails(
  value
) {
  if (
    value === undefined
  ) {
    return null
  }

  if (
    value instanceof Error
  ) {
    return {
      name:
        value.name ||
        "Error",

      message:
        value.message ||
        String(value),

      stack:
        value.stack ||
        ""
    }
  }

  try {
    JSON.stringify(
      value
    )

    return value
  } catch (error) {
    return String(
      value
    )
  }
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  ensureDownloaded,
  readText,
  readJson,
  writeText,
  writeJson,
  writeJsonSafely,
  backupService,
  saveService,
  loadService,
  loadBackupService,
  appendLog,
  clearLog,
  loadLog,
  fileExists,
  removeFile
}