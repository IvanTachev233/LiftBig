terraform {
  required_version = "1.13.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.10"
    }
  }

  backend "gcs" {
    bucket = "liftbigapi-tfstate"
    prefix = "envs/production"
  }
}

provider "google" {
  project               = "liftbigapi"
  region                = "europe-west1"
  user_project_override = true
  billing_project       = "liftbigapi"
}
