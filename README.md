# LiftBig

Strength-training app with coach and client roles. One repo, two projects:

- `liftbig-app/` — Ionic/Angular app (Android via Capacitor). **Onboarding guide: [liftbig-app/README.md](liftbig-app/README.md)**
- `liftbig-api/` — NestJS API on Google Cloud Run. API details and deploy: [liftbig-api/README.md](liftbig-api/README.md)

The local stack is defined in `liftbig-app/docker-compose.yml`. The `docker-compose.yml` here only includes it, so `docker compose up -d --build` works from the repo root too (it needs `liftbig-app/.env`; copy `liftbig-app/.env.example`).

CI: `.github/workflows/api.yml` tests the API on pull requests and deploys `master` to Cloud Run.
