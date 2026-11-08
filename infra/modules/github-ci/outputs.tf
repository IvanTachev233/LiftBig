output "pool_name" {
  description = "Full resource name of the Workload Identity pool."
  value       = google_iam_workload_identity_pool.github.name
}

output "deployer_member" {
  description = "IAM member string of the deployer."
  value       = google_service_account.deployer.member
}
