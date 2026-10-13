output "site_url" {
  value = "https://${var.domain}"
}

output "site_bucket" {
  description = "Where the deploy workflow uploads web/dist."
  value       = aws_s3_bucket.site.bucket
}

output "distribution_id" {
  description = "Used by the deploy workflow to invalidate the cache."
  value       = aws_cloudfront_distribution.site.id
}

output "distribution_domain" {
  value = aws_cloudfront_distribution.site.domain_name
}

output "free_plan_status" {
  value = awscc_pricingplanmanager_subscription.free.status
}

output "auth_domain" {
  description = "Sign-in domain (Cognito)."
  value       = aws_cognito_user_pool_domain.auth.domain
}

output "auth_client_id" {
  description = "Cognito app client ID, baked into the site build as PUBLIC_AUTH_CLIENT_ID. Not secret."
  value       = aws_cognito_user_pool_client.web.id
}

output "user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "table_name" {
  value = aws_dynamodb_table.main.name
}

output "api_endpoint" {
  description = "API Gateway's own URL. Use https://<domain>/api/ instead; this one is for debugging."
  value       = aws_apigatewayv2_api.main.api_endpoint
}
