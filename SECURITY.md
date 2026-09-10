# Politique de sécurité

CTS Dashboard est un widget installé sur les iPhone de conducteurs, consulté
avant une prise de service. Un défaut qui expose des données ou qui permet
d'écrire sur ces téléphones se traite autrement qu'une panne d'affichage.

## Ce qui est suivi

La dernière version publiée, celle qu'annonce
[`version.json`](version.json), est la seule maintenue. Une correction de
sécurité prend un numéro neuf et part par CTS Installer, comme le reste.

## Signaler une faille

**N'ouvrez pas d'issue publique, et n'en parlez pas dans le groupe
WhatsApp** : le dépôt est public, et une faille décrite avant d'être
corrigée est une faille offerte.

Sur la page du dépôt, onglet **Security**, bouton **Report a vulnerability**.
Le signalement reste privé entre vous et le mainteneur jusqu'à la
correction. Un compte GitHub suffit, aucune adresse à écrire nulle part.

Décrivez ce que vous avez constaté et comment le reproduire. Si vous joignez
une capture d'écran, masquez le nom, le matricule et les horaires : ils
n'ont rien à faire dans un signalement.

Le projet est tenu par une seule personne, sur son temps libre : comptez
quelques jours pour une première réponse. Il n'y a aucune récompense à la
clé, et rien d'autre à attendre que la correction elle-même.

## Ce qui n'est pas une faille

Un widget qui n'affiche rien, une carte d'agent qui n'est pas reconnue, une
mise à jour qui échoue : c'est une panne, et elle passe par le **Diagnostic**
de CTS Installer et par le groupe WhatsApp. La marche à suivre est dans le
[README](README.md#en-cas-de-problème).

## Ce que ce dépôt ne contient pas

Aucun secret n'est versionné, et la validation refuse un commit qui en
introduirait un. La capacité d'administration du projet tient à une clé
conservée dans le Keychain du mainteneur et vérifiée par le serveur : sans
elle, l'API de statistiques répond 401, quel que soit le code exécuté.
