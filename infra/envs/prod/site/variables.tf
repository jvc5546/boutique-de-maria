variable "region" {
  type    = string
  default = "us-east-1"
}

variable "account_id" {
  description = "The boutique-de-maria (production) AWS account. The aws provider refuses any other."
  type        = string
  default     = "239280166667"
}

# Set in GitHub (Settings -> Secrets and variables -> Actions) and passed as TF_VAR_*.

variable "google_client_id" {
  type = string
}

variable "google_client_secret" {
  type      = string
  sensitive = true
}

variable "admins" {
  description = "Admin accounts, as email => display name (GitHub variable ADMINS, JSON)."
  type        = map(string)
}
