// Le message pour la communauté qui annonce un numéro.
//
// La validation et le workflow des Releases en partagent la règle, et ce
// fichier en est l'unique exemplaire : si la validation acceptait ce que le
// workflow refuse, l'écart ne se verrait qu'après la fusion, le numéro déjà
// parti sur les iPhone et sa Release en échec.

import fs from 'node:fs'
import path from 'node:path'

export const MESSAGES_DIRECTORY = 'messages'

/*
 * Le message qui annonce un numéro cite, mot pour mot, le bouton qui
 * l'installe : MESSAGES.md exige le libellé affiché, et chaque numéro n'est
 * annoncé qu'une fois. Il se cherche dans tout le dossier, parce qu'un
 * installateur publié avec le Dashboard est annoncé par le message de ce
 * Dashboard-là, que le Dashboard suivant ne recite pas. Le fichier qui
 * porte le nom du numéro passe en premier.
 *
 * Un message recopié depuis WhatsApp ou un clavier français porte souvent
 * une espace insécable entre les guillemets et le libellé : elle compte ici
 * comme une espace.
 */
function announcement(button, ownName) {
  if (!fs.existsSync(MESSAGES_DIRECTORY)) return null

  const others = fs.readdirSync(MESSAGES_DIRECTORY)
    .filter(name => name.endsWith('.txt') && name !== ownName)
    .sort()

  return [ownName, ...others]
    .map(name => path.join(MESSAGES_DIRECTORY, name))
    .find(file =>
      fs.existsSync(file) &&
      fs.readFileSync(file, 'utf8').replace(/[  ]/g, ' ').includes(`« ${button} »`)
    ) ?? null
}

export const dashboardButton = version => `Mettre à jour vers ${version}`
export const installerButton = version => `Installer ${version}`

export const dashboardAnnouncement = version =>
  announcement(dashboardButton(version), `v${version}.txt`)

export const installerAnnouncement = version =>
  announcement(installerButton(version), `installer-v${version}.txt`)
