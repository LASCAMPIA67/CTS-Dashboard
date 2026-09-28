/*
 * Test des tranches, de la direction et des lieux lus sur une carte agent.
 *
 * Ce test existe à cause d'un défaut réel, arrivé jusqu'à l'écran d'un
 * conducteur le 23 septembre 2026 : sous « Direction », le widget affichait
 * « Page: 1 Hast. 2025 - Dtc_. 22/09/2026 ». C'était le pied de page que
 * HASTUS imprime au bas de la carte, lu comme un arrêt parce qu'il se
 * termine par une heure. Et la vraie direction, Lingolsheim Gare, ne
 * figurait nulle part sur la carte : le conducteur y était relevé à
 * Montagne Verte, en cours de ligne.
 *
 * La carte ci-dessous reproduit ce que le moteur PDF a rendu de la carte
 * réelle, en-tête de voiture déjà remis dans l'ordre. Le service, la date
 * et le conducteur sont inventés : un dépôt public n'a pas à porter les
 * siens.
 */

import fs from "node:fs"
import path from "node:path"
import { importFrom, isolatedModule, repository } from "./sandbox.mjs"

/* Les bases sont lues depuis le dépôt, jamais recopiées ici. */
function resource(name) {
  return fs.readFileSync(path.join(repository, name), "utf8")
}

const RESOURCES = {
  "lines.json": resource("lines.json"),
  "stops.json": resource("stops.json"),
  "places.json": resource("places.json")
}

function loadModule(name) {
  return isolatedModule(name, { importModule: importFrom(loaded) })
}

const fileName = target => String(target).replace(/^.*\//, "")

const loaded = {}
loaded["CTS Utils"] = loadModule("CTS Utils")
loaded["CTS Config"] = {
  fm: {
    fileExists: target => Boolean(RESOURCES[fileName(target)]),
    readString: target => RESOURCES[fileName(target)] || ""
  },
  files: {
    stops: "/database/stops.json",
    places: "/database/places.json",
    lines: "/database/lines.json"
  },
  ensureDirectories: () => {}
}
loaded["CTS Storage"] = { ensureDownloaded: async () => true }
loaded["CTS Resources"] = { ensureInstalled: async () => true }
loaded["CTS Database"] = loadModule("CTS Database")

const DATABASE = loaded["CTS Database"]
const PARSER = loadModule("CTS Parser")

const FOOTER = "Page: 1 HASTUS 2025 - dtc_hasdda 22/09/2026 15:44"

const CARD = `CTS
Type
jrn.
J
XX01
Voiture Prise
début
Lieu
début
Heure
début
Heure
fin
Lieu
fin
Prise
fin
15 - 2 6:48 ELS 6:48 10:30 REPU_A 10:30
04 - 6 13:16 ELME_A 13:16 15:28 ELME_A 15:38
02 - 16 16:31 ELS 16:31 17:46 MOVE_C 17:46
05/01/2026
CONDUCTEUR FICTIF (000001)
Prép. sortie
DEPOT ELSAU 6:48
DEPOT ELSAU 6:58
Voiture 15 - 2
Sortie / - DEPOT ELSAU 6:58
- / - REPUBLIQUE 7:25
Régulier / 15 REPUBLIQUE 7:25
- / - TAULER 7:33
QUARTIER DES QUINZE 7:37
BOECKLIN 7:48
Régulier / 15 BOECKLIN 7:57
- / - QUARTIER DES QUINZE 8:07
TAULER 8:12
REPUBLIQUE 8:21
Régulier / 15 REPUBLIQUE 9:28
- / - TAULER 9:35
QUARTIER DES QUINZE 9:39
BOECKLIN 9:49
Régulier / 15 BOECKLIN 10:07
- / - QUARTIER DES QUINZE 10:17
TAULER 10:22
REPUBLIQUE 10:30
Coupure 10:30 13:16
Voiture 04 - 6
Régulier / C4 ELMERFORST 13:16
- / - ELMERFORST 13:16
PLACE D'OSTWALD 13:19
BRUCHE 13:23
SCHNOKELOCH 13:27
COMTES 13:29
DUCS D'ALSACE 13:33
BERSTETT 13:38
IUT PASTEUR 13:42
SCHILTIGHEIM CAMPUS 13:44
Haut-le-pied / - SCHILTIGHEIM CAMPUS 13:44
- / - SCHILTIGHEIM CAMPUS 13:44
Régulier / C4 SCHILTIGHEIM CAMPUS 13:55
- / - SCHILTIGHEIM CAMPUS 13:56
IUT PASTEUR 13:58
BERSTETT 14:03
ELMERFORST 14:26
Régulier / C4 ELMERFORST 14:26
- / - OSTWALD HOTEL DE VILLE 14:32
ILLKIRCH FORT UHRICH 14:52
Haut-le-pied / - ILLKIRCH FORT UHRICH 14:52
- / - ILLKIRCH FORT UHRICH 14:52
Régulier / C4 ILLKIRCH FORT UHRICH 15:02
- / - PARC MALRAUX 15:08
OSTWALD HOTEL DE VILLE 15:22
ELMERFORST 15:28
Déplacement vers 15:28 15:38
Pause-café 15:38 16:31
Prép. sortie
DEPOT ELSAU 16:31
DEPOT ELSAU 16:36
Voiture 02 - 16
Sortie / - DEPOT ELSAU 16:36
- / - JARDIN DES DEUX RIVES 16:58
Régulier / 2 JARDIN DES DEUX RIVES 16:58
- / - PLACE D'ISLANDE 17:10
OBSERVATOIRE (Bd Leblois-arrivée CV) 17:14
TAULER 17:19
LYCEE KLEBER 17:27
PLACE DE PIERRE L.10 17:32
GARE CENTRALE 17:38
MONTAGNE VERTE (arrivée V.2) 17:46
MONTAGNE VERTE (arrivée V.2) 17:46
${FOOTER}`

/*
 * Chaque cas dit la carte lue et les directions que le conducteur doit
 * lire, tranche par tranche.
 */
const cases = [
  {
    name: "la carte telle que le moteur PDF l'a rendue",
    card: CARD,
    expected: ["Boecklin", "Schiltigheim Campus", "Lingolsheim Gare"]
  },
  {
    name: "le pied de page lu dans l'autre ordre",
    card: CARD.replace(FOOTER, "HASTUS 2025 - dtc_hasdda 22/09/2026 15:44 Page: 1"),
    expected: ["Boecklin", "Schiltigheim Campus", "Lingolsheim Gare"]
  },
  {
    /*
     * Une carte de deux pages porte un pied de page au milieu d'une
     * section. Posé juste avant l'activité suivante, il était le dernier
     * arrêt du trajet.
     */
    name: "un changement de page au bout du premier trajet",
    card: CARD.replace("BOECKLIN 7:48\n", `BOECKLIN 7:48\n${FOOTER}\n`),
    expected: ["Boecklin", "Schiltigheim Campus", "Lingolsheim Gare"]
  },
  {
    /*
     * La ligne 40 a des trajets partiels : la déduction y serait fausse,
     * et le dernier arrêt desservi reste la meilleure réponse.
     */
    name: "une relève en cours de ligne sur une ligne sans terminus connus",
    card: CARD.replace("02 - 16 16:31", "40 - 16 16:31")
      .replace("Voiture 02 - 16", "Voiture 40 - 16")
      .replace("Régulier / 2 ", "Régulier / 40 "),
    expected: ["Boecklin", "Schiltigheim Campus", "Montagne Verte"]
  },
  {
    name: "un trajet qui ne part pas d'un terminus",
    card: CARD.replace(
      "Régulier / 2 JARDIN DES DEUX RIVES 16:58\n- / - PLACE D'ISLANDE 17:10",
      "Régulier / 2 PLACE D'ISLANDE 17:10"
    ),
    expected: ["Boecklin", "Schiltigheim Campus", "Montagne Verte"]
  }
]

const failures = []

for (const { name, card, expected } of cases) {
  const service = await PARSER.parseService(card)
  const directions = service.slices.map(slice => slice.direction)

  if (JSON.stringify(directions) !== JSON.stringify(expected)) {
    failures.push(
      `${name} : directions « ${directions.join(" | ")} » au lieu de « ${expected.join(" | ")} »`
    )
  }

  if (!service.validation.valid) {
    failures.push(`${name} : carte refusée (${service.validation.errors.join(", ")})`)
  }
}

/*
 * Une tranche dont la ligne d'en-tête échappait au motif disparaissait
 * sans un mot : un code de relève de neuf lettres, ou portant un chiffre,
 * et le widget affichait un service amputé d'une prise. Chaque cas dit les
 * voitures lues et les erreurs attendues ; une section de voiture sans sa
 * tranche doit faire refuser la carte.
 */
const SLICE_ROW = "04 - 6 13:16 ELME_A 13:16 15:28 ELME_A 15:38"
const SECOND_RUN_ROW = "04 - 6 16:31 ELS 16:31 17:46 MOVE_C 17:46"
const TWICE_CARD = CARD.replace("02 - 16 16:31 ELS 16:31 17:46 MOVE_C 17:46", SECOND_RUN_ROW).replace(
  "Voiture 02 - 16",
  "Voiture 04 - 6"
)

const sliceCases = [
  {
    name: "la carte telle que le moteur PDF l'a rendue",
    card: CARD,
    vehicles: ["15 - 2", "04 - 6", "02 - 16"],
    errors: []
  },
  {
    name: "un code de relève de neuf lettres",
    card: CARD.replace(SLICE_ROW, "04 - 6 13:16 ROBERTSAU 13:16 15:28 ROBERTSAU 15:38"),
    vehicles: ["15 - 2", "04 - 6", "02 - 16"],
    errors: []
  },
  {
    name: "un code de relève portant un chiffre",
    card: CARD.replace(SLICE_ROW, "04 - 6 13:16 ELME2_A 13:16 15:28 ELME2_A 15:38"),
    vehicles: ["15 - 2", "04 - 6", "02 - 16"],
    errors: []
  },
  {
    name: "une ligne d'en-tête illisible",
    card: CARD.replace(`${SLICE_ROW}\n`, ""),
    vehicles: ["15 - 2", "02 - 16"],
    errors: ["Tranche introuvable pour la voiture 04 - 6"]
  },
  {
    name: "une voiture conduite deux fois",
    card: TWICE_CARD,
    vehicles: ["15 - 2", "04 - 6", "04 - 6"],
    errors: []
  },
  {
    name: "la seconde ligne d'en-tête d'une voiture conduite deux fois, illisible",
    card: TWICE_CARD.replace(`${SECOND_RUN_ROW}\n`, ""),
    vehicles: ["15 - 2", "04 - 6"],
    errors: ["Tranche introuvable pour la voiture 04 - 6"]
  }
]

for (const { name, card, vehicles, errors } of sliceCases) {
  const service = await PARSER.parseService(card)
  const read = service.slices.map(slice => `${slice.lineCode} - ${slice.vehicle}`)

  if (JSON.stringify(read) !== JSON.stringify(vehicles)) {
    failures.push(`${name} : voitures « ${read.join(" | ")} » au lieu de « ${vehicles.join(" | ")} »`)
  }

  if (JSON.stringify(service.validation.errors) !== JSON.stringify(errors)) {
    failures.push(
      `${name} : erreurs « ${service.validation.errors.join(" | ")} » au lieu de « ${errors.join(" | ")} »`
    )
  }
}

/*
 * Le 28 septembre 2026, le widget a nommé « Code ANKARA » le début et la
 * fin d'une tranche : le code de relève manquait aux bases. La carte
 * imprime le nom de l'arrêt dans la section de la voiture, et c'est lui
 * qui doit s'afficher, le lieu restant signalé pour qu'on l'ajoute à
 * places.json.
 */
const UNKNOWN_CODE = "ZZZZ_A"
const UNKNOWN_WARNING = "Lieu inconnu dans la tranche 2"

if (await DATABASE.findPlaceName(UNKNOWN_CODE)) {
  failures.push(`${UNKNOWN_CODE} est connu des bases : les cas de lieu inconnu n'éprouvent plus rien`)
}

const unknownCard = CARD.replace(
  "ELME_A 13:16 15:28 ELME_A",
  `${UNKNOWN_CODE} 13:16 15:28 ${UNKNOWN_CODE}`
)

const placeCases = [
  {
    name: "des codes de relève connus",
    card: CARD,
    expected: "Elmerforst → Elmerforst",
    warned: false
  },
  {
    name: "un code de relève absent des bases",
    card: unknownCard,
    expected: "Elmerforst → Elmerforst",
    warned: true
  },
  {
    name: "un code absent des bases sans section de voiture",
    card: unknownCard.replace("Voiture 04 - 6\n", ""),
    expected: `Code ${UNKNOWN_CODE} → Code ${UNKNOWN_CODE}`,
    warned: true
  }
]

for (const { name, card, expected, warned } of placeCases) {
  const service = await PARSER.parseService(card)
  const slice = service.slices[1]
  const places = `${slice.startPlace} → ${slice.endPlace}`

  if (places !== expected) {
    failures.push(`${name} : lieux « ${places} » au lieu de « ${expected} »`)
  }

  if (service.validation.warnings.includes(UNKNOWN_WARNING) !== warned) {
    failures.push(`${name} : ${warned ? "lieu inconnu non signalé" : "lieu connu signalé inconnu"}`)
  }
}

/*
 * PDF.js a rendu « ROBERTSAU ST ANNE 30 passage11:39 », sans blanc avant
 * l'heure, sur la carte réelle du 28 septembre 2026 : l'arrêt était
 * ignoré. Il y tombait en milieu de trajet. L'extrait ci-dessous, repris
 * de cette carte, coupe la tranche sur lui, pour qu'il soit à la fois le
 * dernier arrêt du premier trajet — il donne la direction, la ligne 30
 * n'ayant pas de terminus connus — et la fin d'une tranche au code de
 * relève inconnu, qu'il doit nommer.
 */
const GLUED_STOP = "ROBERTSAU ST ANNE 30 passage11:39"

const GLUED_CARD = `CTS
XX01
30 - 2 10:58 ${UNKNOWN_CODE} 10:58 11:39 ${UNKNOWN_CODE} 11:39
05/01/2026
CONDUCTEUR FICTIF (000001)
Voiture 30 - 2
Régulier / 30 AMPERE 10:58
- / - ARISTIDE BRIAND 11:04
DANUBE 11:09
ANKARA 11:11
ROME 11:13
GALLIA 11:21
CONSEIL DE L'EUROPE 11:27
FORT LOUIS 11:33
CLINIQUE SAINTE ANNE 11:38
${GLUED_STOP}`

const gluedCases = [
  {
    name: "une heure collée au nom de l'arrêt",
    card: GLUED_CARD,
    expected: "Robertsau Sainte-Anne · direction Robertsau Sainte-Anne"
  },
  {
    /*
     * HOMME DE FER V1 collé à 6:05 donne « V16:05 », que rien ne
     * distingue de V à 16:05 : la ligne reste ignorée, comme avant,
     * plutôt que de nommer un arrêt « Homme de Fer V ».
     */
    name: "une heure collée à un nom qui finit par un chiffre",
    card: GLUED_CARD.replace(GLUED_STOP, "HOMME DE FER V16:05"),
    expected: `Code ${UNKNOWN_CODE} · direction Clinique Sainte-Anne`
  }
]

for (const { name, card, expected } of gluedCases) {
  const service = await PARSER.parseService(card)
  const read = `${service.slices[0]?.endPlace} · direction ${service.slices[0]?.direction}`

  if (read !== expected) {
    failures.push(`${name} : « ${read} » au lieu de « ${expected} »`)
  }

  if (!service.validation.valid) {
    failures.push(`${name} : carte refusée (${service.validation.errors.join(", ")})`)
  }
}

/*
 * Un terminus mal orthographié ne casse rien de visible : la déduction ne
 * se fait plus, en silence. Chaque terminus doit donc être un arrêt que
 * stops.json connaît, et chaque ligne en déclarer exactement deux.
 */
let terminiCount = 0

for (const [code, entry] of Object.entries(JSON.parse(RESOURCES["lines.json"]))) {
  if (entry.termini === undefined) continue

  if (!Array.isArray(entry.termini) || entry.termini.length !== 2) {
    failures.push(`lines.json : la ligne ${code} doit déclarer exactement deux terminus`)
    continue
  }

  for (const terminus of entry.termini) {
    terminiCount++

    if (!(await DATABASE.getStop(terminus))) {
      failures.push(`lines.json : le terminus « ${terminus} » de la ligne ${code} est absent de stops.json`)
    }
  }
}

if (failures.length) {
  console.log("ÉCHEC  tranches, direction et lieux lus sur la carte agent")
  for (const failure of failures) console.log(`         ${failure}`)
  process.exit(1)
}

console.log(
  `ok     tranches, direction et lieux lus sur la carte agent ` +
    `(${cases.length} cartes, ${sliceCases.length} cas de tranches, ` +
    `${placeCases.length} cas de lieux, ${gluedCases.length} heures collées, ${terminiCount} terminus)`
)
