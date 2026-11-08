#!/usr/bin/env bash
# What OpenTofu needs before it can run (ADR 0024), kept outside OpenTofu so an
# apply can never lock itself out: the state bucket and, per project, the
# identities github-tofu-plan (read-only) and github-tofu (applies). Needs the
# project's Workload Identity pool from liftbig-api/scripts/gcp-setup.sh.
# Safe to run again; IAM grants are only ever added.
# --dry-run prints every changing gcloud command instead of running it.

set -euo pipefail

BUCKET_LOCATION=europe-west1
POOL=github
PROVIDER=liftbig-github
# Saved plans can hold values in cleartext, so they don't stay around.
PLAN_RETENTION_DAYS=14
# Older copies of the state kept for recovery.
STATE_VERSIONS_KEPT=30

usage() {
  cat <<'EOF'
Usage: infra/bootstrap.sh --project ID --environment production|staging [options]

One-time setup for OpenTofu in one Google Cloud project. Run it with --dry-run
first.

Options:
  --project ID        Google Cloud project ID
  --environment NAME  production or staging
  --registry-project ID
                      Project holding the Docker repository (default liftbigapi)
  --github-repo OWNER/REPO
                      Repository whose workflows may run OpenTofu (default
                      IvanTachev233/LiftBig)
  --github-sub-prefix PREFIX
                      Start of the repository's OIDC sub claim (read with gh
                      when unset), e.g. repo:owner@123/name@456
  --dry-run           Print the changing commands instead of running them;
                      needs no login
  -h, --help          Show this help
EOF
}

die() {
  echo "Error: $*" >&2
  exit 1
}

DRY_RUN=false
while [ $# -gt 0 ]; do
  case "$1" in
    --project | --environment | --registry-project | --github-repo | --github-sub-prefix)
      [ $# -ge 2 ] || die "$1 needs a value"
      case "$1" in
        --project) PROJECT=$2 ;;
        --environment) ENVIRONMENT=$2 ;;
        --registry-project) REGISTRY_PROJECT=$2 ;;
        --github-repo) GITHUB_REPO=$2 ;;
        --github-sub-prefix) GITHUB_SUB_PREFIX=$2 ;;
      esac
      shift
      ;;
    --project=*) PROJECT=${1#*=} ;;
    --environment=*) ENVIRONMENT=${1#*=} ;;
    --registry-project=*) REGISTRY_PROJECT=${1#*=} ;;
    --github-repo=*) GITHUB_REPO=${1#*=} ;;
    --github-sub-prefix=*) GITHUB_SUB_PREFIX=${1#*=} ;;
    --dry-run) DRY_RUN=true ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

[ -n "${PROJECT:-}" ] || die "--project is required"
[[ "$PROJECT" =~ ^[a-z][a-z0-9-]+$ ]] || die "--project must be the string project ID: $PROJECT"
case "${ENVIRONMENT:-}" in
  production | staging) ;;
  *) die "--environment must be production or staging" ;;
esac
REGISTRY_PROJECT=${REGISTRY_PROJECT:-liftbigapi}
GITHUB_REPO=${GITHUB_REPO:-IvanTachev233/LiftBig}
[[ "$GITHUB_REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] ||
  die "--github-repo must be OWNER/REPO: $GITHUB_REPO"
if [ "$ENVIRONMENT" = staging ] && [ "$PROJECT" = "$REGISTRY_PROJECT" ]; then
  die "staging must be its own project (ADR 0015), not $REGISTRY_PROJECT"
fi
if [ "$ENVIRONMENT" = production ] && [ "$PROJECT" != "$REGISTRY_PROJECT" ]; then
  die "production is expected in the registry project $REGISTRY_PROJECT, not $PROJECT"
fi

# Changing gcloud calls go through run: printed under --dry-run, run otherwise.
run() {
  if [ "$DRY_RUN" = true ]; then
    printf '+'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

# Under --dry-run everything counts as missing, so the output shows every create.
exists() {
  [ "$DRY_RUN" = false ] && "$@" >/dev/null 2>&1
}

# IAM is eventually consistent: a service account created a moment ago may not
# be found yet, so retry with backoff (about 2.5 minutes in all).
grant() {
  local delay
  if [ "$DRY_RUN" = true ]; then
    run "$@" --quiet
    return
  fi
  for delay in 5 10 20 40 80; do
    "$@" --quiet >/dev/null 2>&1 && return 0
    echo "Grant failed ($*); retrying in ${delay}s..." >&2
    sleep "$delay"
  done
  "$@" --quiet >/dev/null
}

if [ "$DRY_RUN" = true ]; then
  project_number="<number-of-$PROJECT>"
else
  command -v gcloud >/dev/null 2>&1 || die "gcloud CLI not found"
  project_number="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')" ||
    die "can't read project $PROJECT; check your gcloud login"
  gcloud iam workload-identity-pools providers describe "$PROVIDER" --project="$PROJECT" \
    --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1 ||
    die "provider $PROVIDER not found in $PROJECT; run liftbig-api/scripts/gcp-setup.sh first"
fi

# The impersonation grants must match GitHub's sub claim exactly, and on
# immutable subjects it has ids in it, so ask GitHub (the A7e failure).
if [ -z "${GITHUB_SUB_PREFIX:-}" ]; then
  if [ "$DRY_RUN" = true ]; then
    GITHUB_SUB_PREFIX="<sub-prefix-of-$GITHUB_REPO>"
  else
    GITHUB_SUB_PREFIX="$(gh api "repos/$GITHUB_REPO/actions/oidc/customization/sub" \
      --jq .sub_claim_prefix)" ||
      die "couldn't read the OIDC subject of $GITHUB_REPO with gh; pass --github-sub-prefix"
  fi
fi
[ "$DRY_RUN" = true ] || [[ "$GITHUB_SUB_PREFIX" =~ ^repo:[^:[:space:]]+$ ]] ||
  die "--github-sub-prefix must look like repo:owner/name (no trailing colon): $GITHUB_SUB_PREFIX"

subject_member() {
  echo "principal://iam.googleapis.com/projects/$project_number/locations/global/workloadIdentityPools/$POOL/subject/$GITHUB_SUB_PREFIX:$1"
}

bucket="$PROJECT-tfstate"
plan_sa="github-tofu-plan@$PROJECT.iam.gserviceaccount.com"
apply_sa="github-tofu@$PROJECT.iam.gserviceaccount.com"
runtime_sa="liftbig-api-runtime@$PROJECT.iam.gserviceaccount.com"
github_environment="infra-$ENVIRONMENT"

echo "Bootstrapping OpenTofu for $ENVIRONMENT in $PROJECT."

# APIs the provider calls. google_project_service takes over in OpenTofu, but
# the first plan can't run without these.
run gcloud services enable cloudresourcemanager.googleapis.com serviceusage.googleapis.com \
  storage.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  run.googleapis.com secretmanager.googleapis.com monitoring.googleapis.com --project="$PROJECT"

if exists gcloud storage buckets describe "gs://$bucket"; then
  echo "Bucket gs://$bucket exists; versioning and lifecycle are re-applied."
else
  echo "Creating the state bucket gs://$bucket ($BUCKET_LOCATION)..."
  run gcloud storage buckets create "gs://$bucket" --project="$PROJECT" \
    --location="$BUCKET_LOCATION" --uniform-bucket-level-access --public-access-prevention
fi

# Saved plans go after 14 days; of the state, the newest 30 older copies stay.
lifecycle_file="$(mktemp)"
trap 'rm -f "$lifecycle_file"' EXIT
printf '{"rule":[{"action":{"type":"Delete"},"condition":{"age":%s,"matchesPrefix":["plans/"]}},{"action":{"type":"Delete"},"condition":{"isLive":false,"numNewerVersions":%s}}]}\n' \
  "$PLAN_RETENTION_DAYS" "$STATE_VERSIONS_KEPT" >"$lifecycle_file"
[ "$DRY_RUN" = false ] || echo "  lifecycle: $(cat "$lifecycle_file")"
run gcloud storage buckets update "gs://$bucket" --versioning --lifecycle-file="$lifecycle_file"

create_sa() {
  local name=$1 description=$2
  if exists gcloud iam service-accounts describe "$name@$PROJECT.iam.gserviceaccount.com" \
    --project="$PROJECT"; then
    echo "Service account $name exists; left unchanged."
  else
    echo "Creating the service account $name..."
    run gcloud iam service-accounts create "$name" --project="$PROJECT" \
      --display-name="$name" --description="$description"
  fi
}

project_grant() {
  grant gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:$1" --role="$2" --condition=None
}

impersonation_grant() {
  grant gcloud iam service-accounts add-iam-policy-binding "$1" --project="$PROJECT" \
    --role=roles/iam.workloadIdentityUser --member="$(subject_member "$2")"
}

# --- Read-only: plans on pull requests and on master ------------------------
# Reads no secret values: Viewer lets it see secrets' metadata only.
create_sa github-tofu-plan "Runs tofu plan from GitHub Actions, read-only (ADR 0024)"
for role in roles/viewer roles/iam.securityReviewer roles/storage.bucketViewer \
  roles/serviceusage.serviceUsageConsumer; do
  project_grant "$plan_sa" "$role"
done
grant gcloud storage buckets add-iam-policy-binding "gs://$bucket" \
  --member="serviceAccount:$plan_sa" --role=roles/storage.objectViewer
# It writes saved plans under plans/ and nothing else, so never the state.
grant gcloud storage buckets add-iam-policy-binding "gs://$bucket" \
  --member="serviceAccount:$plan_sa" --role=roles/storage.objectCreator \
  --condition="expression=resource.name.startsWith('projects/_/buckets/$bucket/objects/plans/'),title=plans-only,description=Saved plans only"
impersonation_grant "$plan_sa" pull_request
impersonation_grant "$plan_sa" ref:refs/heads/master

# --- Applies: only jobs in this project's GitHub environment ------------------
# Listed roles rather than Owner. Together they are close to it (IAM admin can
# grant more); the environment's branch rule and reviewer are what guard them.
create_sa github-tofu "Runs tofu apply from GitHub Actions in $github_environment (ADR 0024)"
apply_roles=(roles/run.admin roles/iam.serviceAccountAdmin roles/iam.workloadIdentityPoolAdmin
  roles/resourcemanager.projectIamAdmin roles/secretmanager.admin roles/storage.admin
  roles/monitoring.admin roles/serviceusage.serviceUsageAdmin)
[ "$PROJECT" != "$REGISTRY_PROJECT" ] || apply_roles+=(roles/artifactregistry.admin)
for role in "${apply_roles[@]}"; do
  project_grant "$apply_sa" "$role"
done
# Setting a Cloud Run service's runtime identity needs actAs on that account.
grant gcloud iam service-accounts add-iam-policy-binding "$runtime_sa" --project="$PROJECT" \
  --role=roles/iam.serviceAccountUser --member="serviceAccount:$apply_sa"
impersonation_grant "$apply_sa" "environment:$github_environment"

suffix="$(printf '%s' "$ENVIRONMENT" | tr '[:lower:]' '[:upper:]')"
provider_name="projects/$project_number/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"
echo
if [ "$DRY_RUN" = true ]; then
  echo "Dry run: nothing was changed."
else
  echo "Done: gs://$bucket, $plan_sa and $apply_sa."
fi
echo
echo "GitHub → Settings → Environments → $github_environment → variables:"
echo "  TOFU_WIF_PROVIDER=$provider_name"
echo "  TOFU_SA=$apply_sa"
echo "Repository variables (Settings → Secrets and variables → Actions → Variables):"
echo "  TOFU_PLAN_WIF_PROVIDER_$suffix=$provider_name"
echo "  TOFU_PLAN_SA_$suffix=$plan_sa"
