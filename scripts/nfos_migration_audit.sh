#!/usr/bin/env bash
set -u

echo "===================================================="
echo " NFOS migration reproducibility audit"
echo "===================================================="
echo

EXPECTED=(
20260930234814
20260930235500
20261001001147
20261001001311
20261001001353
20261001002846
20261001003128
20261001003209
20261001003328
20261001003900
20261001005021
20261001005619
20261001005835
20261001010536
20261001010653
20261001010801
20261001014617
20261001014648
20261001014710
20261001014846
20261001015242
20261001015712
20261001015941
20261001020207
20261001020329
20261001020748
20261001021041
20261001021209
20261001024132
20261001030223
)

missing=0
for version in "${EXPECTED[@]}"; do
  shopt -s nullglob
  matches=(supabase/migrations/${version}_*.sql)
  shopt -u nullglob
  if [ ${#matches[@]} -eq 0 ]; then
    echo "MISSING LOCAL MIGRATION: $version"
    missing=$((missing+1))
  fi
done

echo
if [ "$missing" -eq 0 ]; then
  echo "PASS: every migration version currently recorded in the live NFOS migration history is represented locally."
else
  echo "ATTENTION: $missing tracked NFOS migration version(s) are missing locally."
  echo "Do NOT run a final db push until local/remote migration history is reconciled."
fi

echo
if command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI:"
  supabase --version || true
  echo
  echo "Local vs linked migration history:"
  supabase migration list --linked || {
    echo
    echo "Could not read the linked migration history."
    echo "If the repo is not linked, use: supabase link --project-ref yofreizhbgmjsyzlceyy"
  }
else
  echo "Supabase CLI is not installed, so linked migration history could not be checked."
fi

echo
echo "This audit is read-only. It does not run db pull, db push, migration repair, or reset."

