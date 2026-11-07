#!/usr/bin/env bash
# One-time Google Cloud setup for scripts/deploy.sh: login, APIs, the IAM roles
# Cloud Build needs for source deploys, the service's runtime service account,
# the bug-report screenshot bucket, the public exercise demo media bucket, and
# the Secret Manager secrets it reads
# (created here if missing, values typed hidden and never printed;
# GITHUB_FEEDBACK_TOKEN is created with no value — add it yourself, see the
# README). Safe to run again; existing secrets and buckets are left as they
# are.

set -euo pipefail

SECRETS=(DATABASE_URL JWT_SECRET MAIL_PROVIDER_KEY)
# Created empty: Ivan adds the version himself (see the README), this script
# never reads or types the value.
EMPTY_SECRETS=(GITHUB_FEEDBACK_TOKEN)
# Screenshots bucket region (ADR 0021 / spec § Stored data): London.
BUCKET_LOCATION=europe-west2
# Screenshots are deleted automatically this many days after upload.
BUCKET_LIFECYCLE_DAYS=90

usage() {
  cat <<'EOF'
Usage: scripts/gcp-setup.sh [options]

One-time setup of a Google Cloud project for scripts/deploy.sh. Run it in a
terminal: it asks for the secret values.

Options:
  --project ID      Google Cloud project ID (env GCP_PROJECT_ID; asked if unset)
  --service NAME    Cloud Run service (env SERVICE, default liftbig-api)
  --service-account EMAIL
                    Service account the service runs as (env RUNTIME_SA,
                    default liftbig-api-runtime@<project>.iam.gserviceaccount.com;
                    created when it is that default and missing)
  --bucket NAME     Bug-report screenshot bucket (env BUG_REPORT_BUCKET,
                    default <project>-bug-reports; created when missing)
  --media-bucket NAME
                    Public exercise demo media bucket (env
                    EXERCISE_MEDIA_BUCKET, default <project>-media; created
                    when missing; ADR 0026)
  -h, --help        Show this help
EOF
}

die() {
  echo "Error: $*" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --project | --service | --service-account | --bucket | --media-bucket)
      [ $# -ge 2 ] || die "$1 needs a value"
      case "$1" in
        --project) GCP_PROJECT_ID=$2 ;;
        --service) SERVICE=$2 ;;
        --service-account) RUNTIME_SA=$2 ;;
        --bucket) BUG_REPORT_BUCKET=$2 ;;
        --media-bucket) EXERCISE_MEDIA_BUCKET=$2 ;;
      esac
      shift
      ;;
    --project=*) GCP_PROJECT_ID=${1#*=} ;;
    --service=*) SERVICE=${1#*=} ;;
    --service-account=*) RUNTIME_SA=${1#*=} ;;
    --bucket=*) BUG_REPORT_BUCKET=${1#*=} ;;
    --media-bucket=*) EXERCISE_MEDIA_BUCKET=${1#*=} ;;
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

[ -t 0 ] || die "run this in a terminal; it asks for secret values"
command -v gcloud >/dev/null 2>&1 ||
  die "gcloud CLI not found; install it: https://cloud.google.com/sdk/docs/install"

account="$(gcloud config get-value account 2>/dev/null || true)"
if [ -z "$account" ] || [ "$account" = "(unset)" ]; then
  echo "No active Google Cloud account; logging in."
  gcloud auth login
fi

if [ -z "${GCP_PROJECT_ID:-}" ]; then
  gcloud projects list
  read -r -p "Project ID (the string ID, not the project number): " GCP_PROJECT_ID
fi
[ -n "$GCP_PROJECT_ID" ] || die "a project ID is required"
[[ "$GCP_PROJECT_ID" =~ ^[0-9]+$ ]] &&
  die "that is the project number; use the string project ID"

project_number="$(gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectNumber)')"
compute_sa="${project_number}-compute@developer.gserviceaccount.com"

echo "Enabling the Cloud Run, Cloud Build, Artifact Registry, Secret Manager and IAM APIs..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com iam.googleapis.com \
  --project="$GCP_PROJECT_ID"

# Source deploys build as the Compute Engine default service account.
echo "Granting Cloud Build's service account ($compute_sa) the build roles..."
for role in roles/run.builder roles/storage.objectViewer; do
  gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
    --member="serviceAccount:$compute_sa" --role="$role" \
    --condition=None --quiet >/dev/null
done

# The service reads its secrets as its runtime service account, the same one
# scripts/deploy.sh deploys with. It gets no project roles, only the secrets.
default_runtime_sa="liftbig-api-runtime@$GCP_PROJECT_ID.iam.gserviceaccount.com"
runtime_sa=${RUNTIME_SA:-$default_runtime_sa}
if ! gcloud iam service-accounts describe "$runtime_sa" --project="$GCP_PROJECT_ID" \
  >/dev/null 2>&1; then
  [ "$runtime_sa" = "$default_runtime_sa" ] ||
    die "service account $runtime_sa not found; create it or leave RUNTIME_SA unset"
  echo "Creating the runtime service account $runtime_sa..."
  gcloud iam service-accounts create liftbig-api-runtime --project="$GCP_PROJECT_ID" \
    --display-name="liftbig-api runtime" \
    --description="Runtime identity for the $SERVICE Cloud Run service" >/dev/null
fi

# Bug-report screenshots (spec § Stored data / ADR 0021): a private bucket in
# London, with public access prevention and a 90-day lifecycle delete. The
# runtime service account gets object admin on this bucket only, not the project.
default_bucket="${GCP_PROJECT_ID}-bug-reports"
bucket=${BUG_REPORT_BUCKET:-$default_bucket}
if gcloud storage buckets describe "gs://$bucket" --project="$GCP_PROJECT_ID" \
  >/dev/null 2>&1; then
  echo "Bucket gs://$bucket exists; left unchanged."
else
  echo "Creating the bug-report screenshot bucket gs://$bucket ($BUCKET_LOCATION)..."
  lifecycle_file="$(mktemp)"
  trap 'rm -f "$lifecycle_file"' EXIT
  cat >"$lifecycle_file" <<EOF
{"rule":[{"action":{"type":"Delete"},"condition":{"age":$BUCKET_LIFECYCLE_DAYS}}]}
EOF
  gcloud storage buckets create "gs://$bucket" --project="$GCP_PROJECT_ID" \
    --location="$BUCKET_LOCATION" --uniform-bucket-level-access \
    --public-access-prevention --lifecycle-file="$lifecycle_file" >/dev/null
  rm -f "$lifecycle_file"
  trap - EXIT
fi
# IAM is eventually consistent: a service account created a moment ago may not
# be found yet, so retry with backoff (about 2.5 minutes in all), as below for
# secret access.
grant_bucket_access() {
  local delay
  for delay in 5 10 20 40 80; do
    gcloud storage buckets add-iam-policy-binding "gs://$bucket" \
      --member="serviceAccount:$runtime_sa" \
      --role=roles/storage.objectAdmin >/dev/null 2>&1 && return 0
    echo "Granting $runtime_sa access to gs://$bucket failed; retrying in ${delay}s..." >&2
    sleep "$delay"
  done
  gcloud storage buckets add-iam-policy-binding "gs://$bucket" \
    --member="serviceAccount:$runtime_sa" --role=roles/storage.objectAdmin >/dev/null
}
grant_bucket_access

# Exercise demo media (ADR 0026): a public-read bucket in London for demo
# videos and images only, never private uploads. allUsers gets
# roles/storage.legacyObjectReader (storage.objects.get only), so files can be
# read by URL but the bucket can't be listed. Only the project owner uploads;
# the API never touches it.
default_media_bucket="${GCP_PROJECT_ID}-media"
media_bucket=${EXERCISE_MEDIA_BUCKET:-$default_media_bucket}
if gcloud storage buckets describe "gs://$media_bucket" --project="$GCP_PROJECT_ID" \
  >/dev/null 2>&1; then
  echo "Bucket gs://$media_bucket exists; left unchanged."
else
  echo "Creating the public demo media bucket gs://$media_bucket ($BUCKET_LOCATION)..."
  gcloud storage buckets create "gs://$media_bucket" --project="$GCP_PROJECT_ID" \
    --location="$BUCKET_LOCATION" --uniform-bucket-level-access \
    --no-public-access-prevention >/dev/null
fi
gcloud storage buckets add-iam-policy-binding "gs://$media_bucket" \
  --member=allUsers --role=roles/storage.legacyObjectReader >/dev/null ||
  die "public read on gs://$media_bucket failed; public access prevention may be enforced on the bucket or by an organization policy"

read_secret() {
  local name=$1 value
  while true; do
    case "$name" in
      DATABASE_URL) read -r -s -p "DATABASE_URL (postgresql://...): " value ;;
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

# IAM is eventually consistent: a service account created a moment ago may not
# be found yet, so retry with backoff (about 2.5 minutes in all).
grant_secret_access() {
  local name=$1 delay
  for delay in 5 10 20 40 80; do
    gcloud secrets add-iam-policy-binding "$name" --project="$GCP_PROJECT_ID" \
      --member="serviceAccount:$runtime_sa" \
      --role=roles/secretmanager.secretAccessor >/dev/null 2>&1 && return 0
    echo "Granting $runtime_sa access to $name failed; retrying in ${delay}s..." >&2
    sleep "$delay"
  done
  gcloud secrets add-iam-policy-binding "$name" --project="$GCP_PROJECT_ID" \
    --member="serviceAccount:$runtime_sa" \
    --role=roles/secretmanager.secretAccessor >/dev/null
}

for name in "${SECRETS[@]}"; do
  if gcloud secrets describe "$name" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
    echo "Secret $name exists; left unchanged."
  else
    read_secret "$name"
    echo "Created secret $name."
  fi
  grant_secret_access "$name"
done

# Slot only: no version, so no value is typed or stored here. Add one
# yourself (README § Deployment) once you have the GitHub token.
for name in "${EMPTY_SECRETS[@]}"; do
  if gcloud secrets describe "$name" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
    echo "Secret $name exists; left unchanged."
  else
    gcloud secrets create "$name" --project="$GCP_PROJECT_ID" >/dev/null
    echo "Created secret $name (no value yet; add one yourself, see the README)."
  fi
  grant_secret_access "$name"
done

echo
echo "Done. $runtime_sa can read ${SECRETS[*]} ${EMPTY_SECRETS[*]} and has"
echo "roles/storage.objectAdmin on gs://$bucket only."
echo "gs://$media_bucket is public-read (objects only, no listing). Set the"
echo "Actions variable EXERCISE_MEDIA_BASE_URL=https://storage.googleapis.com/$media_bucket"
echo "Deploy with: GCP_PROJECT_ID=$GCP_PROJECT_ID scripts/deploy.sh"
