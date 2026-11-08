variable "project_id" {
  description = "Google Cloud project."
  type        = string
}

variable "pool_display_name" {
  description = "Display name of the Workload Identity pool."
  type        = string
}

variable "pool_description" {
  description = "Description of the Workload Identity pool."
  type        = string
  default     = null
}

variable "github_repo" {
  description = "Repository as OWNER/NAME."
  type        = string
}

variable "github_repo_id" {
  description = "The repository's numeric id; only its tokens are accepted."
  type        = string
}

variable "github_sub_prefix" {
  description = "Start of the repository's OIDC sub claim, without a trailing colon."
  type        = string
}

variable "github_environment" {
  description = "GitHub environment whose jobs may deploy."
  type        = string
}

variable "deployer_description" {
  description = "Description of the deployer service account."
  type        = string
}

variable "runtime_sa_name" {
  description = "Full resource name of the runtime identity the deployer attaches."
  type        = string
}
