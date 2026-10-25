# LiftBig

LiftBig is a strength-training app for coaches and their clients. Coaches invite clients and assign them workouts; clients log their own and assigned workouts and track their stats.

This repo (`LiftBigMobile`) is the mobile/web app: Ionic 8 + Angular 20, packaged for Android and iOS with Capacitor 8. The backend is a separate repo, [LiftBigMobile-API](https://github.com/IvanTachev233/LiftBigMobile-API) (NestJS 11 + PostgreSQL). You need both to run the app locally.

## Prerequisites

- **Node.js 22** (22.12 or newer). The version is pinned in [`.nvmrc`](.nvmrc), so `nvm use` picks it up. Angular 20 needs `^20.19 || ^22.12 || >=24`, and the Capacitor 8 CLI needs 22 or newer.
- **Docker** with the Compose plugin (`docker compose`, not `docker-compose`), for PostgreSQL and the optional containerized stack.
- For device builds only: Android Studio and/or Xcode (see [Running on a device](#running-on-a-device)).

## Clone both repos side by side

The compose file here builds the API from `../liftbig-api`, so the folder names matter:

```bash
mkdir liftbig && cd liftbig
git clone https://github.com/IvanTachev233/LiftBigMobile.git liftbig-app
git clone https://github.com/IvanTachev233/LiftBigMobile-API.git liftbig-api
cd liftbig-app
```

Run every command below from `liftbig-app/` unless it says otherwise.

## Quick start: full stack in Docker

The quickest way to see the app working. Nothing to install except Docker:

```bash
cp .env.example .env    # once, then set JWT_SECRET in it (openssl rand -base64 48)
docker compose up -d --build
```

`docker-compose.yml` takes the database and pgAdmin credentials and `JWT_SECRET` from `liftbig-app/.env` (git-ignored), whether you run compose from here or from the workspace root; it stops and names any value that's missing. [`.env.example`](.env.example) is the committed reference. Keep the same `JWT_SECRET` between runs: a new one signs everyone out.

Then open <http://localhost:4200>. This starts PostgreSQL, pgAdmin, the API and the app (served by nginx). The app is built with `--configuration production,docker`, so it calls the **local** API through nginx's `/api` proxy rather than production.

Stop everything with `docker compose down`. Your data stays in the `liftbigmobile_postgres_data` volume. Don't add `-v` unless you want to wipe the database.

## Day-to-day development (native dev loop)

For coding, run the API and app on your machine with live reload, and only the database in Docker.

1. Stop the containerized API and app if they are running (they hold ports 3000 and 4200), then start the database:

   ```bash
   docker compose stop liftbig_api liftbig_app
   docker compose up -d postgres
   ```

2. In a second terminal, start the API. Its `.env` needs `JWT_SECRET` and `DB_USERNAME`/`DB_PASSWORD`/`DB_NAME` set to the `POSTGRES_*` values from `liftbig-app/.env`; it then connects to the database above and creates the schema on first run:

   ```bash
   cd ../liftbig-api
   npm install
   cp .env.example .env # once, then fill it in
   npm run start:dev
   ```

   The API listens on <http://localhost:3000>.

3. In a third terminal, start the app:

   ```bash
   npm install --legacy-peer-deps
   npm start
   ```

   Open <http://localhost:4200>. In development the app calls the API at `http://localhost:3000` directly (`src/environments/environment.ts`).

`--legacy-peer-deps` matches how the Docker images install the app's dependencies.

## Hot-reload stack in Docker (dev profile)

If you'd rather not install Node, the `dev` profile runs the API (`npm run start:dev`) and the app (`ng serve`) in containers, with your `src/` folders mounted for live reload. It needs `liftbig-app/.env` (see Quick start):

```bash
docker compose stop liftbig_api liftbig_app
docker compose --profile dev up -d --build postgres liftbig_api_dev liftbig_app_dev
```

Name the services explicitly as above. A bare `docker compose --profile dev up` also starts the production containers, which clash on ports 3000 and 4200. Stop the dev containers with `docker compose --profile dev stop liftbig_api_dev liftbig_app_dev`.

## First run

The database starts empty. Open <http://localhost:4200>, choose **Register**, and create an account:

- **Coach**: invites clients and assigns them workouts from the coach dashboard.
- **Client** (default): logs workouts and sees stats. Clients can also join a coach through an invite link (`/accept-invite/:token`).

Create one of each to try the coach–client flow.

## Local ports and credentials

The database and pgAdmin credentials are whatever you set in `liftbig-app/.env` (keys listed in [`.env.example`](.env.example)). Use local-only values; never reuse them anywhere else.

| Service | URL / port | Credentials |
| --- | --- | --- |
| App | <http://localhost:4200> | the account you register |
| API | <http://localhost:3000> | JWT from `POST /auth/login` |
| PostgreSQL | `localhost:5433` (host), `postgres:5432` (inside Docker) | `POSTGRES_USER` / `POSTGRES_PASSWORD`, database `POSTGRES_DB` |
| pgAdmin | <http://localhost:5050> | `PGADMIN_DEFAULT_EMAIL` / `PGADMIN_DEFAULT_PASSWORD` |

In pgAdmin, register a server with host `postgres`, port `5432` and the PostgreSQL credentials above.

## Checks

```bash
npm run build     # production build into www/
npm run lint
npm test          # Karma; opens Chrome and watches
npx ng test --watch=false --browsers=ChromeHeadless   # single headless run
```

## Troubleshooting

- **Port 3000 or 4200 is already in use.** Usually `liftbig_api` / `liftbig_app` from an earlier `docker compose up`. They use `restart: always`, so they come back whenever Docker restarts. Stop them with `docker compose stop liftbig_api liftbig_app`.
- **The API in Docker runs old code.** The container keeps its image until rebuilt: `docker compose up -d --build liftbig_api`.
- **The API can't reach the database.** PostgreSQL is published on host port **5433**, not 5432. Check that `docker compose ps postgres` shows it running.
- **CORS errors in the browser.** The API only allows `http://localhost:4200`, `http://localhost:8100`, `capacitor://localhost` and `https://localhost` (see `src/main.ts` in the API repo). Serve the app on one of those origins.
- **The app is talking to production.** Only builds made with plain `npm run build` / `ng build` do that (see below). `npm start` uses the local API, and so does the Docker stack.

## Running on a device

Device builds use the production configuration, which points at the **production API** (`src/environments/environment.prod.ts`). Anything you do in a device build touches real data.

```bash
npm run build           # production web build into www/
npx cap sync            # copy www/ and plugins into android/ and ios/
npx cap open android    # or: npx cap open ios
```

`npx cap run android` (or `ios`) syncs, builds and deploys to a connected device or emulator in one step.

## Release build

Google Play takes a signed Android App Bundle (`.aab`), built against the production API. The signing values come from `android/keystore.properties`, which is gitignored. Release builds stop with a message naming what is missing (the file, a value or the keystore); debug builds don't need the file.

1. Create `android/keystore.properties`. `storeFile` is relative to `android/` (use forward slashes; an absolute path also works):

   ```properties
   storeFile=../liftbig-release.keystore
   storePassword=...
   keyAlias=...
   keyPassword=...
   ```

2. Raise `versionCode` by 1 in `android/app/build.gradle` (`defaultConfig`) before every upload; Play rejects a versionCode it has already seen. `versionName` is the version users see; change it when you want a new one.

3. Build. Install with `--legacy-peer-deps`: plain `npm ci` fails on `ng2-charts`' `@angular/cdk` peer, which the lockfile leaves out.

   ```bash
   npm ci --legacy-peer-deps
   npm run build
   npx cap sync android
   cd android && ./gradlew bundleRelease
   ```

   The bundle is `android/app/build/outputs/bundle/release/app-release.aab`.

4. Check it. `jarsigner -verify` should print `jar verified.`, and `bundletool validate` should exit without errors (bundletool: `brew install bundletool`, or the jar from its GitHub releases):

   ```bash
   jarsigner -verify android/app/build/outputs/bundle/release/app-release.aab
   bundletool validate --bundle=android/app/build/outputs/bundle/release/app-release.aab
   ```

5. Optional: install the bundle on an emulator. bundletool signs the APKs with your debug key, so first uninstall any copy of the app signed with a different key:

   ```bash
   bundletool build-apks --bundle=android/app/build/outputs/bundle/release/app-release.aab --output=app.apks --connected-device
   bundletool install-apks --apks=app.apks
   ```

The keystore is the app's upload key for Play App Signing. Keep an offline backup of the keystore file and both passwords. Without them, every update needs an upload key reset from Google.

## Secrets

Never commit release signing material. `*.keystore` and `android/keystore.properties` are gitignored; keep `liftbig-release.keystore` and its passwords out of the repo and out of chat and screenshots.

## Related

- API setup, environment variables and deployment: [LiftBigMobile-API README](https://github.com/IvanTachev233/LiftBigMobile-API#readme)
