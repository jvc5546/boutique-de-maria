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

# One-time refactor (October 2026): these resources used to live directly in
# infra/bootstrap. Terraform renames them in the state instead of recreating
# them. Safe to delete once that apply has run.

moved {
  from = terraform_data.account_guard
  to   = module.bootstrap.terraform_data.account_guard
}

moved {
  from = aws_budgets_budget.monthly
  to   = module.bootstrap.aws_budgets_budget.monthly
}

moved {
  from = aws_s3_bucket.state
  to   = module.bootstrap.aws_s3_bucket.state
}

moved {
  from = aws_s3_bucket_versioning.state
  to   = module.bootstrap.aws_s3_bucket_versioning.state
}

moved {
  from = aws_s3_bucket_server_side_encryption_configuration.state
  to   = module.bootstrap.aws_s3_bucket_server_side_encryption_configuration.state
}

moved {
  from = aws_s3_bucket_public_access_block.state
  to   = module.bootstrap.aws_s3_bucket_public_access_block.state
}

moved {
  from = aws_s3_bucket_ownership_controls.state
  to   = module.bootstrap.aws_s3_bucket_ownership_controls.state
}

moved {
  from = aws_s3_bucket_lifecycle_configuration.state
  to   = module.bootstrap.aws_s3_bucket_lifecycle_configuration.state
}

moved {
  from = aws_s3_bucket_policy.state
  to   = module.bootstrap.aws_s3_bucket_policy.state
}

moved {
  from = aws_iam_openid_connect_provider.github
  to   = module.bootstrap.aws_iam_openid_connect_provider.github
}

moved {
  from = aws_iam_role.github_plan
  to   = module.bootstrap.aws_iam_role.github_plan[0]
}

moved {
  from = aws_iam_role_policy_attachment.plan_readonly
  to   = module.bootstrap.aws_iam_role_policy_attachment.plan_readonly[0]
}

moved {
  from = aws_iam_role_policy.plan_state
  to   = module.bootstrap.aws_iam_role_policy.plan_state[0]
}

moved {
  from = aws_iam_role_policy.plan_extra_read
  to   = module.bootstrap.aws_iam_role_policy.plan_extra_read[0]
}

moved {
  from = aws_iam_role.github_deploy
  to   = module.bootstrap.aws_iam_role.github_deploy
}

moved {
  from = aws_iam_role_policy_attachment.deploy_readonly
  to   = module.bootstrap.aws_iam_role_policy_attachment.deploy_readonly
}

moved {
  from = aws_iam_role_policy.deploy_state
  to   = module.bootstrap.aws_iam_role_policy.deploy_state
}

moved {
  from = aws_iam_policy.workload_boundary
  to   = module.bootstrap.aws_iam_policy.workload_boundary
}

moved {
  from = aws_iam_role_policy.deploy_prod
  to   = module.bootstrap.aws_iam_role_policy.deploy_prod
}
