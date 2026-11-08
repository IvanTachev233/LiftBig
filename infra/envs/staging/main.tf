locals {
  project_id        = "liftbig-staging"
  region            = "europe-west1"
  bucket_location   = "EUROPE-WEST2"
  service           = "liftbig-api"
  github_repo       = "IvanTachev233/LiftBig"
  github_repo_id    = "1433602176"
  github_sub_prefix = "repo:IvanTachev233@63864892/LiftBig@1433602176"

  apis = toset([
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "serviceusage.googleapis.com",
    "storage.googleapis.com",
    "sts.googleapis.com",
  ])
}

resource "google_project_service" "this" {
  for_each = local.apis

  project = local.project_id
  service = each.value
}

module "service" {
  source = "../../modules/service"

  project_id              = local.project_id
  region                  = local.region
  name                    = local.service
  runtime_sa_id           = "liftbig-api-runtime"
  runtime_sa_display_name = "liftbig-api runtime"
  secrets                 = ["DATABASE_URL", "JWT_SECRET"]
  max_instances           = 2
  domain                  = "staging-api.liftbig.co"
}

module "github_ci" {
  source = "../../modules/github-ci"

  project_id           = local.project_id
  pool_display_name    = "GitHub Actions"
  github_repo          = local.github_repo
  github_repo_id       = local.github_repo_id
  github_sub_prefix    = local.github_sub_prefix
  github_environment   = "staging"
  deployer_description = "Deploys liftbig-api (staging) from GitHub Actions (ADR 0023)"
  runtime_sa_name      = module.service.runtime_sa_name
}

# Public exercise demo media (ADR 0026): objects readable, bucket not listable.
resource "google_storage_bucket" "media" {
  project                     = local.project_id
  name                        = "liftbig-staging-media"
  location                    = local.bucket_location
  uniform_bucket_level_access = true
  public_access_prevention    = "inherited"
}

resource "google_storage_bucket_iam_member" "media_public" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.legacyObjectReader"
  member = "allUsers"
}

# --- Monitoring -------------------------------------------------------------

variable "alert_email" {
  description = "Address alerts go to. Kept out of the public repo; set TF_VAR_alert_email."
  type        = string
  sensitive   = true
}

module "monitoring" {
  source = "../../modules/monitoring"

  project_id           = local.project_id
  channel_display_name = "LiftBig staging"
  alert_email          = var.alert_email

  uptime = {
    display_name = "LiftBig staging API up"
    host         = "staging-api.liftbig.co"
    # Not /health: it queries the database, and a check every 5 minutes would
    # stop Neon from scaling to zero and use up the Free plan's compute hours.
    path               = "/privacy"
    alert_display_name = "LiftBig staging API uptime failure"
    notify             = true
  }
}
