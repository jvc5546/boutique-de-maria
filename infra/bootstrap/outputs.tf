output "account_id" {
  value = local.account_id
}

output "state_bucket" {
  description = "Put this in the backend block, then run terraform init -migrate-state."
  value       = aws_s3_bucket.state.bucket
}

output "github_plan_role_arn" {
  description = "GitHub repo variable AWS_PLAN_ROLE_ARN."
  value       = aws_iam_role.github_plan.arn
}

output "github_deploy_role_arn" {
  description = "GitHub repo variable AWS_DEPLOY_ROLE_ARN."
  value       = aws_iam_role.github_deploy.arn
}
