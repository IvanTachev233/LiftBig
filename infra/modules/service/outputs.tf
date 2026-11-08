output "runtime_sa_email" {
  description = "Email of the runtime identity."
  value       = google_service_account.runtime.email
}

output "runtime_sa_name" {
  description = "Full resource name of the runtime identity."
  value       = google_service_account.runtime.name
}
