#!/usr/bin/env bash
# Plans one root from GitHub Actions and reports only what will change (ADR
# 0024). The repository is public, so tofu's own output, which describes the
# changes, is discarded: errors still reach the log, through stderr. The saved
# plan goes to the private plans/ prefix of the state bucket.
# Usage: infra/ci/tofu-plan.sh ROOT BUCKET

set -euo pipefail

root=$1
bucket=$2
ci_dir="$(cd "$(dirname "$0")" && pwd)"
plan_file="$RUNNER_TEMP/$root.tfplan"
report="$RUNNER_TEMP/tofu-summary.md"
# plan identity can't overwrite objects, so every attempt gets its own name.
object="gs://$bucket/plans/$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT.tfplan"

cd "$ci_dir/../envs/$root"
tofu init -input=false -lockfile=readonly -no-color
# -lock=false: this identity can't write the lock. OpenTofu refuses to apply a
# saved plan if the state has moved since, so a race can't go unnoticed.
tofu plan -input=false -no-color -lock=false -out="$plan_file" >/dev/null
changes="$(tofu show -json "$plan_file" | jq -r -f "$ci_dir/plan-summary.jq")"

if [ -z "$changes" ]; then
  section="**$root**: no changes"
else
  gcloud storage cp --quiet "$plan_file" "$object"
  echo "object=$object" >>"$GITHUB_OUTPUT"
  section="**$root**: full plan in \`$object\`

$changes"
fi

echo "$section"
printf '%s\n\n' "$section" >>"$report"
