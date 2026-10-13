# Account bootstrap: state bucket, budget alerts, GitHub OIDC roles and the
# workload permissions boundary. Called from infra/envs/<env>/bootstrap and
# always applied locally with your SSO admin login, never from GitHub.

terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}
