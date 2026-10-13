output "state_bucket" {
  value = module.bootstrap.state_bucket
}

output "github_deploy_role_arn" {
  description = "GitHub variable AWS_STAGING_DEPLOY_ROLE_ARN."
  value       = module.bootstrap.github_deploy_role_arn
}
