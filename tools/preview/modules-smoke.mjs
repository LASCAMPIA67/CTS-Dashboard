/*
 * Chargement de tous les modules distribués, et contrôle des références
 * entre eux.
 *
 * Scriptable ne signale une fonction manquante qu'au moment où le chemin
 * d'exécution y passe : un `UTILS.errorMessage` mal orthographié survit à
 * la vérification syntaxique, à la CI, à l'installation, et n'échoue que
 * le matin où un conducteur regarde son widget. Aucun des autres tests ne
 * couvre CTS Widget Engine, CTS Services Manager ni CTS Import Pipeline.
 *
 * Ce test charge donc les dix-sept modules dans l'ordre de leurs
 * dépendances, puis relit chaque fichier pour retrouver les membres qu'il
 * consulte sur les modules qu'il importe, et vérifie que chacun existe.
 * Il en fait autant pour ce que CTS Installer emprunte aux modules. C'est
 * le filet qui permet de déplacer une fonction d'un module à l'autre sans
 * risquer de casser le widget ni l'installateur. La règle elle-même vit
 * dans `references.mjs`.
 */

import fs from "node:fs"
import path from "node:path"
import {
  checkReferences,
  consumerAliases,
  loadDistributedModules,
  moduleAliases
} from "./references.mjs"
import { repository } from "./sandbox.mjs"

const distributed = loadDistributedModules()
const failures = [...distributed.failures]
let checked = 0

function record(result) {
  checked += result.checked
  failures.push(...result.failures)
}

for (const name of distributed.names) {
  const source = distributed.sources.get(name)
  record(checkReferences(name, source, moduleAliases(source, distributed), distributed))
}

/*
 * CTS Installer vit hors du manifeste. Sur l'iPhone, les modules changent à
 * chaque révision du dépôt, l'installateur seulement quand son numéro
 * monte : ce qu'il leur emprunte est la frontière la plus exposée du
 * projet. Le 23 septembre, un relais retiré de CTS Importer parce que plus
 * aucun module ne s'en servait a éteint « Retirer un service » et mis en
 * rouge le Diagnostic de tout le parc. CTS Repair, l'autre script hors
 * manifeste, n'emprunte rien aux modules : il doit fonctionner sans eux.
 */
const installer = fs.readFileSync(path.join(repository, "CTS Installer.js"), "utf8")
record(checkReferences("CTS Installer", installer, consumerAliases(installer, distributed), distributed))

if (distributed.touched.length) {
  failures.push(
    `un module atteint le réseau au chargement : ${[...new Set(distributed.touched)].join(", ")}`
  )
}

if (failures.length) {
  console.log("ÉCHEC  chargement des modules et références croisées")
  for (const failure of [...new Set(failures)]) console.log(`         ${failure}`)
  process.exit(1)
}

console.log(
  `ok     chargement des modules et références croisées ` +
    `(${distributed.names.length} modules et CTS Installer, ${checked} références)`
)
