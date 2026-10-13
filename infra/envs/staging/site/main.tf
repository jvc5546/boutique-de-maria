module "site" {
  source = "../../../modules/site"

  env        = "staging"
  account_id = var.account_id
  region     = var.region
  zone       = "boutiquedemariamx.com"
  site_host  = "staging.boutiquedemariamx.com"
  auth_host  = "auth-staging.boutiquedemariamx.com" # not auth.staging.*: its parent needs an A record

  # npm run dev signs in against staging, never production.
  dev_origins = ["http://localhost:4321"]

  google_client_id     = var.google_client_id
  google_client_secret = var.google_client_secret
  admins               = var.admins
}
