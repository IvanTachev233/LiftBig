locals {
  project_id        = "liftbigapi"
  region            = "europe-west1"
  bucket_location   = "EUROPE-WEST2"
  service           = "liftbig-api"
  github_repo       = "IvanTachev233/LiftBig"
  github_repo_id    = "1433602176"
  github_sub_prefix = "repo:IvanTachev233@63864892/LiftBig@1433602176"

  # Staging pulls images from this project's registry (ADR 0023).
  staging_project_id     = "liftbig-staging"
  staging_project_number = "580198554035"
  project_number         = "672384368199"

  apis = toset([
    "artifactregistry.googleapis.com",
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

  run_filter = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"${local.service}\""
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
  runtime_sa_display_name = "liftbig-api-runtime"
  secrets                 = ["DATABASE_URL", "JWT_SECRET", "MAIL_PROVIDER_KEY", "GITHUB_FEEDBACK_TOKEN"]
  max_instances           = 20
  domain                  = "api.liftbig.co"
}

module "github_ci" {
  source = "../../modules/github-ci"

  project_id           = local.project_id
  pool_display_name    = "github"
  pool_description     = "GitHub Actions"
  github_repo          = local.github_repo
  github_repo_id       = local.github_repo_id
  github_sub_prefix    = local.github_sub_prefix
  github_environment   = "production"
  deployer_description = "GitHub Actions deployer for liftbig-api"
  runtime_sa_name      = module.service.runtime_sa_name
}

# --- Registry and the identity that builds images (ADR 0023) ----------------

resource "google_artifact_registry_repository" "liftbig" {
  project                = local.project_id
  location               = local.region
  repository_id          = "liftbig"
  format                 = "DOCKER"
  description            = "LiftBig images, built once on master and promoted by digest (ADR 0023)"
  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"

    condition {
      tag_state  = "ANY"
      older_than = "2592000s"
    }
  }

  cleanup_policies {
    id     = "keep-newest"
    action = "KEEP"

    most_recent_versions {
      keep_count = 30
    }
  }
}

resource "google_service_account" "builder" {
  project      = local.project_id
  account_id   = "github-builder"
  display_name = "github-builder"
  description  = "Pushes API images from master to liftbig; can't deploy (ADR 0023)"
}

resource "google_service_account_iam_member" "builder_from_github" {
  service_account_id = google_service_account.builder.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principal://iam.googleapis.com/${module.github_ci.pool_name}/subject/${local.github_sub_prefix}:ref:refs/heads/master"
}

resource "google_artifact_registry_repository_iam_member" "writer" {
  project    = local.project_id
  location   = local.region
  repository = google_artifact_registry_repository.liftbig.repository_id
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.builder.member
}

resource "google_artifact_registry_repository_iam_member" "reader" {
  for_each = {
    production_deployer = module.github_ci.deployer_member
    staging_deployer    = "serviceAccount:github-deployer@${local.staging_project_id}.iam.gserviceaccount.com"
    production_agent    = "serviceAccount:service-${local.project_number}@serverless-robot-prod.iam.gserviceaccount.com"
    staging_agent       = "serviceAccount:service-${local.staging_project_number}@serverless-robot-prod.iam.gserviceaccount.com"
  }

  project    = local.project_id
  location   = local.region
  repository = google_artifact_registry_repository.liftbig.repository_id
  role       = "roles/artifactregistry.reader"
  member     = each.value
}

# --- Buckets ----------------------------------------------------------------

# Bug-report screenshots, private, deleted after 90 days (ADR 0021).
resource "google_storage_bucket" "bug_reports" {
  project                     = local.project_id
  name                        = "liftbigapi-bug-reports"
  location                    = local.bucket_location
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = 90
    }
  }
}

resource "google_storage_bucket_iam_member" "bug_reports_runtime" {
  bucket = google_storage_bucket.bug_reports.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${module.service.runtime_sa_email}"
}

# Public exercise demo media (ADR 0026): objects readable, bucket not listable.
resource "google_storage_bucket" "media" {
  project                     = local.project_id
  name                        = "liftbigapi-media"
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
  channel_display_name = "LiftBigApi"
  alert_email          = var.alert_email

  uptime = {
    display_name       = "LiftBigAPI Healthy"
    host               = "api.liftbig.co"
    alert_display_name = "LiftBigAPI Healthy uptime failure"
    notify             = false
  }

  threshold_alerts = {
    requests = {
      display_name           = "LiftBigAPI Requests"
      condition_display_name = "Cloud Run Revision - Request Count"
      filter                 = "${local.run_filter} AND metric.type = \"run.googleapis.com/request_count\""
      per_series_aligner     = "ALIGN_RATE"
      threshold              = 100
    }
    latency = {
      display_name           = "LiftBigAPi Latency"
      condition_display_name = "Cloud Run Revision - Request Latency"
      filter                 = "${local.run_filter} AND metric.type = \"run.googleapis.com/request_latencies\""
      per_series_aligner     = "ALIGN_PERCENTILE_95"
      duration               = "600s"
      threshold              = 2000
    }
    at_max = {
      display_name           = "LiftBigAPi At Max"
      condition_display_name = "Cloud Run Revision - Instance Count"
      filter                 = "${local.run_filter} AND metric.type = \"run.googleapis.com/container/instance_count\""
      per_series_aligner     = "ALIGN_MAX"
      threshold              = 19
    }
    errors_5xx = {
      display_name           = "LiftBigAPi 5xx"
      condition_display_name = "LiftBigAPi Revision - Request Count"
      filter                 = "${local.run_filter} AND metric.type = \"run.googleapis.com/request_count\" AND metric.labels.response_code_class = \"5xx\""
      per_series_aligner     = "ALIGN_SUM"
      threshold              = 5
      notification_prompts   = ["OPENED", "CLOSED"]
    }
  }

  log_alerts = {
    migration_failed = {
      display_name           = "TypeORM Failure"
      condition_display_name = "Log match condition"
      filter                 = "SEARCH(\"`resource.type=`\")\n\"cloud_run_revision\"\nSEARCH(\"`resource.labels.service_name=`\")\n\"liftbig-api\"\nSEARCH(\"`textPayload:`\")\n\"Migration\"\nSEARCH(\"`textPayload:`\")\n\"failed\""
      severity               = "ERROR"
      rate_limit_period      = "3600s"
      auto_close             = "604800s"
    }
  }
}

resource "google_monitoring_dashboard" "api" {
  project        = local.project_id
  dashboard_json = file("${path.module}/dashboard.json")
}
