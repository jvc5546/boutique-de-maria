# Sign-in: Cognito user pool (Lite plan) with Google as the only way in.
#
# Flow: site -> auth.<domain>/oauth2/authorize?identity_provider=Google
#       -> Google -> auth.<domain>/oauth2/idpresponse
#       -> auth-gate Lambda (invite list) -> site /auth/callback with a code
#       -> site swaps the code for tokens (PKCE, no client secret in the browser).

resource "aws_cognito_user_pool" "main" {
  name                = "bdm-users"
  user_pool_tier      = "LITE" # 10,000 monthly active users free
  deletion_protection = "ACTIVE"

  username_configuration {
    case_sensitive = false
  }

  # Nobody has a password here, so there's nothing to recover by email or SMS.
  account_recovery_setting {
    recovery_mechanism {
      name     = "admin_only"
      priority = 1
    }
  }

  # Self sign-up stays technically on, because turning it off may also
  # block first-time Google sign-ins. auth-gate refuses every sign-up
  # that isn't a Google sign-in by an invited email, so it's closed in practice.
  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  lambda_config {
    pre_sign_up = aws_lambda_function.auth_gate.arn

    pre_token_generation_config {
      lambda_arn     = aws_lambda_function.auth_gate.arn
      lambda_version = "V1_0" # ID-token claims; the version included in Lite
    }
  }
}

# Google as the identity provider. AWS fills in Google's endpoints itself;
# they're listed so Terraform doesn't see a change on every plan.
resource "aws_cognito_identity_provider" "google" {
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id                     = var.google_client_id
    client_secret                 = var.google_client_secret
    authorize_scopes              = "openid email profile"
    attributes_url                = "https://people.googleapis.com/v1/people/me?personFields="
    attributes_url_add_attributes = "true"
    authorize_url                 = "https://accounts.google.com/o/oauth2/v2/auth"
    oidc_issuer                   = "https://accounts.google.com"
    token_request_method          = "POST"
    token_url                     = "https://www.googleapis.com/oauth2/v4/token"
  }

  attribute_mapping = {
    username       = "sub"
    email          = "email"
    email_verified = "email_verified"
    name           = "name"
    given_name     = "given_name"
    picture        = "picture"
  }
}

# The website's "app client". Public (no secret): it runs in the browser and
# uses PKCE instead.
resource "aws_cognito_user_pool_client" "web" {
  name         = "web"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret                      = false
  supported_identity_providers         = [aws_cognito_identity_provider.google.provider_name]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  explicit_auth_flows                  = ["ALLOW_REFRESH_TOKEN_AUTH"]

  callback_urls = [
    "https://${var.domain}/auth/callback",
    "http://localhost:4321/auth/callback", # npm run dev
  ]
  logout_urls = [
    "https://${var.domain}/",
    "http://localhost:4321/",
  ]

  # Short-lived tokens, refreshed quietly for 30 days. Each refresh runs
  # auth-gate again, so a removed distributor is out within the hour.
  id_token_validity      = 60
  access_token_validity  = 60
  refresh_token_validity = 30
  token_validity_units {
    id_token      = "minutes"
    access_token  = "minutes"
    refresh_token = "days"
  }

  enable_token_revocation       = true
  prevent_user_existence_errors = "ENABLED"
}

# --- auth.<domain>: the sign-in pages under our own name -----------------
# Google's consent screen then says "auth.boutiquedemariamx.com" instead of
# an amazoncognito.com address. Free: ACM certificate plus one DNS record.

resource "aws_acm_certificate" "auth" {
  domain_name       = "auth.${var.domain}"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "cloudflare_dns_record" "auth_cert_validation" {
  for_each = {
    for o in aws_acm_certificate.auth.domain_validation_options : o.domain_name => o
  }

  zone_id = data.cloudflare_zone.site.id
  name    = trimsuffix(each.value.resource_record_name, ".")
  type    = each.value.resource_record_type
  content = trimsuffix(each.value.resource_record_value, ".")
  ttl     = 60
  proxied = false
  comment = "ACM validation for auth (Terraform: infra/prod)"
}

resource "aws_acm_certificate_validation" "auth" {
  certificate_arn = aws_acm_certificate.auth.arn
  validation_record_fqdns = [
    for o in aws_acm_certificate.auth.domain_validation_options : trimsuffix(o.resource_record_name, ".")
  ]

  depends_on = [cloudflare_dns_record.auth_cert_validation]
}

resource "aws_cognito_user_pool_domain" "auth" {
  domain                = "auth.${var.domain}"
  user_pool_id          = aws_cognito_user_pool.main.id
  certificate_arn       = aws_acm_certificate_validation.auth.certificate_arn
  managed_login_version = 1 # classic hosted UI (Lite). We skip it anyway: straight to Google.
}

# Cognito serves auth.<domain> from its own CloudFront distribution.
resource "cloudflare_dns_record" "auth" {
  zone_id = data.cloudflare_zone.site.id
  name    = "auth.${var.domain}"
  type    = "CNAME"
  content = aws_cognito_user_pool_domain.auth.cloudfront_distribution
  ttl     = 1
  proxied = false
  comment = "Cognito sign-in domain (Terraform: infra/prod)"
}
