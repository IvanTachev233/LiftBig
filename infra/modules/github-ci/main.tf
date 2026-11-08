# GitHub Actions access to one project: the Workload Identity pool and provider,
# and the identity that deploys (ADR 0012, 0023). OpenTofu's own identities are
# in infra/bootstrap.sh, so an apply can't lock itself out.

locals {
  deployer_roles = toset(["roles/run.developer", "roles/serviceusage.serviceUsageConsumer"])
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "github"
  display_name              = var.pool_display_name
  description               = var.pool_description
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "liftbig-github"
  display_name                       = "GitHub ${var.github_repo}"
  attribute_condition                = "assertion.repository_id=='${var.github_repo_id}'"
  attribute_mapping = {
    "google.subject"          = "assertion.sub"
    "attribute.repository_id" = "assertion.repository_id"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com/"
  }
}

resource "google_service_account" "deployer" {
  project      = var.project_id
  account_id   = "github-deployer"
  display_name = "github-deployer"
  description  = var.deployer_description
}

resource "google_project_iam_member" "deployer" {
  for_each = local.deployer_roles

  project = var.project_id
  role    = each.value
  member  = google_service_account.deployer.member
}

resource "google_service_account_iam_member" "deployer_acts_as_runtime" {
  service_account_id = var.runtime_sa_name
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.deployer.member
}

resource "google_service_account_iam_member" "deployer_from_github" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principal://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/subject/${var.github_sub_prefix}:environment:${var.github_environment}"
}
