# Infrastructure

Google Cloud for LiftBig, managed with OpenTofu (ADR 0024). Each environment is a root in `envs/`, with its state in that project's `<project>-tfstate` bucket; `modules/` holds what they share.

This repository is public: no secrets, personal email addresses or billing ids in code, and no plan output in CI logs.

- `bootstrap.sh` makes what OpenTofu needs before it can run. It stays outside OpenTofu so an apply can't lock itself out.
- Secret values, Neon, Play Console, Search Console, DNS, GitHub settings and budgets are managed by hand.
- Cloud Run: this code owns the service's shape; `liftbig-api/scripts/deploy.sh` owns image, env vars, secret references and startup probe.
- The Vision repo (`IvanTachev233/CoachVisionApi`) uses `modules/` through a tag, `infra-modules-v<N>`. Keep module changes backward compatible (new variables with defaults that leave LiftBig's plans empty, `moved` blocks for new `count`s), then tag the merge commit on `master` with the next number for Vision to move to.

## Pipeline

`.github/workflows/api.yml` runs it when `infra/` or that workflow changes. It needs the repository secret `ALERT_EMAIL`, the alert address of both roots.

- **Pull request into `master`:** `tofu-plan` runs read-only for both roots and keeps one comment up to date, listing each resource address and its action. PRs from forks and Dependabot get no OIDC token and skip it.
- **Merge to `master`:** `tofu-plan` saves a plan per root. A root with changes is applied from exactly that plan, staging in `infra-staging`, then production in `infra-production` after approval.

Read a full plan, named in the comment or the run's summary, locally from `infra/envs/<root>` after `tofu init`:

```bash
gcloud storage cp gs://<project>-tfstate/plans/<name>.tfplan /tmp/ && tofu show /tmp/<name>.tfplan
```

An apply refuses a plan that is out of date, either because the state has moved or because the API was deployed after a plan that changes the Cloud Run service. Start a fresh plan with Actions → API → Run workflow on `master`, which also redeploys staging.

## Working locally

Needs OpenTofu 1.13.9 and `gcloud auth application-default login`. Both roots read the alert address from the environment:

```bash
export TF_VAR_alert_email="$(gcloud beta monitoring channels list --project liftbigapi --format='value(labels.email_address)')"
```

```bash
cd infra/envs/production && tofu init && tofu plan -lock=false
```
