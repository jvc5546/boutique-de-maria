# The whole site for one environment: hosting, sign-in, API and data.
# Called from infra/envs/<env>/site, which sets the backend and providers.

terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
    awscc = {
      source = "hashicorp/awscc"
    }
    cloudflare = {
      source = "cloudflare/cloudflare"
    }
    archive = {
      source = "hashicorp/archive"
    }
  }
}
