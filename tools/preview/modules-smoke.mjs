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
