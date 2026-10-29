import fs from 'node:fs'
import path from 'node:path'

export const MESSAGES_DIRECTORY = 'messages'

// Cherché dans tout le dossier : un installateur publié avec le Dashboard est annoncé par le message de celui-ci.
function announcement(button, ownName) {
  if (!fs.existsSync(MESSAGES_DIRECTORY)) return null

  const others = fs.readdirSync(MESSAGES_DIRECTORY)
    .filter(name => name.endsWith('.txt') && name !== ownName)
    .sort()

  return [ownName, ...others]
    .map(name => path.join(MESSAGES_DIRECTORY, name))
    .find(file =>
      fs.existsSync(file) &&
      // Une espace insécable copiée de WhatsApp ou d'un clavier français compte comme une espace.
      fs.readFileSync(file, 'utf8').replace(/[  ]/g, ' ').includes(`« ${button} »`)
    ) ?? null
}

export const dashboardButton = version => `Mettre à jour vers ${version}`
export const installerButton = version => `Installer ${version}`

export const dashboardAnnouncement = version =>
  announcement(dashboardButton(version), `v${version}.txt`)

export const installerAnnouncement = version =>
  announcement(installerButton(version), `installer-v${version}.txt`)
