#!/bin/sh
# Rend les captures d'écran lisibles dès l'ouverture d'une session.
#
# Elles arrivent en PDF, et aucune page ne s'affiche sans pdftoppm, que
# le paquet poppler-utils apporte et que la machine de travail distante
# n'embarque pas.
#
# Hors machine distante, il n'y a rien à faire : une installation locale
# a ses propres outils, et ce script n'a pas à y toucher.
#
# Il ne doit jamais empêcher une session de s'ouvrir : il rend donc la
# main sans erreur même quand l'installation échoue, en disant à quoi
# s'en tenir — sa sortie est lue au démarrage.

set -u

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

if command -v pdftoppm >/dev/null 2>&1; then
  exit 0
fi

if [ "$(id -u)" -ne 0 ] || ! command -v apt-get >/dev/null 2>&1; then
  echo "Lecture des PDF indisponible : poppler-utils ne peut pas être installé ici."
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive

# Les listes de paquets de l'image peuvent être vides ou périmées. Les
# rafraîchir coûte une trentaine de secondes, et n'a lieu qu'en second
# recours.
if apt-get install -y -qq poppler-utils >/dev/null 2>&1 ||
  { apt-get update -qq >/dev/null 2>&1 &&
    apt-get install -y -qq poppler-utils >/dev/null 2>&1; }; then
  echo "poppler-utils installé : les captures PDF sont lisibles."
  exit 0
fi

echo "Installation de poppler-utils impossible : les captures PDF ne s'afficheront pas."
exit 0
