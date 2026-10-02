#!/bin/bash
set -e

MSG="${1:-update: $(date '+%Y-%m-%d %H:%M')}"

echo "→ Staging modifiche..."
git add -A

if git diff --cached --quiet; then
  echo "ℹ️  Nessuna modifica da committare, procedo con il deploy."
else
  echo "→ Commit: \"$MSG\""
  git commit -m "$MSG"

  echo "→ Push su GitHub..."
  git push
fi

echo "→ Deploy su Vercel..."
vercel deploy --prod --yes

echo ""
echo "✅ Online su https://crm-wake-up-es.vercel.app"
