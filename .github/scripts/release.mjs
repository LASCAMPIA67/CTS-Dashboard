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

function numberAt(commit, field) {
  try {
    return JSON.parse(git('show', `${commit}:${MANIFEST}`))[field]
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}

// Premier parent seulement : une pull request arrive par sa fusion, et c'est l'état de main qu'elle publie.
function arrivalCommit(field, number) {
  const commits = git('log', '--first-parent', '--format=%H', 'HEAD', '--', MANIFEST)
  let arrival = null

  for (const commit of commits.split('\n').filter(Boolean)) {
    if (numberAt(commit, field) !== number) break
    arrival = commit
  }

  return arrival
}

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

// gh réutilise un tag existant et ignore alors --target : la Release désignerait un autre état.
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

  // Sans --notes-start-tag, GitHub part de la Release précédente, quelle que soit sa famille.
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
  // Sinon « Latest » irait à la dernière publiée, parfois celle de l'installateur.
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
