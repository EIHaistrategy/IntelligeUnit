#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js non trovato. Installa la versione LTS da https://nodejs.org e riprova."
  read -p "Premi Invio per chiudere"; exit 1
fi
[ -d node_modules ] || npm install --omit=dev
(sleep 2; open "http://localhost:3000/admin") &
npm start
