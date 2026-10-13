variable "env" {
  description = "Environment name: prod or staging. Shows up in names, comments and tags."
  type        = string
}

variable "account_id" {
  description = "AWS account this environment lives in."
  type        = string
}

variable "region" {
  description = "AWS region. us-east-1 is required for CloudFront certificates and CLOUDFRONT-scope WAF."
  type        = string
  default     = "us-east-1"
}

variable "zone" {
  description = "Cloudflare DNS zone (the registered domain)."
  type        = string
}

variable "site_host" {
  description = "Hostname the site is served on, e.g. boutiquedemariamx.com or staging.boutiquedemariamx.com."
  type        = string
}

variable "redirect_hosts" {
  description = "Extra hostnames that redirect to site_host (www)."
  type        = list(string)
  default     = []
}

variable "auth_host" {
  description = "Hostname for the Cognito sign-in pages. Its parent must have an A record, so it sits right under the zone."
  type        = string
}

variable "dev_origins" {
  description = "Extra origins allowed to sign in, for local development. Keep empty in prod."
  type        = list(string)
  default     = []
}

variable "google_client_id" {
  description = "Google OAuth client ID."
  type        = string
}

variable "google_client_secret" {
  description = "Google OAuth client secret."
  type        = string
  sensitive   = true
}

variable "admins" {
  description = "Admin accounts, as email => display name."
  type        = map(string)

  validation {
    condition     = length(var.admins) > 0 && alltrue([for e in keys(var.admins) : e == lower(trimspace(e)) && strcontains(e, "@")])
    error_message = "admins needs at least one entry, and every email must be lowercase with no spaces."
  }
}

variable "waf_rate_limit" {
  description = "Max requests per IP in a 5-minute window before WAF blocks that IP."
  type        = number
  default     = 1000
}

variable "api_rate_limit" {
  description = "API Gateway: steady requests per second across everyone."
  type        = number
  default     = 5
}

variable "api_burst_limit" {
  description = "API Gateway: short bursts allowed above api_rate_limit."
  type        = number
  default     = 10
}
