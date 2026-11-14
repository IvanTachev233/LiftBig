# A Cloud Run service with its runtime identity and secrets (ADR 0024, 6A),
# public with a domain by default. Each setting has one owner: this module owns
# the service's shape; the deploy owns image, env vars, secret references and
# startup probe. The Vision repo uses it through a tag: keep changes backward
# compatible and tag a new version for it (infra/README.md).

resource "google_service_account" "runtime" {
  project      = var.project_id
  account_id   = var.runtime_sa_id
  display_name = var.runtime_sa_display_name
  description  = "Runtime identity for the ${var.name} Cloud Run service"
}

resource "google_secret_manager_secret" "this" {
  for_each = var.secrets

  project   = var.project_id
  secret_id = each.value

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_iam_member" "runtime" {
  for_each = var.secrets

  project   = var.project_id
  secret_id = google_secret_manager_secret.this[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.runtime.member
}

resource "google_cloud_run_v2_service" "this" {
  project  = var.project_id
  location = var.region
  name     = var.name
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account                  = google_service_account.runtime.email
    max_instance_request_concurrency = 80
    timeout                          = "300s"

    scaling {
      max_instance_count = var.max_instances
    }

    containers {
      # Replaced by every deploy; only used if OpenTofu ever creates the service.
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      ports {
        name           = "http1"
        container_port = 8080
      }

      resources {
        cpu_idle          = true
        startup_cpu_boost = true
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      build_config,
      client,
      client_version,
      template[0].containers[0].image,
      template[0].containers[0].env,
      template[0].containers[0].startup_probe,
      template[0].labels,
      template[0].annotations,
      template[0].revision,
    ]
  }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  count = var.public ? 1 : 0

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.this.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Recreating a mapping needs a verified Search Console owner, which OpenTofu's
# identity is not, so an apply must never replace it.
resource "google_cloud_run_domain_mapping" "this" {
  count = var.domain == null ? 0 : 1

  location = var.region
  name     = var.domain

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.this.name
  }

  lifecycle {
    prevent_destroy = true
  }
}

# Both became optional for Vision; LiftBig's existing objects keep instance 0.
moved {
  from = google_cloud_run_v2_service_iam_member.public
  to   = google_cloud_run_v2_service_iam_member.public[0]
}

moved {
  from = google_cloud_run_domain_mapping.this
  to   = google_cloud_run_domain_mapping.this[0]
}
