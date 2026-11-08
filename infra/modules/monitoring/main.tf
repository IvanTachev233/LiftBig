# Email channel, uptime check and alert policies for one service.

resource "google_monitoring_notification_channel" "email" {
  project      = var.project_id
  display_name = var.channel_display_name
  type         = "email"
  labels = {
    email_address = var.alert_email
  }
}

resource "google_monitoring_uptime_check_config" "health" {
  project            = var.project_id
  display_name       = var.uptime.display_name
  timeout            = "10s"
  period             = "300s"
  checker_type       = "STATIC_IP_CHECKERS"
  log_check_failures = true

  http_check {
    path           = var.uptime.path
    port           = 443
    request_method = "GET"
    use_ssl        = true
    validate_ssl   = true

    accepted_response_status_codes {
      status_class = "STATUS_CLASS_2XX"
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      host       = var.uptime.host
      project_id = var.project_id
    }
  }
}

resource "google_monitoring_alert_policy" "uptime" {
  project               = var.project_id
  display_name          = var.uptime.alert_display_name
  combiner              = "OR"
  notification_channels = var.uptime.notify ? [google_monitoring_notification_channel.email.id] : []

  conditions {
    display_name = coalesce(var.uptime.condition_display_name, "Failure of uptime check_id ${google_monitoring_uptime_check_config.health.uptime_check_id}")

    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.label.check_id=\"${google_monitoring_uptime_check_config.health.uptime_check_id}\" AND resource.type=\"uptime_url\""
      comparison      = "COMPARISON_GT"
      duration        = "60s"
      threshold_value = 1

      aggregations {
        alignment_period     = "1200s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.*"]
      }

      trigger {
        count = 1
      }
    }
  }
}

resource "google_monitoring_alert_policy" "threshold" {
  for_each = var.threshold_alerts

  project               = var.project_id
  display_name          = each.value.display_name
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    notification_prompts = each.value.notification_prompts
  }

  conditions {
    display_name = each.value.condition_display_name

    condition_threshold {
      filter          = each.value.filter
      comparison      = "COMPARISON_GT"
      duration        = each.value.duration
      threshold_value = each.value.threshold

      aggregations {
        alignment_period   = each.value.alignment_period
        per_series_aligner = each.value.per_series_aligner
      }

      trigger {
        count = 1
      }
    }
  }
}

resource "google_monitoring_alert_policy" "log" {
  for_each = var.log_alerts

  project               = var.project_id
  display_name          = each.value.display_name
  combiner              = "OR"
  severity              = each.value.severity
  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close           = each.value.auto_close
    notification_prompts = ["OPENED"]

    notification_rate_limit {
      period = each.value.rate_limit_period
    }
  }

  conditions {
    display_name = each.value.condition_display_name

    condition_matched_log {
      filter = each.value.filter
    }
  }
}
