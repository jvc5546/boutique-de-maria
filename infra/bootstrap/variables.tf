variable "region" {
  description = "Main AWS region. us-east-1 is required for CloudFront certificates, so everything lives there."
  type        = string
  default     = "us-east-1"
}

variable "expected_account_id" {
  description = "The boutique-de-maria account ID. Apply fails if your CLI profile points at any other account."
  type        = string
  default     = "239280166667"
}

variable "github_owner" {
  description = "GitHub user or organization that owns the repo."
  type        = string
  default     = "jvc5546"
}

variable "github_repo" {
  description = "Repository name."
  type        = string
  default     = "boutique-de-maria"
}

# GitHub repos created after July 15, 2026 put immutable numeric IDs in the OIDC
# token's subject: repo:OWNER@OWNER_ID/REPO@REPO_ID:...
# Look them up with: gh api repos/OWNER/REPO --jq '.owner.id, .id'
variable "github_owner_id" {
  description = "Numeric ID of the GitHub owner (immutable)."
  type        = number
  default     = 41653402
}

variable "github_repo_id" {
  description = "Numeric ID of the GitHub repository (immutable)."
  type        = number
  default     = 1414851640
}

variable "alert_email" {
  description = "Where budget alerts go. Set it in terraform.tfvars (git-ignored)."
  type        = string
}

variable "monthly_budget_usd" {
  description = "Monthly budget. Alerts fire at $1 actual (20%), 100% actual and 100% forecast."
  type        = number
  default     = 5
}
