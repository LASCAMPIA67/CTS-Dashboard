// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: yellow; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: shippingbox.fill;

// CTS Resources.js
// Installation automatique des ressources indispensables à CTS Dashboard.

const CONFIG = importModule("CTS Config")

const {
  fm,
  files,
  ensureDirectories
} = CONFIG

const RESOURCES_VERSION = 1

const DATABASES = {
  lines: {
    path: files.lines,
    label: "lines.json",
    content: {
      "10": {
        "name": "10"
      },
      "15": {
        "name": "15"
      },
      "17": {
        "name": "17"
      },
      "30": {
        "name": "30"
      },
      "40": {
        "name": "40"
      },
      "90": {
        "name": "G"
      },
      "92": {
        "name": "H"
      },
      "01": {
        "name": "C1"
      },
      "02": {
        "name": "2"
      },
      "03": {
        "name": "C3"
      },
      "04": {
        "name": "C4"
      },
      "05": {
        "name": "C5"
      },
      "06": {
        "name": "C6"
      },
      "07": {
        "name": "C7"
      },
      "08": {
        "name": "C8"
      },
      "09": {
        "name": "C9"
      }
    }
  },

  stops: {
    path: files.stops,
    label: "stops.json",
    content: {
      "SCHILTIGHEIM CAMPUS": {
        "name": "Schiltigheim Campus"
      },
      "ILLKIRCH FORT UHRICH": {
        "name": "Illkirch Fort Uhrich"
      },
      "ELMERFORST": {
        "name": "Elmerforst"
      },
      "JARDIN DES DEUX RIVES": {
        "name": "Jardin des Deux Rives"
      },
      "LINGOLSHEIM GARE": {
        "name": "Lingolsheim Gare"
      },
      "MONTAGNE VERTE": {
        "name": "Montagne Verte"
      },
      "NEUHOF GANZAU": {
        "name": "Neuhof Ganzau"
      },
      "UNTERELSAU": {
        "name": "Unterelsau"
      },
      "GARE CENTRALE": {
        "name": "Gare Centrale"
      },
      "ELSAU": {
        "name": "Elsau"
      },
      "PARLEMENT EUROPEEN": {
        "name": "Parlement Européen"
      },
      "PLACE D'ISLANDE": {
        "name": "Place d’Islande"
      },
      "OSTWALD HOTEL DE VILLE": {
        "name": "Ostwald Hôtel de Ville"
      },
      "PLACE D'OSTWALD": {
        "name": "Place d’Ostwald"
      },
      "LYCEE KLEBER": {
        "name": "Lycée Kléber"
      },
      "LYCEE COUFFIGNAL": {
        "name": "Lycée Couffignal"
      },
      "NEUHOF RODOLPHE REUSS": {
        "name": "Rodolphe Reuss"
      },
      "CITE MEINAU": {
        "name": "Cité Meinau"
      },
      "BAGGERSEE": {
        "name": "Baggersee"
      },
      "NEUHOF LUCIE AUBRAC": {
        "name": "Neuhof Lucie Aubrac"
      },
      "NEUHOF CORPS EUROPEENS": {
        "name": "Neuhof Corps Européens"
      },
      "LORIENT": {
        "name": "Lorient"
      },
      "LA ROCHELLE": {
        "name": "La Rochelle"
      },
      "SAINT NAZAIRE": {
        "name": "Saint-Nazaire"
      },
      "PORT AUTONOME SUD": {
        "name": "Port Autonome Sud"
      },
      "ILLKIRCH MAIRIE": {
        "name": "Illkirch Mairie",
        "aliases": [
          "ILLKIRCH MAIRIE DESCENTE",
          "ILLKIRCH MAIRIE MONTEE"
        ]
      },
      "DEPOT ELSAU": {
        "name": "Dépôt Elsau"
      },
      "DEPOT KIBITZENAU": {
        "name": "Dépôt Kibitzenau"
      }
    }
  },

  places: {
    path: files.places,
    label: "places.json",
    content: {
      "ELS": {
        "name": "UPE",
        "type": "depot"
      },
      "KBZ": {
        "name": "UPK",
        "type": "depot"
      },
      "CRB": {
        "name": "UPC",
        "type": "depot"
      },
      "ELSA": {
        "name": "Elsau",
        "type": "relief"
      },
      "ELME": {
        "name": "Elmerforst",
        "type": "relief"
      },
      "MOVE": {
        "name": "Montagne Verte",
        "type": "relief"
      },
      "GACE": {
        "name": "Gare Centrale",
        "type": "relief"
      },
      "REPU": {
        "name": "République",
        "type": "relief"
      },
      "HOHB": {
        "name": "Hohberg",
        "type": "relief"
      },
      "RORE": {
        "name": "Rodolphe Reuss",
        "type": "relief"
      }
    }
  }
}

async function ensureInstalled() {
  ensureDirectories()

  const installed = []
  const preserved = []
  const repaired = []

  for (
    const resource
    of Object.values(DATABASES)
  ) {
    const status =
      await ensureDatabase(resource)

    if (status === "installed") {
      installed.push(resource.label)
    } else if (status === "repaired") {
      repaired.push(resource.label)
    } else {
      preserved.push(resource.label)
    }
  }

  return {
    success: true,
    version: RESOURCES_VERSION,
    installed,
    repaired,
    preserved
  }
}

async function ensureDatabase(resource) {
  if (!fm.fileExists(resource.path)) {
    writeDatabase(resource)
    return "installed"
  }

  try {
    if (!fm.isFileDownloaded(resource.path)) {
      await fm.downloadFileFromiCloud(
        resource.path
      )
    }

    const content =
      fm.readString(resource.path).trim()

    if (!content) {
      writeDatabase(resource)
      return "repaired"
    }

    const parsed =
      JSON.parse(content)

    if (!isPlainObject(parsed)) {
      writeDatabase(resource)
      return "repaired"
    }

    return "preserved"
  } catch (error) {
    writeDatabase(resource)
    return "repaired"
  }
}

function writeDatabase(resource) {
  const temporaryPath =
    `${resource.path}.installation`

  removeQuietly(temporaryPath)

  fm.writeString(
    temporaryPath,
    JSON.stringify(
      resource.content,
      null,
      2
    )
  )

  removeQuietly(resource.path)

  fm.move(
    temporaryPath,
    resource.path
  )
}

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
}

function removeQuietly(path) {
  try {
    if (fm.fileExists(path)) {
      fm.remove(path)
    }
  } catch (error) {}
}

module.exports = {
  RESOURCES_VERSION,
  ensureInstalled
}