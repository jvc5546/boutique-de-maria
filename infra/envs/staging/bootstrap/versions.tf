# Bootstrap for the staging account (boutique-de-maria-staging).
# Apply locally: AWS_PROFILE=boutique-staging terraform apply. See infra/modules/bootstrap/README.md.

terraform {
  required_version = ">= 1.10" # needed for S3 native state locking (use_lockfile)

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # First apply: keep this commented out (the bucket doesn't exist yet).
  # Then uncomment it and run `terraform init -migrate-state`.
  #
  backend "s3" {
    bucket       = "bdm-tfstate-788026358738"
    key          = "bootstrap/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = "us-east-1"

  default_tags {
    tags = {
      Project   = "boutique-de-maria"
      ManagedBy = "terraform"
      Stack     = "bootstrap-staging"
    }
  }
}
