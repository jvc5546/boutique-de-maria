module "bootstrap" {
  source = "../../../modules/bootstrap"

  env                 = "staging"
  expected_account_id = "788026358738"
  alert_email         = var.alert_email

  github_owner    = "jvc5546"
  github_owner_id = 41653402
  github_repo     = "boutique-de-maria"
  github_repo_id  = 1416282413

  # Any pull request deploys here, so this account holds nothing but staging.
  deploy_environment = "staging"
}
