#!/bin/sh
# Ne doit jamais empêcher une session de s'ouvrir : chaque issue rend la main sans erreur.

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

if apt-get install -y -qq poppler-utils >/dev/null 2>&1 ||
  { apt-get update -qq >/dev/null 2>&1 &&
    apt-get install -y -qq poppler-utils >/dev/null 2>&1; }; then
  echo "poppler-utils installé : les captures PDF sont lisibles."
  exit 0
fi

echo "Installation de poppler-utils impossible : les captures PDF ne s'afficheront pas."
exit 0
