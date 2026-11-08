variable "project_id" {
  description = "Google Cloud project."
  type        = string
}

variable "region" {
  description = "Cloud Run region."
  type        = string
}

variable "name" {
  description = "Cloud Run service name."
  type        = string
}

variable "runtime_sa_id" {
  description = "Account id of the service's runtime identity."
  type        = string
}

variable "runtime_sa_display_name" {
  description = "Display name of the runtime identity."
  type        = string
}

variable "secrets" {
  description = "Secret Manager secrets the service reads. Containers only; values are set outside OpenTofu."
  type        = set(string)
}

variable "max_instances" {
  description = "Most instances per revision."
  type        = number
}

variable "domain" {
  description = "Custom domain mapped to the service."
  type        = string
}
