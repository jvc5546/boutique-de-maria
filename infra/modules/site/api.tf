# The site's API: API Gateway (HTTP API) -> bdm-api Lambda.
#
# The browser calls https://<domain>/api/..., same origin as the site.
# CloudFront forwards /api/* here (cdn.tf), so the WAF covers the API too and
# no CORS is needed. API Gateway checks the Cognito ID token before the Lambda
# runs, and rejects missing, expired or forged tokens with 401.

locals {
  api_name = "bdm-api"
  api_log  = "/aws/lambda/${local.api_name}"
}

# --- Lambda --------------------------------------------------------------

data "archive_file" "api" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambdas/api/src"
  output_path = "${path.module}/.build/api.zip"
}

resource "aws_iam_role" "api" {
  name                 = local.api_name
  path                 = local.role_path
  permissions_boundary = local.boundary_arn
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume.json
}

# Read and write the table (admin page), and store product photos under
# media/ in the site bucket. Nothing else.
data "aws_iam_policy_document" "api" {
  statement {
    actions   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem"]
    resources = [aws_dynamodb_table.main.arn, "${aws_dynamodb_table.main.arn}/index/*"]
  }
  statement {
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.site.arn}/media/*"]
  }
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.api.arn}:*"]
  }
}

resource "aws_iam_role_policy" "api" {
  name   = "api"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

resource "aws_cloudwatch_log_group" "api" {
  name              = local.api_log
  retention_in_days = 30
}

resource "aws_lambda_function" "api" {
  function_name    = local.api_name
  description      = "Site API (/api/*)"
  role             = aws_iam_role.api.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  memory_size      = 256
  timeout          = 10

  environment {
    variables = {
      TABLE_NAME  = aws_dynamodb_table.main.name
      SITE_BUCKET = aws_s3_bucket.site.bucket
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.api.name
  }

  depends_on = [aws_iam_role_policy.api]
}

# --- API Gateway ---------------------------------------------------------

resource "aws_apigatewayv2_api" "main" {
  name          = "bdm-api"
  protocol_type = "HTTP"
  description   = "Boutique de Maria API, served at https://${var.site_host}/api/ through CloudFront"
}

# Only tokens issued by our user pool, for our web client, get through.
resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.main.id
  name             = "cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    issuer   = "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
    audience = [aws_cognito_user_pool_client.web.id]
  }
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

# One route per endpoint, all behind the authorizer. New endpoints: add to this set.
resource "aws_apigatewayv2_route" "api" {
  for_each = toset([
    "GET /api/catalog",
    # Admin page. The Lambda checks the caller is an admin on every call.
    "GET /api/admin/products",
    "POST /api/admin/products",
    "PUT /api/admin/products/{id}",
    "POST /api/admin/products/{id}/photo",
    "GET /api/admin/users",
    "PUT /api/admin/users/{email}",
    "GET /api/admin/settings",
    "PUT /api/admin/settings",
  ])

  api_id             = aws_apigatewayv2_api.main.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  # A family-sized ceiling: plenty for real use, and it caps the bill if
  # someone floods the API (including its direct execute-api address, which
  # skips CloudFront and the WAF).
  default_route_settings {
    throttling_burst_limit = var.api_burst_limit
    throttling_rate_limit  = var.api_rate_limit
  }
}

resource "aws_lambda_permission" "apigw_api" {
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}
