module "bootstrap" {
  source = "../../../modules/bootstrap"

  env                 = "prod"
  expected_account_id = "239280166667"
  alert_email         = var.alert_email

  github_owner    = "jvc5546"
  github_owner_id = 41653402
  github_repo     = "boutique-de-maria"
  github_repo_id  = 1416282413

  deploy_environment = "production"
  create_plan_role   = true
}
