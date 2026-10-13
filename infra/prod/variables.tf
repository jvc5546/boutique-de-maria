variable "region" {
  description = "AWS region. us-east-1 is required for CloudFront certificates and CLOUDFRONT-scope WAF."
  type        = string
  default     = "us-east-1"
}

variable "account_id" {
  description = "The boutique-de-maria AWS account. The aws provider refuses to touch any other account."
  type        = string
  default     = "239280166667"
}

variable "domain" {
  description = "Apex domain (registered at Cloudflare, DNS at Cloudflare). www redirects to it."
  type        = string
  default     = "boutiquedemariamx.com"
}

variable "waf_rate_limit" {
  description = "Max requests per IP in a 5-minute window before WAF blocks that IP."
  type        = number
  default     = 1000
}

# --- Sign-in (M2). Set in GitHub: Settings -> Secrets and variables -> Actions.

variable "google_client_id" {
  description = "Google OAuth client ID (GitHub variable GOOGLE_CLIENT_ID). Not secret."
  type        = string
}

variable "google_client_secret" {
  description = "Google OAuth client secret (GitHub secret GOOGLE_CLIENT_SECRET)."
  type        = string
  sensitive   = true
}

variable "admins" {
  description = "Admin accounts, as email => display name (GitHub variable ADMINS, JSON)."
  type        = map(string)

  validation {
    condition     = length(var.admins) > 0 && alltrue([for e in keys(var.admins) : e == lower(trimspace(e)) && strcontains(e, "@")])
    error_message = "admins needs at least one entry, and every email must be lowercase with no spaces."
  }
}
