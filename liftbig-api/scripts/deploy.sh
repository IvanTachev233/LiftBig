#!/usr/bin/env bash
# Deploys the API to Google Cloud Run from this repo's source (built with the
# Dockerfile). Inputs come from env vars or flags, then from the API's .env (only
# the keys listed in REQUIRED); in a terminal the script asks for a value still
# missing, otherwise it stops and names it, so a pipeline can run it unchanged.
# Secrets are passed by Secret Manager name only and never read here.
# One-time project setup (login, APIs, IAM, secrets): scripts/gcp-setup.sh.

set -euo pipefail

API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Container env var = Secret Manager secret of the same name, latest version.
# GITHUB_FEEDBACK_TOKEN needs a version (scripts/gcp-setup.sh only creates the
# slot) before this script is run, or the revision fails to start.
SECRETS=(DATABASE_URL JWT_SECRET MAIL_PROVIDER_KEY GITHUB_FEEDBACK_TOKEN)
# Must be set; CORS_ORIGINS may be set to an empty string for "none".
REQUIRED=(GCP_PROJECT_ID MAIL_FROM CORS_ORIGINS PRIVACY_OPERATOR_NAME PRIVACY_CONTACT_EMAIL)
# May be unset or empty: the deploy then removes it from the service.
OPTIONAL=(SENTRY_DSN BUG_REPORT_BUCKET BUG_REPORTS_ENABLED GITHUB_FEEDBACK_REPO EXERCISE_MEDIA_BASE_URL)
# Separates env vars on the gcloud command line (`gcloud topic escaping`), so
# values may contain commas, e.g. CORS_ORIGINS.
D=';;'

usage() {
  cat <<'EOF'
Usage: scripts/deploy.sh [options]

Deploys the API to Cloud Run from source.

Options:
  --project ID        Google Cloud project ID (env GCP_PROJECT_ID)
  --region REGION     Cloud Run region (env GCP_REGION, default europe-west1)
  --service NAME      Cloud Run service (env SERVICE, default liftbig-api)
  --service-account EMAIL
                      Service account the service runs as (env RUNTIME_SA,
                      default liftbig-api-runtime@<project>.iam.gserviceaccount.com)
  --env-file PATH     File to read the env vars below from (default: .env in
                      the API folder, when it exists); values already in the
                      environment win, other keys in the file are ignored
  --dry-run           Print the gcloud command and exit without deploying
  --non-interactive   Never prompt; fail when a value is missing (the default
                      when stdin is not a terminal)
  -h, --help          Show this help

Env vars (required; CORS_ORIGINS may be empty):
  MAIL_FROM              Sender of code mails, e.g. "LiftBig <codes@example.com>"
  CORS_ORIGINS           Extra web origins, comma-separated exact URLs
  PRIVACY_OPERATOR_NAME  Who runs the app, shown on /privacy
  PRIVACY_CONTACT_EMAIL  Contact email shown on /privacy

Env vars (optional):
  SENTRY_DSN             Sentry project DSN; unset or empty turns error
                         reports off (the deploy removes it from the service)
  SENTRY_RELEASE         Release named in error reports (default: GITHUB_SHA,
                         else the API folder's git HEAD)
  BUG_REPORT_BUCKET      Cloud Storage bucket for bug-report screenshots
                         (scripts/gcp-setup.sh --bucket); unset or empty
                         removes it, so screenshots aren't stored
  BUG_REPORTS_ENABLED    "false" turns the bug-report endpoint off (503);
                         unset or empty removes it, which means on
  GITHUB_FEEDBACK_REPO   "owner/repo" bug reports file issues in, e.g.
                         IvanTachev233/LiftBig-Feedback; unset or empty
                         removes it
  EXERCISE_MEDIA_BASE_URL
                         https URL of the public demo media bucket, e.g.
                         https://storage.googleapis.com/<project>-media
                         (ADR 0026); unset or empty removes it, so exercise
                         demos aren't shown

Secrets (Secret Manager, latest version): DATABASE_URL, JWT_SECRET,
MAIL_PROVIDER_KEY, GITHUB_FEEDBACK_TOKEN. The runtime service account reads
them; GITHUB_FEEDBACK_TOKEN needs a version added (scripts/gcp-setup.sh only
creates the slot) before this script is run.
EOF
}

die() {
  echo "Error: $*" >&2
  exit 1
}

describe() {
  case "$1" in
    GCP_PROJECT_ID) echo "Google Cloud project ID (the string ID, not the project number)" ;;
    MAIL_FROM) echo "Sender of code mails, e.g. LiftBig <codes@example.com>" ;;
    CORS_ORIGINS) echo "Extra web origins, comma-separated exact URLs (empty for none)" ;;
    PRIVACY_OPERATOR_NAME) echo "Operator name shown on /privacy" ;;
    PRIVACY_CONTACT_EMAIL) echo "Contact email shown on /privacy" ;;
  esac
}

is_set() {
  [ -n "${!1+x}" ]
}

is_required() {
  local name
  for name in "${REQUIRED[@]}"; do
    [ "$name" = "$1" ] && return 0
  done
  return 1
}

is_optional() {
  local name
  for name in "${OPTIONAL[@]}"; do
    [ "$name" = "$1" ] && return 0
  done
  return 1
}

# Reads the REQUIRED and OPTIONAL keys from a dotenv file (KEY=value, optional `export`,
# quotes and trailing comments) without running it, so the file's other values,
# such as secrets, are never loaded. Keys already in the environment are kept.
load_env_file() {
  local file=$1 name line key value
  local from_env=" " loaded=()
  for name in "${REQUIRED[@]}" "${OPTIONAL[@]}"; do
    is_set "$name" && from_env+="$name "
  done
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'}
    [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*(.*)$ ]] || continue
    key=${BASH_REMATCH[2]}
    value=${BASH_REMATCH[3]}
    is_required "$key" || is_optional "$key" || continue
    [[ "$from_env" == *" $key "* ]] && continue
    if [[ "$value" =~ ^\"(.*)\"[[:space:]]*(#.*)?$ ]] || [[ "$value" =~ ^\'(.*)\'[[:space:]]*(#.*)?$ ]]; then
      value=${BASH_REMATCH[1]}
    else
      value=$(printf '%s' "$value" | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//')
    fi
    printf -v "$key" '%s' "$value"
    loaded+=("$key")
  done <"$file"
  if [ ${#loaded[@]} -gt 0 ]; then
    echo "Read $(printf '%s\n' "${loaded[@]}" | sort -u | tr '\n' ' ')from $file." >&2
  fi
}

DRY_RUN=false
ENV_FILE=""
INTERACTIVE=true
[ -t 0 ] || INTERACTIVE=false

while [ $# -gt 0 ]; do
  case "$1" in
    --project | --region | --service | --service-account | --env-file)
      [ $# -ge 2 ] || die "$1 needs a value"
      case "$1" in
        --project) GCP_PROJECT_ID=$2 ;;
        --region) GCP_REGION=$2 ;;
        --service) SERVICE=$2 ;;
        --service-account) RUNTIME_SA=$2 ;;
        --env-file) ENV_FILE=$2 ;;
      esac
      shift
      ;;
    --project=*) GCP_PROJECT_ID=${1#*=} ;;
    --region=*) GCP_REGION=${1#*=} ;;
    --service=*) SERVICE=${1#*=} ;;
    --service-account=*) RUNTIME_SA=${1#*=} ;;
    --env-file=*) ENV_FILE=${1#*=} ;;
    --dry-run) DRY_RUN=true ;;
    --non-interactive) INTERACTIVE=false ;;
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

if [ -n "$ENV_FILE" ]; then
  [ -f "$ENV_FILE" ] || die "env file not found: $ENV_FILE"
  load_env_file "$ENV_FILE"
elif [ -f "$API_DIR/.env" ]; then
  load_env_file "$API_DIR/.env"
fi

GCP_REGION=${GCP_REGION:-europe-west1}
SERVICE=${SERVICE:-liftbig-api}

missing=()
for name in "${REQUIRED[@]}"; do
  # An empty CORS_ORIGINS means "none"; any other empty value counts as missing.
  if is_set "$name" && { [ -n "${!name}" ] || [ "$name" = CORS_ORIGINS ]; }; then
    continue
  fi
  if [ "$INTERACTIVE" = true ]; then
    while true; do
      read -r -p "$(describe "$name"): " value
      if [ -n "$value" ] || [ "$name" = CORS_ORIGINS ]; then
        break
      fi
      echo "A value is required." >&2
    done
    printf -v "$name" '%s' "$value"
  else
    missing+=("$name")
  fi
done

if [ ${#missing[@]} -gt 0 ]; then
  echo "Error: missing required values (set them in the environment or the env file):" >&2
  for name in "${missing[@]}"; do
    echo "  $name: $(describe "$name")" >&2
  done
  exit 1
fi

[[ "$GCP_PROJECT_ID" =~ ^[0-9]+$ ]] &&
  die "GCP_PROJECT_ID is the project number; use the string project ID"
# The service's own identity: it reads the secrets and holds no project roles.
# An empty value (an unset pipeline variable) means the default.
RUNTIME_SA=${RUNTIME_SA:-liftbig-api-runtime@$GCP_PROJECT_ID.iam.gserviceaccount.com}
[[ "$RUNTIME_SA" =~ ^[^@[:space:]]+@[^@[:space:]]+\.gserviceaccount\.com$ ]] ||
  die "RUNTIME_SA must be a service account email (...@....gserviceaccount.com): $RUNTIME_SA"
for name in "${REQUIRED[@]}"; do
  case "${!name}" in
    *"$D"* | *$'\n'*) die "$name must not contain '$D' or a line break" ;;
  esac
done
SENTRY_DSN=${SENTRY_DSN:-}
[ -z "$SENTRY_DSN" ] || [[ "$SENTRY_DSN" =~ ^https://[A-Za-z0-9]+@[A-Za-z0-9.-]+/[0-9]+$ ]] ||
  die "SENTRY_DSN must be a Sentry DSN (https://<key>@<host>/<project id>) or empty"
# Bug reports (LB-38): unset bucket means screenshots aren't stored, unset
# BUG_REPORTS_ENABLED means the endpoint is on, unset repo means no issue is filed.
BUG_REPORT_BUCKET=${BUG_REPORT_BUCKET:-}
BUG_REPORTS_ENABLED=${BUG_REPORTS_ENABLED:-}
GITHUB_FEEDBACK_REPO=${GITHUB_FEEDBACK_REPO:-}
[ -z "$BUG_REPORTS_ENABLED" ] || [ "$BUG_REPORTS_ENABLED" = false ] ||
  die "BUG_REPORTS_ENABLED must be false or empty (unset means on): $BUG_REPORTS_ENABLED"
[ -z "$GITHUB_FEEDBACK_REPO" ] || [[ "$GITHUB_FEEDBACK_REPO" =~ ^[^/[:space:]]+/[^/[:space:]]+$ ]] ||
  die "GITHUB_FEEDBACK_REPO must be owner/repo or empty: $GITHUB_FEEDBACK_REPO"
# Exercise demo media (ADR 0026): unset means demos aren't shown. No ';' (the
# gcloud separator) and no spaces.
EXERCISE_MEDIA_BASE_URL=${EXERCISE_MEDIA_BASE_URL:-}
media_url_re='^https://[^/;[:space:]]+(/[^;[:space:]]*)?$'
[ -z "$EXERCISE_MEDIA_BASE_URL" ] || [[ "$EXERCISE_MEDIA_BASE_URL" =~ $media_url_re ]] ||
  die "EXERCISE_MEDIA_BASE_URL must be an https URL or empty: $EXERCISE_MEDIA_BASE_URL"
# Error reports name the deployed commit.
SENTRY_RELEASE=${SENTRY_RELEASE:-${GITHUB_SHA:-$(git -C "$API_DIR" rev-parse HEAD 2>/dev/null || true)}}
[[ "$SENTRY_RELEASE" =~ ^[A-Za-z0-9._-]*$ ]] ||
  die "SENTRY_RELEASE may contain only letters, digits, '.', '_' and '-'"

env_vars="^${D}^MAIL_FROM=$MAIL_FROM${D}CORS_ORIGINS=$CORS_ORIGINS"
env_vars+="${D}PRIVACY_OPERATOR_NAME=$PRIVACY_OPERATOR_NAME${D}PRIVACY_CONTACT_EMAIL=$PRIVACY_CONTACT_EMAIL"
# Schema changes only through migrations; personal bests are already backfilled.
env_vars+="${D}NODE_ENV=production${D}TYPEORM_SYNC=false${D}RUN_MIGRATIONS=true${D}BACKFILL_PBS=false"
[ -z "$SENTRY_RELEASE" ] || env_vars+="${D}SENTRY_RELEASE=$SENTRY_RELEASE"

secret_refs=""
for name in "${SECRETS[@]}"; do
  secret_refs+="${secret_refs:+,}$name=$name:latest"
done
secret_names="$(IFS=,; echo "${SECRETS[*]}")"
removed_vars=$secret_names
# Without a DSN the API sends no error reports; removing it turns off a
# service that had one.
if [ -n "$SENTRY_DSN" ]; then
  env_vars+="${D}SENTRY_DSN=$SENTRY_DSN"
else
  removed_vars+=",SENTRY_DSN"
fi
# Without a bucket, screenshots aren't stored; without the flag, reports are on;
# without the repo, bug reports can't be filed as issues.
if [ -n "$BUG_REPORT_BUCKET" ]; then
  env_vars+="${D}BUG_REPORT_BUCKET=$BUG_REPORT_BUCKET"
else
  removed_vars+=",BUG_REPORT_BUCKET"
fi
if [ -n "$BUG_REPORTS_ENABLED" ]; then
  env_vars+="${D}BUG_REPORTS_ENABLED=$BUG_REPORTS_ENABLED"
else
  removed_vars+=",BUG_REPORTS_ENABLED"
fi
if [ -n "$GITHUB_FEEDBACK_REPO" ]; then
  env_vars+="${D}GITHUB_FEEDBACK_REPO=$GITHUB_FEEDBACK_REPO"
else
  removed_vars+=",GITHUB_FEEDBACK_REPO"
fi
# Without a base URL, demo media keys give no media.
if [ -n "$EXERCISE_MEDIA_BASE_URL" ]; then
  env_vars+="${D}EXERCISE_MEDIA_BASE_URL=$EXERCISE_MEDIA_BASE_URL"
else
  removed_vars+=",EXERCISE_MEDIA_BASE_URL"
fi
# A new revision gets traffic only once /health answers 2xx (the database is
# reachable). Migrations run before the port opens and Neon may be waking up,
# so it keeps the 240 s that the default TCP probe allows: 24 tries, 10 s apart.
startup_probe="httpGet.path=/health,initialDelaySeconds=0,timeoutSeconds=5,periodSeconds=10,failureThreshold=24"

# --remove-env-vars runs before the secrets are set, so a service that still has
# one of these as a plain value switches to the secret in the same deploy.
cmd=(
  gcloud run deploy "$SERVICE"
  --project="$GCP_PROJECT_ID"
  --region="$GCP_REGION"
  --source="$API_DIR"
  --allow-unauthenticated
  --service-account="$RUNTIME_SA"
  --remove-env-vars="$removed_vars"
  --update-env-vars="$env_vars"
  --set-secrets="$secret_refs"
  --startup-probe="$startup_probe"
)
[ "$INTERACTIVE" = true ] || cmd+=(--quiet)

print_cmd() {
  printf '%q %q %q %q' "${cmd[@]:0:4}"
  printf ' \\\n  %q' "${cmd[@]:4}"
  printf '\n'
}

if [ "$DRY_RUN" = true ]; then
  print_cmd
  exit 0
fi

command -v gcloud >/dev/null 2>&1 ||
  die "gcloud CLI not found; install it: https://cloud.google.com/sdk/docs/install"
account="$(gcloud config get-value account 2>/dev/null || true)"
if [ "$account" = "(unset)" ]; then
  account=""
fi
# A pipeline may authenticate through a credentials file with no account set.
if [ -z "$account" ] && [ "$INTERACTIVE" = true ]; then
  die "no active gcloud account; run 'gcloud auth login' (or scripts/gcp-setup.sh)"
fi

echo "Deploying $SERVICE to $GCP_PROJECT_ID ($GCP_REGION)${account:+ as $account}; it runs as $RUNTIME_SA."
echo "Schema sync is off: entity changes reach production only through migrations."
if [ "$INTERACTIVE" = true ]; then
  print_cmd
  read -r -p "Deploy now? [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]] || die "cancelled"
fi

"${cmd[@]}"

echo "Deployed. If the service URL changed, update liftbig-app/src/environments/environment.prod.ts."
