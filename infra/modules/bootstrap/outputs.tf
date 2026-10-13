output "account_id" {
  value = local.account_id
}

output "state_bucket" {
  value = aws_s3_bucket.state.bucket
}

output "github_plan_role_arn" {
  value = var.create_plan_role ? aws_iam_role.github_plan[0].arn : null
}

output "github_deploy_role_arn" {
  value = aws_iam_role.github_deploy.arn
}
