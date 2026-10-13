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
  source_dir  = "${path.module}/../../lambdas/api/src"
  output_path = "${path.module}/.build/api.zip"
}

resource "aws_iam_role" "api" {
  name                 = local.api_name
  path                 = local.role_path
  permissions_boundary = local.boundary_arn
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume.json
}

# Read-only for now: look up the caller, list products. M4 adds writes.
data "aws_iam_policy_document" "api" {
  statement {
    actions   = ["dynamodb:GetItem", "dynamodb:Query"]
    resources = [aws_dynamodb_table.main.arn]
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
      TABLE_NAME = aws_dynamodb_table.main.name
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
  description   = "Boutique de Maria API, served at https://${var.domain}/api/ through CloudFront"
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

  # A family-sized ceiling: plenty for real use, and it caps any abuse.
  default_route_settings {
    throttling_burst_limit = 50
    throttling_rate_limit  = 20
  }
}

resource "aws_lambda_permission" "apigw_api" {
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}
