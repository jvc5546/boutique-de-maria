# Staging: staging.boutiquedemariamx.com, in its own AWS account.
# Deployed by GitHub Actions on every pull request (GitHub environment "staging").

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    # Cloud Control provider: used only for the CloudFront flat-rate (Free) plan
    # subscription, which the main aws provider doesn't support yet.
    awscc = {
      source  = "hashicorp/awscc"
      version = "~> 1.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    # Zips the Lambda source folders.
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }

  backend "s3" {
    bucket       = "bdm-tfstate-788026358738"
    key          = "staging/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = var.region

  # Built-in account guard: refuses to run against any other AWS account.
  allowed_account_ids = [var.account_id]

  default_tags {
    tags = {
      Project   = "boutique-de-maria"
      ManagedBy = "terraform"
      Stack     = "staging"
    }
  }
}

provider "awscc" {
  region = var.region
}

# Reads the API token from the CLOUDFLARE_API_TOKEN environment variable.
provider "cloudflare" {}
