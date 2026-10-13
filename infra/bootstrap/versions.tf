# One-time bootstrap for the Boutique de María AWS account.
# Run locally with your SSO profile (see infra/bootstrap/README.md).
# Creates: Terraform state bucket, budget alerts, and the GitHub OIDC roles
# that let GitHub Actions deploy without stored AWS keys.

terraform {
  required_version = ">= 1.10" # needed for S3 native state locking (use_lockfile)

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Step 1: leave this commented out and run `terraform apply` with local state.
  # Step 2: uncomment, then run `terraform init -migrate-state`.

  backend "s3" {
    bucket       = "bdm-tfstate-239280166667"
    key          = "bootstrap/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "boutique-de-maria"
      ManagedBy = "terraform"
      Stack     = "bootstrap"
    }
  }
}
