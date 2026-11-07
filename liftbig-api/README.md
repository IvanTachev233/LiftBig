# LiftBig API

The backend for LiftBig, a strength-training app for coaches and clients. It handles auth (JWT), coach–client invites and workouts, both the ones clients log for themselves and the ones their coach assigns.

Stack: NestJS 11, TypeORM 0.3, PostgreSQL 15. The mobile/web client is next to it in [`liftbig-app/`](../liftbig-app); both are in the [LiftBig](https://github.com/IvanTachev233/LiftBig) repo.

> **Running the whole app?** Start with the [app README](../liftbig-app/README.md). It covers cloning the repo, the Docker stack and the day-to-day dev loop. This README covers the API on its own.

## Prerequisites

- **Node.js 24**, pinned in [`.nvmrc`](.nvmrc) (`nvm use`). The Dockerfile and CI use the same major, and so does the app.
- **PostgreSQL**, most easily through the repo's Docker stack: `docker compose up -d postgres` from the repo root or `liftbig-app/`. It listens on host port **5433**.

## Run locally

```bash
npm install
cp .env.example .env # once, then fill in JWT_SECRET and DB_* (see below)
npm run start:dev    # watch mode on http://localhost:3000
```

The API won't start without `JWT_SECRET` (generate one with `openssl rand -base64 48`) and `DB_USERNAME`, `DB_PASSWORD` and `DB_NAME`; set those to the `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` values in `liftbig-app/.env`, which created the compose database. The host and port default to that database on `localhost:5433`. On startup the API runs pending migrations, so an empty database gets the whole schema; `synchronize` is off ([Changing the schema](#changing-the-schema)).

A local database from before the Baseline migration may stop the API on startup; [Changing the schema](#changing-the-schema) says what to do.

Other scripts: `npm run start` (no watch), `npm run start:debug`, `npm run build` then `npm run start:prod` (runs `dist/main`).

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | unset | Full PostgreSQL connection URL (e.g. Neon). When set, the `DB_*` variables below are ignored |
| `DB_HOST` | `localhost` | PostgreSQL host (`postgres` inside Docker Compose) |
| `DB_PORT` | `5433` | PostgreSQL port (`5432` inside Docker Compose) |
| `DB_USERNAME` | none (required without `DATABASE_URL`) | Database user. Missing: the API stops at startup |
| `DB_PASSWORD` | none (required without `DATABASE_URL`) | Database password. Missing: the API stops at startup |
| `DB_NAME` | none (required without `DATABASE_URL`) | Database name. Missing: the API stops at startup |
| `PORT` | `3000` | HTTP port |
| `JWT_SECRET` | none (required) | Signs access tokens and email codes. The API won't start without it, and with `NODE_ENV=production` it also refuses the old built-in default. Locally, generate one with `openssl rand -base64 48` and put it in `.env` |
| `JWT_ACCESS_TTL` | `15m` | Access token lifetime: a duration (`20s`, `15m`, `1h`) or a number of seconds. The app gets a new one with its refresh token (`POST /auth/refresh`) |
| `REFRESH_IDLE_DAYS` | `30` | A signed-in device's session ends after this many days without a refresh |
| `REFRESH_ABSOLUTE_DAYS` | `90` | A session ends this many days after sign-in, however often it is used |
| `NODE_ENV` | unset | `production` makes the DB connection use TLS and verify the server certificate against Node's trusted CAs. TLS parameters in `DATABASE_URL` (`sslmode`, `ssl`, `sslrootcert`, `sslcert`, `sslkey`, `uselibpqcompat`) are then ignored, so the secret can't turn the check off. Unset, TLS follows `DATABASE_URL` and is off for the local database |
| `TYPEORM_SYNC` | unset | `true` turns TypeORM `synchronize` on, which changes the schema to match the entities without a migration. Only for a throwaway local database; deploys set `false` |
| `RUN_MIGRATIONS` | unset | Pending migrations run on startup; `false` skips them |
| `BACKFILL_PBS` | unset | On every start the API records personal bests for logged sets that have none yet (a one-off for sets saved before bests were recorded automatically). `false` skips this |
| `SEED_PROGRAMS` | unset | On every start the API adds any missing sports, their required lifts, the global exercises in `src/programs/seed/exercises.json` (§ Adding exercises) and one published sample program per sport. `false` skips this |
| `CORS_ORIGINS` | unset | Extra allowed CORS origins, comma-separated exact URLs (e.g. `https://liftbig.web.app`). Needed when a deployed web client calls the API from another origin |
| `MAIL_PROVIDER_KEY` | unset | Resend API key for sign-up and password reset codes (set as a Cloud Run secret). Unset: mails, codes included, are written to the log instead of sent |
| `MAIL_FROM` | unset | Sender for those mails, e.g. `LiftBig <codes@your-domain>` on a domain verified in Resend. Required when `MAIL_PROVIDER_KEY` is set; the API refuses to start without it |
| `PRIVACY_OPERATOR_NAME` | unset | Who runs the app, shown on the `/privacy` and `/terms` pages. Unset: the pages show `[OPERATOR NAME]` |
| `PRIVACY_CONTACT_EMAIL` | unset | Contact email on the `/privacy` and `/terms` pages. Unset: the pages show `[CONTACT EMAIL]` |
| `APP_MIN_VERSION_CODE` | unset | Lowest Android versionCode still supported, from `GET /app-config`: older builds show a blocking "Update LiftBig" screen. Unset: no minimum. Anything but a whole number from 1 stops the API at startup |
| `APP_LATEST_VERSION_CODE` | unset | The newest versionCode on Play: older builds are offered the update once per start (dismissible). Unset: no offer |
| `SENTRY_DSN` | unset | Sentry project DSN: unexpected errors (not 4xx) are reported to Sentry, scrubbed (see [Error reports](#error-reports-sentry)). Unset or blank: nothing is reported, as in local runs, CI and tests |
| `SENTRY_RELEASE` | unset | Release named in error reports; `deploy.sh` sets the git commit |
| `BUG_REPORTS_ENABLED` | unset (on) | `false` turns `POST /bug-reports` off: it answers 503 and stores nothing. Unset means on |
| `BUG_REPORT_BUCKET` | unset | Cloud Storage bucket bug-report screenshots upload to (`scripts/gcp-setup.sh` creates it, `europe-west2`). Unset: screenshots aren't stored (local runs, CI, tests), and the GitHub issue says so |
| `EXERCISE_MEDIA_BASE_URL` | unset | `https` URL of the public demo media bucket, e.g. `https://storage.googleapis.com/liftbigapi-media` (ADR 0026). The API sends a global exercise's `videoKey` / `imageKey` as `<this URL>/<key>` in `videoUrl` / `imageUrl`. Unset (or not `https`): keys give no media, and each start logs one warning if the exercise file has keys |
| `GITHUB_FEEDBACK_TOKEN` | unset (Secret Manager) | Fine-grained GitHub token, Issues read/write on one repository only. Unset: the issue's GitHub status is `disabled` and no GitHub call is made |
| `GITHUB_FEEDBACK_REPO` | unset | `owner/repo` bug reports file an issue in, e.g. `IvanTachev233/LiftBig-Feedback` |

Locally, every variable above can live in a `.env` file in this folder: `src/config/database.config.ts` loads it when it exists (it runs before `@nestjs/config`), and variables already set in the shell, Docker or Cloud Run win over it. That covers `npm run start:dev`, the tests and the migration commands. `.env` is gitignored; [`.env.example`](.env.example) is the committed reference. Never put `DATABASE_URL` or other production values in it.

## Tests and checks

```bash
npm run build
npm test            # unit tests (Jest)
npm run test:e2e    # full AppModule on the liftbig_e2e database (needs the postgres container)
npm run test:cov
npm run lint        # ESLint with --fix: it rewrites files
npm run format      # Prettier
```

### Adding exercises

The global exercises, which everyone sees, are listed in [`src/programs/seed/exercises.json`](src/programs/seed/exercises.json), one per line:

```json
{"name": "Romanian Deadlift", "bodyPart": "LEGS", "category": "Pull", "equipment": "Barbell"}
```

- `bodyPart`: `CHEST`, `BACK`, `LEGS`, `SHOULDERS`, `ARMS`, `CORE`, `FULL_BODY` or `OTHER`.
- `category`: `Olympic`, `Squat`, `Press`, `Pull`, or `null` to list it under "Other" in the picker.
- `equipment`: free text shown in the picker row (`Barbell`, `Dumbbell`, `Kettlebell`, `Machine`, `Cable`, `Bodyweight`), or `null`.
- `videoKey` (optional): the demo video's object key in the media bucket, e.g. `exercises/snatch-v1.mp4` (`.mp4` or `.webm`). The exercise detail screen plays it.
- `imageKey` (optional): the picker thumbnail's key, e.g. `exercises/snatch-v1.webp` (`.jpg`, `.png` or `.webp`).

Keys are lower-case paths in the bucket (letters, digits, `-`, `_`, `.`, `/`), never URLs: the API adds `EXERCISE_MEDIA_BASE_URL`, so staging and production can use different buckets.

VS Code checks the file against `exercises.schema.json` as you type. `npm test` checks it too: a typo, an unknown field or a duplicate name (ignoring letter case) fails with the entry's index and name. On its next start every environment adds the new rows. An exercise that already exists as a global under the same name in any letter case is kept as it is, apart from filling in a missing category or equipment. Its video and image keys always follow the file: a changed key replaces the stored one and a removed key clears it (only the seeder writes them). Removing a line or changing a body part does not change rows that already exist; that needs a migration.

#### Adding a demo video or image

The files live in the public demo media bucket (`scripts/gcp-setup.sh` creates `<project-id>-media`; ADR 0026). Anyone with a file's URL can download it, so put only demos there.

1. Encode the video as H.264 MP4, at most 720p, no audio, about 10 MB (20 MB at most, 60 s at most), with `faststart` so playback starts before the whole file arrives:

   ```bash
   ffmpeg -i snatch.mov -an -c:v libx264 -profile:v high -pix_fmt yuv420p \
     -vf "scale='min(1280,iw)':-2" -r 30 -crf 24 -movflags +faststart snatch-v1.mp4
   ```

   Thumbnails: WebP or JPEG, 320 px wide, about 50 KB.
2. Upload it under a new versioned key (never reuse one: phones cache each file for a year):

   ```bash
   gcloud storage cp snatch-v1.mp4 gs://liftbigapi-media/exercises/snatch-v1.mp4 \
     --content-type=video/mp4 --cache-control="public, max-age=31536000, immutable"
   gcloud storage cp snatch-v1.webp gs://liftbigapi-media/exercises/snatch-v1.webp \
     --content-type=image/webp --cache-control="public, max-age=31536000, immutable"
   ```

   Upload to the staging bucket too once it exists.
3. Add the keys to the exercise's line, e.g. `"videoKey": "exercises/snatch-v1.mp4", "imageKey": "exercises/snatch-v1.webp"`, and deploy.

To replace a demo, upload `snatch-v2.mp4`, change the key, deploy, then delete `v1`. Locally, set `EXERCISE_MEDIA_BASE_URL` in `.env` to see the bucket's files.

`npm run test:e2e` needs the postgres container (`docker compose up -d postgres` from the repo root). It creates a `liftbig_e2e` database on that server if it is missing and, for each test app, drops its schema and runs the migrations on it (never `synchronize`, as in production), so `liftbig_db` is never touched. Two runs at once on the same server break each other, since both drop `liftbig_e2e`; point one at another Postgres with `DB_HOST`/`DB_PORT` (and its `DB_USERNAME`/`DB_PASSWORD`) in the shell. It refuses to run while `DATABASE_URL` is set, and like the API it needs `JWT_SECRET` and the `DB_*` values from `.env` (CI sets its own throwaway ones). Unit tests need none of them.

## Changing the schema

**Every entity change ships a migration**, in the same PR. The schema changes only through the migrations in `src/migrations`, in every environment: the API runs pending ones on startup, `synchronize` is off, and CI's `migration:check` fails a PR whose entities and migrations disagree.

```bash
npm run migration:generate -- src/migrations/AddWorkoutRating # SQL for the entity changes, from your local database
npm run migration:create -- src/migrations/BackfillRatings    # an empty migration, for data changes
npm run migration:run                                         # pending migrations on the database in .env
npm run migration:check                                       # exits 1 when an entity change has no migration
npm run migration:revert                                      # down() of the newest migration
```

The commands use [`src/config/data-source.ts`](src/config/data-source.ts): the API's connection settings from `.env`, never syncing and never running migrations on connect. The steps:

1. Change the entity.
2. With your local database up to date, run `migration:generate` and read the SQL. Keep TypeORM's generated constraint and index names; a name you pick yourself must also be set on the entity, or production drifts from it (ADR 0022).
3. Restart the API (or `npm run migration:run`); `npm run migration:check` then prints "No changes in database schema were found".
4. Commit the entity and the migration together.

[`1794009600000-Baseline.ts`](src/migrations/1794009600000-Baseline.ts) holds the whole schema as of LB-38 and replaced the migrations before it (ADR 0022). It creates the schema only on an empty database and can't be reverted: going back past it means [restoring the database](#restoring-the-database-neon). Never edit a migration that has run in production; add a new one. A migration must not branch on whether a table exists.

A local database from before the Baseline:

- **Ran the old migrations** (its `migrations` table lists `BugReports1709800000012`): the next start records the Baseline and changes nothing. If `migration:check` then lists only `bug_report`'s index and foreign key, sync renamed them earlier: start once with `TYPEORM_SYNC=true npm run start:dev` and check again.
- **Built by `synchronize`** (no migration rows): the API stops with "Baseline: … tables exist but BugReports1709800000012 is not recorded". If `npm run migration:check` exits 0, `npm run migration:run -- --fake` records the Baseline without running it. Otherwise drop the local database and start the API on an empty one.

## Deployment

> Deploying changes production data. Talk to the maintainer before deploying.

Production runs on **Google Cloud Run** at `https://api.liftbig.co` (a Cloud Run domain mapping, ADR 0016), which app builds from versionCode 4 call. Older installed builds call the service's `*.run.app` URL, so never rename or delete the service; the pipeline's smoke check calls `/health` on both. [`scripts/deploy.sh`](scripts/deploy.sh) uploads this folder (`liftbig-api/`, not the whole repo) and Cloud Build builds it with the `Dockerfile`. Files ignored by `.gitignore` (`.env`, dumps, `node_modules`, `dist`) are not uploaded.

Every deploy sets `NODE_ENV=production`, `TYPEORM_SYNC=false` and `RUN_MIGRATIONS=true`, so **production schema changes only through migrations** in `src/migrations`, run on startup. An entity change without a migration fails CI's drift check ([Changing the schema](#changing-the-schema)). Deploys also set `BACKFILL_PBS=false`.

### One-time setup

```bash
scripts/gcp-setup.sh --project <project-id>
```

Run it in a terminal with an account that owns the project. It:

- logs in to `gcloud` if no account is active,
- enables the Cloud Run, Cloud Build, Artifact Registry, Secret Manager and IAM APIs,
- grants the Compute Engine default service account, which Cloud Build uses for source deploys, `roles/run.builder` and `roles/storage.objectViewer`,
- creates the service's runtime service account `liftbig-api-runtime` if it is missing, with no project roles (`--service-account` or `RUNTIME_SA` names another, existing one),
- creates the secrets `DATABASE_URL`, `JWT_SECRET` and `MAIL_PROVIDER_KEY` in Secret Manager if they are missing (values are typed hidden; a blank `JWT_SECRET` generates a random one),
- grants the runtime service account `roles/secretmanager.secretAccessor` on each of them, and nothing else,
- creates the bug-report screenshot bucket (`--bucket NAME`, env `BUG_REPORT_BUCKET`, default `<project-id>-bug-reports`) if it is missing, in `europe-west2` (London), with uniform bucket-level access, public access prevention and a lifecycle rule deleting objects 90 days after upload, and grants the runtime service account `roles/storage.objectAdmin` on that bucket only (not the project), and
- creates the public exercise demo media bucket (`--media-bucket NAME`, env `EXERCISE_MEDIA_BUCKET`, default `<project-id>-media`; ADR 0026) if it is missing, in `europe-west2`, with uniform bucket-level access and public access prevention off, and grants `allUsers` `roles/storage.legacyObjectReader` on it (files readable by URL, the bucket not listable); the API never touches it,
- creates the `GITHUB_FEEDBACK_TOKEN` secret **slot** if it is missing — with no value — and grants the runtime service account `roles/secretmanager.secretAccessor` on it; you add the value yourself (below) before the first deploy that needs it.

It is safe to run again; existing secrets and buckets are left as they are. To change a secret's value, add a version and redeploy (the service reads `latest` when a revision is created):

```bash
read -r -s -p 'New value: ' v && printf '%s' "$v" |
  gcloud secrets versions add JWT_SECRET --project=<project-id> --data-file=-; unset v
```

Replacing `JWT_SECRET` signs every user out.

### Bug reports to GitHub (LB-38)

One-time setup, done once per Google Cloud project, before the first deploy that needs it:

1. **Create the private repository.** github.com → the `+` in the top right → **New repository** → owner `IvanTachev233`, name `LiftBig-Feedback`, **Private**. Then that repo → **Issues** tab → **Labels** → **New label**, once each for `bug`, `needs-triage`, `platform:android`, `platform:ios`, `platform:web`.
2. **Create a fine-grained personal access token.** github.com → your avatar (top right) → **Settings** → **Developer settings** (left sidebar, bottom) → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**. Resource owner: your account. Repository access: **Only select repositories** → `LiftBig-Feedback`. Repository permissions → **Issues**: **Read and write**. Expiration: GitHub may not offer "No expiration" on a personal account — check what's offered; the plan assumes up to 1 year, with a calendar reminder to rotate it before it lapses (an expired token just means GitHub status `failed`/`disabled`, not an outage). **Generate token** and copy the value once; GitHub won't show it again.
3. **Run `scripts/gcp-setup.sh`** (above). It creates the `GITHUB_FEEDBACK_TOKEN` secret slot and the screenshot bucket.
4. **Store the token**, piped from stdin so it never lands in shell history or a file:

   ```bash
   read -r -s -p 'GitHub token: ' v && printf '%s' "$v" |
     gcloud secrets versions add GITHUB_FEEDBACK_TOKEN --project=<project-id> --data-file=-; unset v
   ```

5. **Set the GitHub Actions variables** the pipeline deploys with: this repo → **Settings** → **Secrets and variables** → **Actions** → **Variables** tab → **New repository variable**, once each for `BUG_REPORT_BUCKET` (the bucket name from step 3, e.g. `<project-id>-bug-reports`) and `FEEDBACK_REPO` (`IvanTachev233/LiftBig-Feedback`; GitHub doesn't allow variable names starting with `GITHUB_`, so the `deploy` job passes it to the service as `GITHUB_FEEDBACK_REPO`); leave `BUG_REPORTS_ENABLED` unset there for on. (For a manual run of `scripts/deploy.sh` yourself, set the same three as env vars or in `.env` instead, see [Deploy](#deploy).)

Do this — the whole numbered list above, including this step — before the branch that adds `GITHUB_FEEDBACK_TOKEN` to `scripts/deploy.sh`'s `SECRETS` and the three variables to `.github/workflows/api.yml`'s `deploy` job merges to `master`: the pipeline deploys every such merge, and a deploy fails if the secret has no version yet. Skipping step 5 alone doesn't fail the deploy, but it silently removes `BUG_REPORT_BUCKET`/`GITHUB_FEEDBACK_REPO` from the service (the Actions variables `BUG_REPORT_BUCKET`/`FEEDBACK_REPO`) (unset repository variables resolve to an empty string, which `scripts/deploy.sh` treats as "remove"), so screenshots wouldn't be stored and no GitHub issue would be filed even once the token works.

**Viewing a reported screenshot:** the GitHub issue links to the object, not the image itself (no public or signed URLs). Open the link, or go directly: console.cloud.google.com → **Cloud Storage** → **Buckets** → the bug-report bucket → the object (`<reportId>/<n>.jpg`) → it opens with a preview. Needs your Google sign-in on the project.

### Deploy

The script reads `GCP_PROJECT_ID`, `MAIL_FROM`, `CORS_ORIGINS`, `PRIVACY_OPERATOR_NAME`, `PRIVACY_CONTACT_EMAIL` and, when present, `SENTRY_DSN`, `BUG_REPORT_BUCKET`, `BUG_REPORTS_ENABLED`, `GITHUB_FEEDBACK_REPO` and `EXERCISE_MEDIA_BASE_URL` from the API's `.env` (`--env-file PATH` for another file); it reads only those keys, never the file's secrets. Values already in the environment win:

```bash
# .env (gitignored)
GCP_PROJECT_ID=<project-id>
MAIL_FROM='LiftBig <codes@your-domain>'
CORS_ORIGINS=                              # empty: no extra web origins
PRIVACY_OPERATOR_NAME='...'
PRIVACY_CONTACT_EMAIL='...'
```

```bash
scripts/deploy.sh --dry-run                # prints the gcloud command, deploys nothing
scripts/deploy.sh
```

In a terminal, the script asks for any value still not set, shows the command and asks before deploying. Without a terminal, or with `--non-interactive`, it doesn't ask: it exits with an error naming each missing value, and passes `--quiet` to `gcloud`. `--project`, `--region`, `--service` and `--service-account` override the env vars. `scripts/deploy.sh --help` lists the options.

| Name | Kind | Default | Notes |
| --- | --- | --- | --- |
| `GCP_PROJECT_ID` | input | required | The string project ID, not the project number |
| `GCP_REGION` | input | `europe-west1` | Cloud Run region |
| `SERVICE` | input | `liftbig-api` | Cloud Run service name |
| `RUNTIME_SA` | input | `liftbig-api-runtime@<project-id>.iam.gserviceaccount.com` | Service account the service runs as (`--service-account`); it reads the secrets and has no project roles. Empty means the default |
| `MAIL_FROM` | env var | required | Sender of the code mails (see [Environment variables](#environment-variables)) |
| `CORS_ORIGINS` | env var | required, may be empty | Extra allowed web origins |
| `PRIVACY_OPERATOR_NAME` | env var | required | Shown on `/privacy` and `/terms` |
| `PRIVACY_CONTACT_EMAIL` | env var | required | Shown on `/privacy` and `/terms` |
| `SENTRY_DSN` | env var | optional | Turns error reports on; unset or empty removes it from the service, which turns them off |
| `SENTRY_RELEASE` | env var | `GITHUB_SHA`, else the git `HEAD` | Release named in error reports |
| `BUG_REPORT_BUCKET` | env var | optional | Screenshot bucket; unset or empty removes it, so screenshots aren't stored |
| `BUG_REPORTS_ENABLED` | env var | optional, `false` or unset | `false` turns `POST /bug-reports` off; unset or empty removes it, which means on |
| `GITHUB_FEEDBACK_REPO` | env var | optional | `owner/repo` bug reports file an issue in; unset or empty removes it |
| `EXERCISE_MEDIA_BASE_URL` | env var | optional | Demo media bucket URL (`https://storage.googleapis.com/<project-id>-media`); unset or empty removes it, so exercise demos aren't shown. The pipeline takes the Actions variable of the same name |
| `NODE_ENV`, `TYPEORM_SYNC`, `RUN_MIGRATIONS`, `BACKFILL_PBS` | env var | `production`, `false`, `true`, `false` | Set by the script |
| `DATABASE_URL` | secret | Secret Manager `DATABASE_URL:latest` | Neon connection URL |
| `JWT_SECRET` | secret | Secret Manager `JWT_SECRET:latest` | Signs access tokens |
| `MAIL_PROVIDER_KEY` | secret | Secret Manager `MAIL_PROVIDER_KEY:latest` | Resend API key |
| `GITHUB_FEEDBACK_TOKEN` | secret | Secret Manager `GITHUB_FEEDBACK_TOKEN:latest` | Fine-grained GitHub token; `scripts/gcp-setup.sh` only creates the slot, add the version yourself (see [Bug reports to GitHub](#bug-reports-to-github-lb-38)) |

Env vars go through `--update-env-vars`, so any other env var on the service stays as it is. That includes `APP_MIN_VERSION_CODE` and `APP_LATEST_VERSION_CODE`: set them on the service itself (Cloud Run → the service → Edit & deploy new revision → Variables & Secrets) once the build they name is live on Play; the script doesn't set them. Secrets go through `--set-secrets`, so the service's secrets are exactly these four. The script also removes plain env vars with the secrets' names (`--remove-env-vars`, applied before the secrets), so a service that still has `DATABASE_URL` as a plain value switches to the secret in the same deploy. It never reads or prints a secret value.

Older plain env vars such as `DB_HOST` or `DB_PASSWORD` stay on the service until you remove them. The API ignores them once `DATABASE_URL` is set:

```bash
gcloud run services update liftbig-api --project=<project-id> --region=europe-west1 \
  --remove-env-vars=DB_HOST,DB_PORT,DB_USERNAME,DB_PASSWORD,DB_NAME
```

If a new revision fails to start (for example a secret can't be read), Cloud Run keeps serving the previous revision.

The script sets a startup probe (`--startup-probe`): a new revision gets traffic only once `GET /health` answers 2xx, and `/health` answers 200 `{"status":"ok"}` only after a `SELECT 1` on the database (503 otherwise; no auth, no data). It allows 240 s (24 tries 10 s apart, 5 s each), for migrations, which run before the port opens, and a Neon compute waking up. A revision that can't reach the database never takes traffic.

With `NODE_ENV=production` the API logs one JSON object per line, which Cloud Logging reads as `jsonPayload`: `severity` (the log level: `INFO`, `WARNING`, `ERROR`, ...), `message`, `context`, `time`, and the stack in `stack_trace` (a logged exception keeps its stack trace in `message`), so Error Reporting groups exceptions. Filter on `jsonPayload.message` and `severity`, for example `severity>=ERROR`. TypeORM's own lines, such as `Migration "..." failed`, stay plain text (`textPayload`). Locally the API logs Nest's usual text.

### Error reports (Sentry)

With `SENTRY_DSN` set, `src/instrument.ts` (the first import in `main.ts`) starts Sentry, and a global filter reports every error that isn't an `HttpException` (so not 4xx answers, 503 from `/health` or validation errors) before Nest answers 500 as usual. Reports carry the stack trace, the release, the method, the path without its query string, the `user-agent`, `content-type`, `content-length` and `accept` headers, and the account id of a signed-in request; never the body, other headers (`Authorization`, cookies, `X-Forwarded-For`), the query string, stack-frame variables or an IP address. The full list and the console settings (EU data storage, IP storage off) are in `docs/privacy/records-of-processing.md` § Sentry settings; the privacy policy describes the same, so a change to what's sent needs both updated. No tracing, profiling or logs. A `SENTRY_DSN` in `.env` turns reports on for local runs too (environment `development`), so keep it out of `.env` unless you mean that.

To check a DSN, send one test event through the same setup: `SENTRY_DSN=<dsn> npx ts-node scripts/sentry-test-event.ts`. In Sentry → Issues, "LiftBig Sentry test event" should show the user as `sentry-test-user` only and none of the test request's body, `Authorization`, cookie, `X-Forwarded-For` or `?email=` query.

To turn reports off in production, delete the `SENTRY_DSN` variable of the `production` environment and redeploy (Actions → API → Run workflow); the deploy removes it from the service.

### Running from the pipeline

[`.github/workflows/api.yml`](../.github/workflows/api.yml) at the repo root tests the API on pull requests and, after the tests pass, deploys every merge to `master` that changes `liftbig-api/` or the workflow (Actions → API → Run workflow redeploys by hand). Its `ci-ok` job is the one check the `master` ruleset requires. The tests start with `npm audit --omit=dev --audit-level=high`, so a high or critical advisory in a runtime dependency also stops the deploy until it's fixed (`package.json` `overrides` pins `multer` 2.5.0 under `@nestjs/platform-express` until a Nest 11 release ships it; remove it then). It runs the same script with no changes. Give it the inputs as env vars (none of them are secret) and authenticate `gcloud` as a deploy service account through **Workload Identity Federation**, so there is no service account key file to store. On GitHub Actions that means `permissions: id-token: write`, then `google-github-actions/auth` with `workload_identity_provider` and `service_account`, then `google-github-actions/setup-gcloud`, then `scripts/deploy.sh`. Without a terminal it never waits for input. After the deploy, a smoke check fetches `/health` from the service URL and fails the job on anything but 2xx.

The deploy service account needs `roles/run.sourceDeveloper` and `roles/serviceusage.serviceUsageConsumer` on the project, and `roles/iam.serviceAccountUser` on the runtime service account (`liftbig-api-runtime`), which it attaches to each revision. Set up the runtime service account, its secret access and this grant before a change to it merges: until they exist, deploys fail and Cloud Run keeps serving the previous revision. Leave its `roles/iam.serviceAccountUser` on the Compute Engine default service account in place while deploys build from source: Cloud Build runs as that account. It never needs access to the secret values; the runtime service account reads them.

The workflow passes `RUNTIME_SA` and `SENTRY_DSN` from the `production` environment's variables, and `deploy.sh` takes the release from `GITHUB_SHA`. For `RUNTIME_SA`, when it isn't set, the script's default applies. To go back to another runtime service account, set `RUNTIME_SA` to it and run the workflow, or pick it in Cloud Run → the service → Edit & deploy new revision → Security (the next pipeline deploy switches back to `RUNTIME_SA`).

## Rollback

Three cases: a bad API release, a failed migration, and lost or damaged data. The alerts (uptime check on `/health`, 5xx rate, p95 latency, instances at the maximum, failed migration, and Sentry's new or regressed issue) email the maintainer; the Cloud Monitoring dashboard shows requests, 5xx, latency, instances and uptime.

### A bad API release

The usual way back is a revert: revert the merge on `master` through a PR, and the pipeline tests and deploys the previous code.

When that's too slow, send all traffic to the previous revision. In the console: Cloud Run → `liftbig-api` → Revisions → the previous revision → Manage traffic → 100%. Or:

```bash
gcloud run revisions list --service=liftbig-api --project=<project-id> --region=europe-west1
gcloud run services update-traffic liftbig-api --project=<project-id> --region=europe-west1 \
  --to-revisions=<previous-revision>=100
```

While traffic is pinned to a revision, the pipeline's `/health` smoke check reaches that revision, not the new one, and a new revision may be deployed with 0% of the traffic (Cloud Run → Revisions shows it). Once the fix is deployed, send traffic back to the newest revision:

```bash
gcloud run services update-traffic liftbig-api --project=<project-id> --region=europe-west1 --to-latest
```

Going back to an older revision doesn't undo its migrations: the older code runs on the newer schema. That's fine when the migration only adds tables or columns. When it drops or renames them, fix forward, or restore the database to before the deploy (below) and run the matching older revision.

### A failed migration

Migrations run at startup, before the port opens, all pending ones in one transaction. A failure logs `Migration "..." failed` (the failed-migration alert matches it), rolls the whole transaction back, and the revision never passes its startup probe on `/health`, so the previous revision keeps serving and the data is unchanged. Fix the migration and deploy again.

### Restoring the database (Neon)

Neon can restore a branch to any moment inside the project's history window: 6 hours on the Free plan, up to 7 days on Launch and 30 days on Scale (Neon docs, read 2026-11-01). Neon → the project → Settings shows the current window. Anything older is gone, so act within the window.

1. Find the moment to go back to. Look before restoring: Branches → New branch → parent `production`, **Past data**, a date and time; connect to the branch and query it. Delete the branch afterwards.
2. Restore: open the `production` branch's **Backup & Restore** page, pick the date and time, check with **Preview data** (read-only tables, SQL or a schema diff), then **Restore**. It overwrites every database on the branch; anything written after that moment is lost. Neon keeps the state just before the restore as a branch named `production_old_<timestamp>`, so a wrong restore can be undone; delete it once it's no longer needed.
3. The branch stays the same, so `DATABASE_URL` doesn't change. If the restore goes back past a migration, run an API revision that matches that schema first: a newer revision runs the migration again on its next start.

### Restore drill

Done once before the Play production rollout (T1 A3d) and again after a change of Neon plan or region, it checks that a past state can be read back without touching production:

1. Neon → the project → Branches → **New branch**: parent `production`, **Past data** at about 1 hour ago, auto-delete after 1 hour.
2. In the branch's SQL Editor (or `psql` with its connection string), run `SELECT count(*) FROM "user";` and `SELECT count(*) FROM workout;`, and compare them with production: equal, or lower by what was added in the last hour.
3. Delete the branch (Branches → the branch → ⋮ → Delete).
4. Note the date, the restore time picked, the two counts and the history window below.

| Date | Restore point | Counts (user, workout): branch / production | History window |
| --- | --- | --- | --- |
| 2026-11-01, 07:21 (Ivan) | about 1 hour before | not recorded | not recorded (Free plan: 6 hours) |

## Workout routes

Every workout now carries `assignedById` and `assignedBy: { id, name } | null` (the assigning coach; null for a self-made workout). Exercises come back as cards sorted by card `order`, then set `order`. Each set is `{ id, reps, weight, order, made, actualReps, actualWeight, notes }`:

- `reps` and `weight` are the plan; `weight` may be null.
- `made`: true = made, false = missed, null = not logged.
- `actualReps` / `actualWeight`: null means "as planned".

Client and self routes (JWT; only the caller's own workouts, otherwise 404):

- `GET /workouts`, `GET /workouts/upcoming`, `GET /workouts/:id`: own workouts, assigned ones included.
- `POST /workouts`: creates a self-made workout. `assignedById` in the body is ignored.
- `PATCH /workouts/:id`:
  - Self-made: `name`, `notes`, `date`, `status` and `exercises`. Cards and sets are updated in place by `id`, and results left out of the body are kept. Rows without an id are created, rows left out are deleted, and ids not on this workout get 400.
  - Assigned or from a program: `status` only, or a body of only `date` that moves a PLANNED workout from another day to today (the new day must be today in UTC or one day either side, for the client's time zone). Anything else gets 403.
  - Program workouts carry `program: { enrollmentId, name, week, day }`: `week` and `day` (its place among that week's sessions, both from 1) come from the template session, so a moved workout keeps them; both are null when the session row is gone.
- `DELETE /workouts/:id`: self-made only; an assigned workout gets 403.
- `POST /workouts/:id/cards/:cardId/sets`: adds a set (`reps`, optional `weight`, `made`, `actualReps`, `actualWeight`) to a card of an own workout. Returns 201 with the set.
- `PATCH /workouts/:id/sets/:setId`: logs a result (`made`, `actualReps`, `actualWeight`). Planned fields (`reps`, `weight`, `notes`) get 400. The first result moves a PLANNED workout to IN_PROGRESS.

Coach routes (COACH role; the client must be the caller's client in the database right now, otherwise 403):

- `GET /coach/clients/:clientId/workouts`: workouts the caller assigned to that client.
- `POST /coach/clients/:clientId/workouts`: assigns a planned workout (`name`, `date`, optional `notes`, `exercises` with `sets: [{ reps, weight, notes, order }]`). It starts as PLANNED.
- `GET /coach/workouts/:id`, `PUT /coach/workouts/:id`, `DELETE /coach/workouts/:id`: workouts the caller assigned (otherwise 404). PUT writes planned values only and updates cards and sets in place by `id`, so the client's results are kept, also when a set moves to another card. Ids not on this workout get 400. Sending `made`, `actualReps`, `actualWeight` or `status` gets 400.

Every write locks the workout row for its transaction, so concurrent coach and client saves don't overwrite each other.

Removed: every `/programs` route.

## Gotchas

- Nullable columns need an explicit type: `@Column({ type: 'varchar', nullable: true }) field: string | null`. Without `type`, TypeORM fails at runtime with "Data type Object not supported".
- CORS always allows `http://localhost:4200`, `http://localhost:8100`, `capacitor://localhost` and `https://localhost` (see `src/main.ts`). Allow any other client origin through `CORS_ORIGINS` rather than editing the code.
- Never commit database dumps or deploy archives (`liftbig_dump.sql` and `deploy.zip` are gitignored).
