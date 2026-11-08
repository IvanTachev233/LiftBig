variable "project_id" {
  description = "Google Cloud project."
  type        = string
}

variable "channel_display_name" {
  description = "Display name of the email notification channel."
  type        = string
}

variable "alert_email" {
  description = "Address alerts go to. Kept out of the public repo; set TF_VAR_alert_email."
  type        = string
  sensitive   = true
}

variable "uptime" {
  description = "Uptime check of the service and the alert on its failure."
  type = object({
    display_name           = string
    host                   = string
    path                   = optional(string, "/health")
    alert_display_name     = string
    condition_display_name = optional(string)
    notify                 = bool
  })
}

variable "threshold_alerts" {
  description = "Metric threshold alerts, by a stable key."
  type = map(object({
    display_name           = string
    condition_display_name = string
    filter                 = string
    per_series_aligner     = string
    alignment_period       = optional(string, "300s")
    duration               = optional(string, "0s")
    threshold              = number
    notification_prompts   = optional(list(string), ["OPENED"])
  }))
  default = {}
}

variable "log_alerts" {
  description = "Log match alerts, by a stable key."
  type = map(object({
    display_name           = string
    condition_display_name = string
    filter                 = string
    severity               = string
    rate_limit_period      = string
    auto_close             = string
  }))
  default = {}
}
