// Publication des Releases GitHub.
// Exécuté par .github/workflows/release.yml, et seulement là : il publie.
//
// Chaque numéro de version.json a sa Release, posée sur le commit de main
// où il est arrivé : `v1.4.8` pour le Dashboard, `installer-v1.0.33` pour
// CTS Installer. Le script ne publie que ce qui manque aux numéros de l'état
// de main qu'il lit : un passage relancé ne publie jamais deux fois, et une
// Release qu'un numéro suivant a dépassée ne se rattrape plus ici.
//
// Une Release ne livre rien. CTS Installer lit la révision de main et
// télécharge à cette révision, jamais par un tag : une Release en échec ne
// retarde aucune mise à jour.

import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import {
  MESSAGES_DIRECTORY,
  dashboardAnnouncement,
  dashboardButton,
  installerAnnouncement,
  installerButton
} from './messages.mjs'

const MANIFEST = 'version.json'
const REPOSITORY = process.env.GITHUB_REPOSITORY

/*
 * Lancé hors de GitHub Actions, il publierait pour de bon avec la session
 * gh du poste. Un tag posé par erreur ne se reprend pas une fois les
 * Releases du dépôt immuables : GitHub interdit alors de réutiliser son nom.
 */
if (process.env.GITHUB_ACTIONS !== 'true') {
  console.error('release.mjs publie des Releases : il ne tourne que dans GitHub Actions.')
  process.exit(1)
}

function run(command, args, input) {
  const result = spawnSync(command, args, { encoding: 'utf8', input })

  if (result.status !== 0) {
    const detail = (result.stderr || result.error?.message || '').trim()
    throw new Error(`${command} ${args.slice(0, 2).join(' ')} a échoué : ${detail}`)
  }

  return result.stdout
}

const git = (...args) => run('git', args)

// Un manifeste illisible ne porte aucun numéro : l'historique ancien en
// compte un, et la recherche s'arrête là comme sur un numéro différent.
function numberAt(commit, field) {
  try {
    return JSON.parse(git('show', `${commit}:${MANIFEST}`))[field]
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}

/*
 * Le commit où le numéro est arrivé : le plus ancien d'une suite
 * ininterrompue qui le porte, en ne suivant que le premier parent. Une pull
 * request arrive sur main par son commit de fusion, et c'est l'état de main
 * à cet instant que le numéro a publié, pas celui de la branche.
 */
function arrivalCommit(field, number) {
  const commits = git('log', '--first-parent', '--format=%H', 'HEAD', '--', MANIFEST)
  let arrival = null

  for (const commit of commits.split('\n').filter(Boolean)) {
    if (numberAt(commit, field) !== number) break
    arrival = commit
  }

  return arrival
}

/*
 * Les Releases elles-mêmes, et non les tags : un tag resté seul, posé à la
 * main ou survivant à une Release supprimée, ne doit pas passer pour une
 * publication.
 */
const releases = JSON.parse(
  run('gh', [
    'release', 'list',
    '--repo', REPOSITORY,
    '--exclude-drafts',
    '--limit', '1000',
    '--json', 'tagName,publishedAt'
  ])
)

const latestOfFamily = prefix =>
  releases
    .filter(release => release.tagName.startsWith(prefix))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0]?.tagName ?? null

/*
 * gh réutilise un tag existant et ignore alors --target. Un tag resté seul
 * sur un autre commit donnerait donc une Release qui désigne un autre état
 * des fichiers, et qui, une fois les Releases immuables, ne se corrigerait
 * plus.
 */
function checkExistingTag(release) {
  if (!git('tag', '--list', release.tag).trim()) return

  const tagged = git('rev-list', '-n', '1', release.tag).trim()

  if (tagged !== release.commit) {
    throw new Error(
      `${release.tag} : le tag existe déjà sur ${tagged.slice(0, 7)}, alors que le ` +
      `numéro est arrivé sur ${release.commit.slice(0, 7)}. Rien n'est publié.`
    )
  }
}

const notesOf = message => [
  '## Le message pour la communauté',
  '',
  '```',
  message.trimEnd(),
  '```',
  ''
].join('\n')

function publish(release) {
  if (releases.some(published => published.tagName === release.tag)) {
    console.log(`${release.tag} : déjà publiée.`)
    return
  }

  if (!release.message) {
    throw new Error(
      `${release.tag} : aucun message de ${MESSAGES_DIRECTORY}/ ne cite « ${release.button} ». ` +
      `Le message s'écrit d'après MESSAGES.md, puis le workflow se relance ` +
      `depuis l'onglet Actions.`
    )
  }

  checkExistingTag(release)

  const args = [
    'release', 'create', release.tag,
    '--repo', REPOSITORY,
    '--target', release.commit,
    '--title', release.title,
    '--notes-file', '-',
    `--latest=${release.latest}`
  ]

  /*
   * Sans point de départ explicite, GitHub prend la Release précédente,
   * quelle que soit sa famille : la liste d'une version du Dashboard
   * partirait d'une version de l'installateur. Sans Release précédente dans
   * la famille, il n'y a pas de liste du tout plutôt qu'une liste qui
   * remonterait au début du dépôt.
   */
  const start = latestOfFamily(release.prefix)
  if (start) args.push('--generate-notes', '--notes-start-tag', start)

  run('gh', args, notesOf(fs.readFileSync(release.message, 'utf8')))
  console.log(
    `${release.tag} publiée sur ${release.commit.slice(0, 7)}, avec ${release.message}, ` +
    `depuis ${start || 'aucune Release précédente'}.`
  )
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))

const dashboard = {
  prefix: 'v',
  tag: `v${manifest.version}`,
  title: `CTS Dashboard ${manifest.version}`,
  commit: arrivalCommit('version', manifest.version),
  button: dashboardButton(manifest.version),
  message: dashboardAnnouncement(manifest.version),
  // GitHub donne « Latest » à la dernière Release publiée : une version de
  // l'installateur la prendrait sinon à la version qui parle.
  latest: true
}

const installer = {
  prefix: 'installer-v',
  tag: `installer-v${manifest.installerVersion}`,
  title: `CTS Installer ${manifest.installerVersion}`,
  commit: arrivalCommit('installerVersion', manifest.installerVersion),
  button: installerButton(manifest.installerVersion),
  message: installerAnnouncement(manifest.installerVersion),
  latest: false
}

const failures = []

for (const release of [dashboard, installer]) {
  try {
    publish(release)
  } catch (error) {
    failures.push(error.message)
  }
}

if (failures.length) {
  for (const failure of failures) console.error(failure)
  process.exit(1)
}
