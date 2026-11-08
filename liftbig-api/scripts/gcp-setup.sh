#!/usr/bin/env bash
# One-time Google Cloud setup of one environment (production or staging) for
# scripts/deploy.sh and the pipeline (ADR 0023): login, APIs, the service's
# runtime service account, the bug-report screenshot bucket (production), the
# public exercise demo media bucket, the Secret Manager secrets it reads
# (created here if missing, values typed hidden and never printed;
# GITHUB_FEEDBACK_TOKEN is created with no value — add it yourself, see the
# README), and the pipeline's identities: Workload Identity pool and provider,
# github-deployer, and in the registry project the liftbig Docker repository
# and github-builder. Safe to run again; existing secrets, buckets, accounts and
# the repository are left as they are, and IAM grants are only ever added.
# --dry-run prints every gcloud command instead of running it.

set -euo pipefail

REGION=europe-west1
# Bucket region (ADR 0021 / 0026): London.
BUCKET_LOCATION=europe-west2
# Screenshots are deleted automatically this many days after upload.
BUCKET_LIFECYCLE_DAYS=90
REGISTRY=liftbig
POOL=github
PROVIDER=liftbig-github
# Images kept by the cleanup policy (ADR 0023): the newest 30, and anything
# younger than 30 days.
KEEP_IMAGES=30

usage() {
  cat <<'EOF'
Usage: scripts/gcp-setup.sh [options]

One-time setup of a Google Cloud project for scripts/deploy.sh and the
pipeline. Run it in a terminal: it asks for the secret values. Run it for
production (the registry project) before staging.

Options:
  --project ID      Google Cloud project ID (env GCP_PROJECT_ID; asked if unset)
  --environment NAME
                    production or staging (env DEPLOY_ENVIRONMENT, default
                    production). Staging gets no MAIL_PROVIDER_KEY, no
                    GITHUB_FEEDBACK_TOKEN and no bug-report bucket
  --service NAME    Cloud Run service (env SERVICE, default liftbig-api)
  --service-account EMAIL
                    Service account the service runs as (env RUNTIME_SA,
                    default liftbig-api-runtime@<project>.iam.gserviceaccount.com;
                    created when it is that default and missing)
  --bucket NAME     Bug-report screenshot bucket, production only (env
                    BUG_REPORT_BUCKET, default <project>-bug-reports; created
                    when missing)
  --media-bucket NAME
                    Public exercise demo media bucket (env
                    EXERCISE_MEDIA_BUCKET, default <project>-media; created
                    when missing; ADR 0026)
  --registry-project ID
                    Project holding the liftbig Docker repository and
                    github-builder (env REGISTRY_PROJECT, default liftbigapi)
  --github-repo OWNER/REPO
                    Repository whose workflows may deploy (env GITHUB_REPO,
                    default IvanTachev233/LiftBig)
  --github-repo-id ID
                    Its numeric id (env GITHUB_REPO_ID; looked up on
                    api.github.com when unset)
  --github-sub-prefix PREFIX
                    Start of the repository's OIDC sub claim (env
                    GITHUB_SUB_PREFIX; read with gh when unset), e.g.
                    repo:owner@123/name@456
  --dry-run         Print the gcloud commands instead of running them; needs
                    no login and no terminal
  -h, --help        Show this help
EOF
}

die() {
  echo "Error: $*" >&2
  exit 1
}

DRY_RUN=false
while [ $# -gt 0 ]; do
  case "$1" in
    --project | --environment | --service | --service-account | --bucket | --media-bucket | \
      --registry-project | --github-repo | --github-repo-id | --github-sub-prefix)
      [ $# -ge 2 ] || die "$1 needs a value"
      case "$1" in
        --project) GCP_PROJECT_ID=$2 ;;
        --environment) DEPLOY_ENVIRONMENT=$2 ;;
        --service) SERVICE=$2 ;;
        --service-account) RUNTIME_SA=$2 ;;
        --bucket) BUG_REPORT_BUCKET=$2 ;;
        --media-bucket) EXERCISE_MEDIA_BUCKET=$2 ;;
        --registry-project) REGISTRY_PROJECT=$2 ;;
        --github-repo) GITHUB_REPO=$2 ;;
        --github-repo-id) GITHUB_REPO_ID=$2 ;;
        --github-sub-prefix) GITHUB_SUB_PREFIX=$2 ;;
      esac
      shift
      ;;
    --project=*) GCP_PROJECT_ID=${1#*=} ;;
    --environment=*) DEPLOY_ENVIRONMENT=${1#*=} ;;
    --service=*) SERVICE=${1#*=} ;;
    --service-account=*) RUNTIME_SA=${1#*=} ;;
    --bucket=*) BUG_REPORT_BUCKET=${1#*=} ;;
    --media-bucket=*) EXERCISE_MEDIA_BUCKET=${1#*=} ;;
    --registry-project=*) REGISTRY_PROJECT=${1#*=} ;;
    --github-repo=*) GITHUB_REPO=${1#*=} ;;
    --github-repo-id=*) GITHUB_REPO_ID=${1#*=} ;;
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

SERVICE=${SERVICE:-liftbig-api}
ENVIRONMENT=${DEPLOY_ENVIRONMENT:-production}
REGISTRY_PROJECT=${REGISTRY_PROJECT:-liftbigapi}
GITHUB_REPO=${GITHUB_REPO:-IvanTachev233/LiftBig}
case "$ENVIRONMENT" in
  production | staging) ;;
  *) die "--environment must be production or staging: $ENVIRONMENT" ;;
esac
[[ "$GITHUB_REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] ||
  die "--github-repo must be OWNER/REPO: $GITHUB_REPO"

# Staging runs without mail (codes in the log) and without bug reports
# (ADR 0023 § 5), so it gets neither secret nor the screenshot bucket.
if [ "$ENVIRONMENT" = production ]; then
  SECRETS=(DATABASE_URL JWT_SECRET MAIL_PROVIDER_KEY)
  # Created empty: Ivan adds the version himself (see the README), this script
  # never reads or types the value.
  EMPTY_SECRETS=(GITHUB_FEEDBACK_TOKEN)
else
  SECRETS=(DATABASE_URL JWT_SECRET)
  EMPTY_SECRETS=()
fi

# Mutating gcloud calls go through run: printed under --dry-run, run otherwise.
run() {
  if [ "$DRY_RUN" = true ]; then
    printf '+'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

# Read-only existence checks: under --dry-run everything counts as missing, so
# the plan shows every create.
exists() {
  [ "$DRY_RUN" = false ] && "$@" >/dev/null 2>&1
}

# IAM is eventually consistent: a principal created a moment ago may not be
# found yet, so retry with backoff (about 2.5 minutes in all).
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

if [ "$DRY_RUN" = false ]; then
  [ -t 0 ] || die "run this in a terminal; it asks for secret values"
  command -v gcloud >/dev/null 2>&1 ||
    die "gcloud CLI not found; install it: https://cloud.google.com/sdk/docs/install"
  account="$(gcloud config get-value account 2>/dev/null || true)"
  if [ -z "$account" ] || [ "$account" = "(unset)" ]; then
    echo "No active Google Cloud account; logging in."
    gcloud auth login
  fi
fi

if [ -z "${GCP_PROJECT_ID:-}" ]; then
  [ "$DRY_RUN" = false ] || die "--dry-run needs --project"
  gcloud projects list
  read -r -p "Project ID (the string ID, not the project number): " GCP_PROJECT_ID
fi
[ -n "$GCP_PROJECT_ID" ] || die "a project ID is required"
[[ "$GCP_PROJECT_ID" =~ ^[0-9]+$ ]] &&
  die "that is the project number; use the string project ID"
if [ "$ENVIRONMENT" = staging ] && [ "$GCP_PROJECT_ID" = "$REGISTRY_PROJECT" ]; then
  die "staging must be its own project (ADR 0015), not the registry project $REGISTRY_PROJECT"
fi

project_number_of() {
  if [ "$DRY_RUN" = true ]; then
    echo "<number-of-$1>"
  else
    gcloud projects describe "$1" --format='value(projectNumber)'
  fi
}
project_number="$(project_number_of "$GCP_PROJECT_ID")"
registry_project_number="$(project_number_of "$REGISTRY_PROJECT")"

# The provider's condition uses the repository's numeric id, which can't be
# reused if the repository is deleted (Google's advice against name squatting).
if [ -z "${GITHUB_REPO_ID:-}" ]; then
  if [ "$DRY_RUN" = true ]; then
    GITHUB_REPO_ID="<id-of-$GITHUB_REPO>"
  else
    GITHUB_REPO_ID="$(curl -fsS "https://api.github.com/repos/$GITHUB_REPO" |
      python3 -c 'import json, sys; print(json.load(sys.stdin)["id"])')" ||
      die "couldn't look up the id of $GITHUB_REPO; pass --github-repo-id"
  fi
fi
[ "$DRY_RUN" = true ] || [[ "$GITHUB_REPO_ID" =~ ^[0-9]+$ ]] ||
  die "--github-repo-id must be numeric: $GITHUB_REPO_ID"

# The start of GitHub's OIDC sub claim, which the impersonation grants must
# match exactly. Repositories on immutable subjects have ids in it
# (repo:owner@<id>/name@<id>), so ask GitHub rather than build it from the name.
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

echo "Setting up $ENVIRONMENT in $GCP_PROJECT_ID (registry in $REGISTRY_PROJECT, repository $GITHUB_REPO)."

echo "Enabling the Cloud Run, Artifact Registry, Secret Manager, IAM, IAM Credentials and STS APIs..."
run gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com iam.googleapis.com iamcredentials.googleapis.com \
  sts.googleapis.com --project="$GCP_PROJECT_ID"

# The service reads its secrets as its runtime service account, the same one
# scripts/deploy.sh deploys with. It gets no project roles, only the secrets.
default_runtime_sa="liftbig-api-runtime@$GCP_PROJECT_ID.iam.gserviceaccount.com"
runtime_sa=${RUNTIME_SA:-$default_runtime_sa}
if ! exists gcloud iam service-accounts describe "$runtime_sa" --project="$GCP_PROJECT_ID"; then
  [ "$DRY_RUN" = true ] || [ "$runtime_sa" = "$default_runtime_sa" ] ||
    die "service account $runtime_sa not found; create it or leave RUNTIME_SA unset"
  echo "Creating the runtime service account $runtime_sa..."
  run gcloud iam service-accounts create liftbig-api-runtime --project="$GCP_PROJECT_ID" \
    --display-name="liftbig-api runtime" \
    --description="Runtime identity for the $SERVICE Cloud Run service"
fi

# Bug-report screenshots (spec § Stored data / ADR 0021), production only: a
# private bucket in London, with public access prevention and a 90-day
# lifecycle delete. The runtime service account gets object admin on this
# bucket only, not the project.
bucket=""
if [ "$ENVIRONMENT" = production ]; then
  bucket=${BUG_REPORT_BUCKET:-${GCP_PROJECT_ID}-bug-reports}
  if exists gcloud storage buckets describe "gs://$bucket" --project="$GCP_PROJECT_ID"; then
    echo "Bucket gs://$bucket exists; left unchanged."
  else
    echo "Creating the bug-report screenshot bucket gs://$bucket ($BUCKET_LOCATION)..."
    lifecycle_file="$(mktemp)"
    printf '{"rule":[{"action":{"type":"Delete"},"condition":{"age":%s}}]}\n' \
      "$BUCKET_LIFECYCLE_DAYS" >"$lifecycle_file"
    run gcloud storage buckets create "gs://$bucket" --project="$GCP_PROJECT_ID" \
      --location="$BUCKET_LOCATION" --uniform-bucket-level-access \
      --public-access-prevention --lifecycle-file="$lifecycle_file"
    rm -f "$lifecycle_file"
  fi
  grant gcloud storage buckets add-iam-policy-binding "gs://$bucket" \
    --member="serviceAccount:$runtime_sa" --role=roles/storage.objectAdmin
fi

# Exercise demo media (ADR 0026): a public-read bucket in London for demo
# videos and images only, never private uploads. allUsers gets
# roles/storage.legacyObjectReader (storage.objects.get only), so files can be
# read by URL but the bucket can't be listed. Only the project owner uploads;
# the API never touches it.
media_bucket=${EXERCISE_MEDIA_BUCKET:-${GCP_PROJECT_ID}-media}
if exists gcloud storage buckets describe "gs://$media_bucket" --project="$GCP_PROJECT_ID"; then
  echo "Bucket gs://$media_bucket exists; left unchanged."
else
  echo "Creating the public demo media bucket gs://$media_bucket ($BUCKET_LOCATION)..."
  run gcloud storage buckets create "gs://$media_bucket" --project="$GCP_PROJECT_ID" \
    --location="$BUCKET_LOCATION" --uniform-bucket-level-access \
    --no-public-access-prevention
fi
media_read=(gcloud storage buckets add-iam-policy-binding "gs://$media_bucket"
  --member=allUsers --role=roles/storage.legacyObjectReader)
if [ "$DRY_RUN" = true ]; then
  run "${media_read[@]}"
else
  "${media_read[@]}" >/dev/null ||
    die "public read on gs://$media_bucket failed; public access prevention may be enforced on the bucket or by an organization policy"
fi

read_secret() {
  local name=$1 value
  if [ "$DRY_RUN" = true ]; then
    echo "+ (asks for $name, hidden) | gcloud secrets create $name --project=$GCP_PROJECT_ID --data-file=-"
    return
  fi
  while true; do
    case "$name" in
      DATABASE_URL) read -r -s -p "DATABASE_URL for $ENVIRONMENT (postgresql://...): " value ;;
      JWT_SECRET) read -r -s -p "JWT_SECRET (blank to generate one): " value ;;
      MAIL_PROVIDER_KEY) read -r -s -p "MAIL_PROVIDER_KEY (Resend API key): " value ;;
    esac
    echo >&2
    if [ "$name" = JWT_SECRET ] && [ -z "$value" ]; then
      value="$(openssl rand -base64 48)"
    fi
    if [ -z "$value" ]; then
      echo "A value is required." >&2
    elif [ "$name" = DATABASE_URL ] && ! [[ "$value" =~ ^postgres(ql)?:// ]]; then
      echo "It must start with postgresql:// or postgres://." >&2
    else
      break
    fi
  done
  printf '%s' "$value" |
    gcloud secrets create "$name" --project="$GCP_PROJECT_ID" --data-file=- >/dev/null
}

for name in "${SECRETS[@]}"; do
  if exists gcloud secrets describe "$name" --project="$GCP_PROJECT_ID"; then
    echo "Secret $name exists; left unchanged."
  else
    read_secret "$name"
    [ "$DRY_RUN" = true ] || echo "Created secret $name."
  fi
  grant gcloud secrets add-iam-policy-binding "$name" --project="$GCP_PROJECT_ID" \
    --member="serviceAccount:$runtime_sa" --role=roles/secretmanager.secretAccessor
done

# Slot only: no version, so no value is typed or stored here. Add one
# yourself (README § Deployment) once you have the GitHub token.
for name in "${EMPTY_SECRETS[@]+"${EMPTY_SECRETS[@]}"}"; do
  if exists gcloud secrets describe "$name" --project="$GCP_PROJECT_ID"; then
    echo "Secret $name exists; left unchanged."
  else
    run gcloud secrets create "$name" --project="$GCP_PROJECT_ID"
    [ "$DRY_RUN" = true ] || echo "Created secret $name (no value yet; add one yourself, see the README)."
  fi
  grant gcloud secrets add-iam-policy-binding "$name" --project="$GCP_PROJECT_ID" \
    --member="serviceAccount:$runtime_sa" --role=roles/secretmanager.secretAccessor
done

# --- Pipeline identities (ADR 0023) ---------------------------------------
# One pool per project. The provider maps google.subject to GitHub's sub claim
# and accepts tokens from this repository only; who may impersonate which
# service account is then decided per subject:
#   <sub prefix>:ref:refs/heads/master      a job on master with no environment
#   <sub prefix>:environment:<environment>  a job in that GitHub environment
#                                          (whose branch rule picks the branch)
create_pool_and_provider() {
  local project=$1
  if ! exists gcloud iam workload-identity-pools describe "$POOL" \
    --project="$project" --location=global; then
    echo "Creating the Workload Identity pool $POOL in $project..."
    run gcloud iam workload-identity-pools create "$POOL" --project="$project" \
      --location=global --display-name="GitHub Actions"
  fi
  if exists gcloud iam workload-identity-pools providers describe "$PROVIDER" \
    --project="$project" --location=global --workload-identity-pool="$POOL"; then
    echo "Provider $PROVIDER in $project exists; left unchanged."
  else
    echo "Creating the provider $PROVIDER in $project (repository id $GITHUB_REPO_ID only)..."
    run gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
      --project="$project" --location=global --workload-identity-pool="$POOL" \
      --display-name="GitHub $GITHUB_REPO" \
      --issuer-uri="https://token.actions.githubusercontent.com/" \
      --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id" \
      --attribute-condition="assertion.repository_id=='$GITHUB_REPO_ID'"
  fi
}

create_ci_sa() {
  local project=$1 name=$2 description=$3
  if exists gcloud iam service-accounts describe "$name@$project.iam.gserviceaccount.com" \
    --project="$project"; then
    echo "Service account $name@$project exists; left unchanged."
  else
    echo "Creating the service account $name@$project..."
    run gcloud iam service-accounts create "$name" --project="$project" \
      --display-name="$name" --description="$description"
  fi
}

subject_member() {
  local number=$1 subject=$2
  echo "principal://iam.googleapis.com/projects/$number/locations/global/workloadIdentityPools/$POOL/subject/$GITHUB_SUB_PREFIX:$subject"
}

registry_ref="projects/$REGISTRY_PROJECT/locations/$REGION/repositories/$REGISTRY"
repo_grant() {
  grant gcloud artifacts repositories add-iam-policy-binding "$REGISTRY" \
    --project="$REGISTRY_PROJECT" --location="$REGION" --member="$1" --role="$2"
}

create_pool_and_provider "$GCP_PROJECT_ID"

# The registry and its builder live in the registry project (production).
if [ "$GCP_PROJECT_ID" = "$REGISTRY_PROJECT" ]; then
  if exists gcloud artifacts repositories describe "$REGISTRY" \
    --project="$REGISTRY_PROJECT" --location="$REGION"; then
    echo "Repository $registry_ref exists; left unchanged."
  else
    echo "Creating the Docker repository $registry_ref (tags mutable; deploys use digests)..."
    run gcloud artifacts repositories create "$REGISTRY" --project="$REGISTRY_PROJECT" \
      --location="$REGION" --repository-format=docker \
      --description="LiftBig images, built once on master and promoted by digest (ADR 0023)"
  fi
  # Deletes an image only when it is older than 30 days AND outside the newest
  # 30 (keep policies win). Left in dry-run mode: check what it would delete in
  # the console, then rerun the command with --no-dry-run (README).
  policy_file="$(mktemp)"
  printf '%s\n' "[{\"name\":\"delete-old\",\"action\":{\"type\":\"Delete\"},\"condition\":{\"tagState\":\"any\",\"olderThan\":\"30d\"}},{\"name\":\"keep-newest\",\"action\":{\"type\":\"Keep\"},\"mostRecentVersions\":{\"keepCount\":$KEEP_IMAGES}}]" >"$policy_file"
  [ "$DRY_RUN" = false ] || echo "  cleanup policy: $(cat "$policy_file")"
  run gcloud artifacts repositories set-cleanup-policies "$REGISTRY" \
    --project="$REGISTRY_PROJECT" --location="$REGION" --policy="$policy_file" --dry-run
  rm -f "$policy_file"

  create_ci_sa "$REGISTRY_PROJECT" github-builder \
    "Pushes API images from master to $REGISTRY; can't deploy (ADR 0023)"
  builder_sa="github-builder@$REGISTRY_PROJECT.iam.gserviceaccount.com"
  repo_grant "serviceAccount:$builder_sa" roles/artifactregistry.writer
  grant gcloud iam service-accounts add-iam-policy-binding "$builder_sa" \
    --project="$REGISTRY_PROJECT" --role=roles/iam.workloadIdentityUser \
    --member="$(subject_member "$registry_project_number" "ref:refs/heads/master")"
fi

# The deployer: deploys revisions of this project's service, attaches the
# runtime service account, reads images. Only jobs in the GitHub environment of
# the same name can use it.
create_ci_sa "$GCP_PROJECT_ID" github-deployer \
  "Deploys $SERVICE ($ENVIRONMENT) from GitHub Actions (ADR 0023)"
deployer_sa="github-deployer@$GCP_PROJECT_ID.iam.gserviceaccount.com"
for role in roles/run.developer roles/serviceusage.serviceUsageConsumer; do
  grant gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
    --member="serviceAccount:$deployer_sa" --role="$role" --condition=None
done
grant gcloud iam service-accounts add-iam-policy-binding "$runtime_sa" \
  --project="$GCP_PROJECT_ID" --role=roles/iam.serviceAccountUser \
  --member="serviceAccount:$deployer_sa"
grant gcloud iam service-accounts add-iam-policy-binding "$deployer_sa" \
  --project="$GCP_PROJECT_ID" --role=roles/iam.workloadIdentityUser \
  --member="$(subject_member "$project_number" "environment:$ENVIRONMENT")"

# Pulling from the registry project: the deploying identity and this project's
# Cloud Run service agent need Reader; the runtime service account pulls
# nothing (Cloud Run docs, "Deploy images from other Google Cloud projects").
repo_grant "serviceAccount:$deployer_sa" roles/artifactregistry.reader
repo_grant "serviceAccount:service-$project_number@serverless-robot-prod.iam.gserviceaccount.com" \
  roles/artifactregistry.reader

provider_name="projects/$project_number/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"
echo
if [ "$DRY_RUN" = true ]; then
  echo "Dry run: nothing was changed."
else
  echo "Done. $runtime_sa can read ${SECRETS[*]} ${EMPTY_SECRETS[*]+"${EMPTY_SECRETS[*]}"}${bucket:+ and has roles/storage.objectAdmin on gs://$bucket only}."
  echo "gs://$media_bucket is public-read (objects only, no listing)."
fi
echo
echo "GitHub → Settings → Environments → $ENVIRONMENT → variables:"
echo "  GCP_PROJECT_ID=$GCP_PROJECT_ID"
echo "  WIF_PROVIDER=$provider_name"
echo "  DEPLOY_SA=$deployer_sa"
echo "  EXERCISE_MEDIA_BASE_URL=https://storage.googleapis.com/$media_bucket"
if [ "$ENVIRONMENT" = staging ]; then
  echo "  OMIT_SECRETS=MAIL_PROVIDER_KEY,GITHUB_FEEDBACK_TOKEN"
  echo "  SENTRY_ENVIRONMENT=staging"
  echo "  BUG_REPORTS_ENABLED=false"
fi
if [ "$GCP_PROJECT_ID" = "$REGISTRY_PROJECT" ]; then
  echo "Repository variables (Settings → Secrets and variables → Actions → Variables):"
  echo "  BUILD_WIF_PROVIDER=$provider_name"
  echo "  BUILD_SA=github-builder@$REGISTRY_PROJECT.iam.gserviceaccount.com"
  echo "The cleanup policy is in dry-run mode until you rerun it with --no-dry-run (README)."
fi
