output "runtime_sa_email" {
  description = "Email of the runtime identity."
  value       = google_service_account.runtime.email
}

output "runtime_sa_name" {
  description = "Full resource name of the runtime identity."
  value       = google_service_account.runtime.name
}

output "uri" {
  description = "The service's run.app URL."
  value       = google_cloud_run_v2_service.this.uri
}
