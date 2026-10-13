module "site" {
  source = "../../../modules/site"

  env            = "prod"
  account_id     = var.account_id
  region         = var.region
  zone           = "boutiquedemariamx.com"
  site_host      = "boutiquedemariamx.com"
  redirect_hosts = ["www.boutiquedemariamx.com"]
  auth_host      = "auth.boutiquedemariamx.com"

  google_client_id     = var.google_client_id
  google_client_secret = var.google_client_secret
  admins               = var.admins
}
