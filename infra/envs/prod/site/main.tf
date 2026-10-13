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

# ---------------------------------------------------------------------------
# One-time refactor (October 2026): these resources used to live directly in
# infra/prod. The moved blocks tell Terraform they're the same objects, now
# inside module.site, so it renames them in the state instead of destroying
# and recreating them. Safe to delete once that apply has run.
# ---------------------------------------------------------------------------

moved {
  from = aws_iam_role.api
  to   = module.site.aws_iam_role.api
}

moved {
  from = aws_iam_role_policy.api
  to   = module.site.aws_iam_role_policy.api
}

moved {
  from = aws_cloudwatch_log_group.api
  to   = module.site.aws_cloudwatch_log_group.api
}

moved {
  from = aws_lambda_function.api
  to   = module.site.aws_lambda_function.api
}

moved {
  from = aws_apigatewayv2_api.main
  to   = module.site.aws_apigatewayv2_api.main
}

moved {
  from = aws_apigatewayv2_authorizer.cognito
  to   = module.site.aws_apigatewayv2_authorizer.cognito
}

moved {
  from = aws_apigatewayv2_integration.api
  to   = module.site.aws_apigatewayv2_integration.api
}

moved {
  from = aws_apigatewayv2_route.api
  to   = module.site.aws_apigatewayv2_route.api
}

moved {
  from = aws_apigatewayv2_stage.default
  to   = module.site.aws_apigatewayv2_stage.default
}

moved {
  from = aws_lambda_permission.apigw_api
  to   = module.site.aws_lambda_permission.apigw_api
}

moved {
  from = aws_cognito_user_pool.main
  to   = module.site.aws_cognito_user_pool.main
}

moved {
  from = aws_cognito_identity_provider.google
  to   = module.site.aws_cognito_identity_provider.google
}

moved {
  from = aws_cognito_user_pool_client.web
  to   = module.site.aws_cognito_user_pool_client.web
}

moved {
  from = aws_acm_certificate.auth
  to   = module.site.aws_acm_certificate.auth
}

moved {
  from = cloudflare_dns_record.auth_cert_validation
  to   = module.site.cloudflare_dns_record.auth_cert_validation
}

moved {
  from = aws_acm_certificate_validation.auth
  to   = module.site.aws_acm_certificate_validation.auth
}

moved {
  from = aws_cognito_user_pool_domain.auth
  to   = module.site.aws_cognito_user_pool_domain.auth
}

moved {
  from = cloudflare_dns_record.auth
  to   = module.site.cloudflare_dns_record.auth
}

moved {
  from = aws_s3_bucket.site
  to   = module.site.aws_s3_bucket.site
}

moved {
  from = aws_s3_bucket_public_access_block.site
  to   = module.site.aws_s3_bucket_public_access_block.site
}

moved {
  from = aws_s3_bucket_ownership_controls.site
  to   = module.site.aws_s3_bucket_ownership_controls.site
}

moved {
  from = aws_s3_bucket_server_side_encryption_configuration.site
  to   = module.site.aws_s3_bucket_server_side_encryption_configuration.site
}

moved {
  from = aws_s3_bucket_policy.site
  to   = module.site.aws_s3_bucket_policy.site
}

moved {
  from = aws_cloudfront_origin_access_control.site
  to   = module.site.aws_cloudfront_origin_access_control.site
}

moved {
  from = aws_cloudfront_function.router
  to   = module.site.aws_cloudfront_function.router
}

moved {
  from = aws_cloudfront_distribution.site
  to   = module.site.aws_cloudfront_distribution.site
}

moved {
  from = aws_acm_certificate.site
  to   = module.site.aws_acm_certificate.site
}

moved {
  from = cloudflare_dns_record.cert_validation
  to   = module.site.cloudflare_dns_record.cert_validation
}

moved {
  from = aws_acm_certificate_validation.site
  to   = module.site.aws_acm_certificate_validation.site
}

moved {
  from = aws_dynamodb_table.main
  to   = module.site.aws_dynamodb_table.main
}

moved {
  from = aws_dynamodb_table_item.admin
  to   = module.site.aws_dynamodb_table_item.admin
}

moved {
  from = cloudflare_dns_record.apex
  to   = module.site.cloudflare_dns_record.site
}

moved {
  from = cloudflare_dns_record.www
  to   = module.site.cloudflare_dns_record.redirect["www.boutiquedemariamx.com"]
}

moved {
  from = aws_iam_role.auth_gate
  to   = module.site.aws_iam_role.auth_gate
}

moved {
  from = aws_iam_role_policy.auth_gate
  to   = module.site.aws_iam_role_policy.auth_gate
}

moved {
  from = aws_cloudwatch_log_group.auth_gate
  to   = module.site.aws_cloudwatch_log_group.auth_gate
}

moved {
  from = aws_lambda_function.auth_gate
  to   = module.site.aws_lambda_function.auth_gate
}

moved {
  from = aws_lambda_permission.cognito_auth_gate
  to   = module.site.aws_lambda_permission.cognito_auth_gate
}

moved {
  from = awscc_pricingplanmanager_subscription.free
  to   = module.site.awscc_pricingplanmanager_subscription.free
}

moved {
  from = aws_wafv2_web_acl.site
  to   = module.site.aws_wafv2_web_acl.site
}
