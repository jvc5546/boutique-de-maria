variable "env" {
  description = "Environment name: prod or staging."
  type        = string
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "expected_account_id" {
  description = "Apply fails if your CLI profile points at any other account."
  type        = string
}

variable "github_owner" {
  type = string
}

variable "github_repo" {
  type = string
}

# GitHub repos created after July 15, 2026 put immutable numeric IDs in the OIDC
# token's subject: repo:OWNER@OWNER_ID/REPO@REPO_ID:...
# Look them up with: gh api repos/OWNER/REPO --jq '.owner.id, .id'
variable "github_owner_id" {
  type = number
}

variable "github_repo_id" {
  type = number
}

variable "deploy_environment" {
  description = "GitHub environment whose jobs may assume github-deploy (production or staging)."
  type        = string
}

variable "create_plan_role" {
  description = "Create github-plan (read-only, pull requests) for previewing changes. Prod only."
  type        = bool
  default     = false
}

variable "alert_email" {
  description = "Where budget alerts go."
  type        = string
}

variable "monthly_budget_usd" {
  description = "Monthly budget. Alerts fire at 20% actual, 100% actual and 100% forecast."
  type        = number
  default     = 5
}
