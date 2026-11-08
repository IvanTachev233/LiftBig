#!/usr/bin/env bash
# Applies exactly the saved plan that was approved (ADR 0024). tofu's output is
# discarded as in tofu-plan.sh; errors still reach the log, through stderr.
# Usage: infra/ci/tofu-apply.sh ROOT OBJECT

set -euo pipefail

root=$1
object=$2
ci_dir="$(cd "$(dirname "$0")" && pwd)"
plan_file="$RUNNER_TEMP/$root.tfplan"

cd "$ci_dir/../envs/$root"
tofu init -input=false -lockfile=readonly -no-color
gcloud storage cp --quiet "$object" "$plan_file"

# A plan that changes the Cloud Run service carries the deploy-owned fields
# (image, env vars) as they were when it was made, and applying it writes them
# back. OpenTofu's stale-plan check only sees the state, so a deploy made since
# the plan has to be caught here, or the apply would undo it.
tofu show -json "$plan_file" |
  jq -r '.resource_changes[]?
    | select(.type == "google_cloud_run_v2_service" and .change.actions != ["no-op"])
    | [.change.before.project, .change.before.location, .change.before.name, .change.before.latest_created_revision]
    | @tsv' |
  while IFS=$'\t' read -r project region service planned; do
    live="$(gcloud run services describe "$service" --project="$project" --region="$region" \
      --format='value(status.latestCreatedRevisionName)')"
    planned="${planned##*/}" # the plan holds the full resource name
    if [ "$live" != "$planned" ]; then
      echo "::error::$service was deployed after this plan ($planned, now $live). Run the workflow on master for a fresh plan."
      exit 1
    fi
  done

tofu apply -input=false -no-color "$plan_file" >/dev/null
echo "Applied the saved plan to $root."
