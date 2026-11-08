terraform {
  required_version = "1.13.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.10"
    }
  }

  backend "gcs" {
    bucket = "liftbig-staging-tfstate"
    prefix = "envs/staging"
  }
}

provider "google" {
  project               = "liftbig-staging"
  region                = "europe-west1"
  user_project_override = true
  billing_project       = "liftbig-staging"
}
