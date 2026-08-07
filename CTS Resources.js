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

const RESOURCES_VERSION = 2

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
      "70": {
        "name": "70"
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
        "name": "Neuhof Rodolphe Reuss",
        "aliases": [
          "RODOLPHE REUSS"
        ]
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
      "ROME": {
        "name": "Rome"
      },
      "ESPLANADE": {
        "name": "Esplanade",
        "aliases": [
          "ESPLANADE DESCENTE"
        ]
      },
      "LONDRES": {
        "name": "Londres"
      },
      "IUT PASTEUR": {
        "name": "IUT Pasteur"
      },
      "PARC DES SPORTS": {
        "name": "Parc des Sports"
      },
      "BUGATTI": {
        "name": "Bugatti"
      },
      "POTERIES": {
        "name": "Poteries"
      },
      "OCTROI": {
        "name": "Octroi"
      },
      "BOEUF ROUGE": {
        "name": "Bœuf Rouge"
      },
      "WOLFISHEIM STADE TERMINI": {
        "name": "Wolfisheim Stade",
        "aliases": [
          "WOLFISHEIM STADE",
          "WOLFISHEIM STADE TERMINUS"
        ]
      },
      "ROBERTSAU RENAISSANCE": {
        "name": "Robertsau Renaissance"
      },
      "PONT PHARIO": {
        "name": "Pont Phario"
      },
      "MAIRES SCHAUB": {
        "name": "Maires Schaub"
      },
      "BISCHHEIM GARE": {
        "name": "Bischheim Gare"
      },
      "CHAMBRE DE METIERS": {
        "name": "Chambre de Métiers",
        "aliases": [
          "CHAMBRE DE METIERS ARRIVEE",
          "CHAMBRE DE METIERS ARRI"
        ]
      },
      "HOENHEIM BATTEMENT": {
        "name": "Hœnheim Battement"
      },
      "HOENHEIM GARE": {
        "name": "Hœnheim Gare"
      },
      "DAUPHINE": {
        "name": "Dauphine"
      },
      "FORT DESAIX": {
        "name": "Fort Desaix"
      },
      "VICTOR HUGO": {
        "name": "Victor Hugo"
      },
      "POINCARE": {
        "name": "Poincaré"
      },
      "SAINTE HELENE": {
        "name": "Sainte-Hélène"
      },
      "WILSON": {
        "name": "Wilson"
      },
      "HALLES PONT DE PARIS": {
        "name": "Halles Pont de Paris"
      },
      "REPUBLIQUE": {
        "name": "République"
      },
      "ORANGERIE": {
        "name": "Orangerie"
      },
      "ROBERTSAU EGLISE": {
        "name": "Robertsau Église"
      },
      "CITE DE L'ILL": {
        "name": "Cité de l’Ill"
      },
      "GARE AUX MARCHANDISES": {
        "name": "Gare aux Marchandises"
      },
      "PORTE BLANCHE": {
        "name": "Porte Blanche"
      },
      "LAITERIE": {
        "name": "Laiterie"
      },
      "HOPITAL CIVIL": {
        "name": "Hôpital Civil"
      },
      "ETOILE BOURSE": {
        "name": "Étoile Bourse"
      },
      "WINSTON CHURCHILL": {
        "name": "Winston Churchill"
      },
      "DANUBE LE VAISSEAU": {
        "name": "Danube Le Vaisseau"
      },
      "ROTTERDAM": {
        "name": "Rotterdam"
      },
      "RIETH": {
        "name": "Rieth"
      },
      "ARAGO": {
        "name": "Arago"
      },
      "ESPACE EUROPEEN DE L'ENT": {
        "name": "Espace Européen de l’Entreprise",
        "aliases": [
          "ESPACE EUROPEEN DE L'ENTREPRISE"
        ]
      },
      "PLACE DE PIERRE": {
        "name": "Place de Pierre"
      },
      "BARR": {
        "name": "Barr"
      },
      "MAISON ROUGE": {
        "name": "Maison Rouge"
      },
      "PARC WODLI": {
        "name": "Parc Wodli"
      },
      "DEPOT ELSAU": {
        "name": "Dépôt Elsau"
      },
      "DEPOT KIBITZENAU": {
        "name": "Dépôt Kibitzenau"
      },
      "DEPOT CRONENBOURG": {
        "name": "Dépôt Cronenbourg"
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
        "name": "Dépôt Cronenbourg",
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
        "name": "Neuhof Rodolphe Reuss",
        "type": "relief"
      },
      "ROMEEE": {
        "name": "Rome",
        "type": "relief"
      },
      "ESPL_A": {
        "name": "Esplanade",
        "type": "relief"
      },
      "RORE_A": {
        "name": "Neuhof Rodolphe Reuss",
        "type": "relief"
      },
      "LOND_B": {
        "name": "Londres",
        "type": "relief"
      },
      "GAMA_A": {
        "name": "Gare aux Marchandises",
        "type": "relief"
      },
      "LHPP_G": {
        "name": "Halles Pont de Paris",
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
