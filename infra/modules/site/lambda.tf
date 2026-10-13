# auth-gate: the Cognito trigger that enforces the invite list.
# Source: lambdas/auth-gate/src (Node.js, no dependencies to bundle).

locals {
  # Every role this stack creates lives under /bdm/ and must carry this
  # boundary (created in infra/bootstrap). The deploy role can't create
  # roles any other way, so nothing it makes can exceed the boundary.
  role_path     = "/bdm/"
  boundary_arn  = "arn:aws:iam::${var.account_id}:policy/bdm-workload-boundary"
  auth_gate     = "bdm-auth-gate"
  auth_gate_log = "/aws/lambda/${local.auth_gate}"
}

data "archive_file" "auth_gate" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambdas/auth-gate/src"
  output_path = "${path.module}/.build/auth-gate.zip"
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "auth_gate" {
  name                 = local.auth_gate
  path                 = local.role_path
  permissions_boundary = local.boundary_arn
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume.json
}

# Least privilege: read one user record, write its own logs.
data "aws_iam_policy_document" "auth_gate" {
  statement {
    actions   = ["dynamodb:GetItem"]
    resources = [aws_dynamodb_table.main.arn]
  }
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.auth_gate.arn}:*"]
  }
}

resource "aws_iam_role_policy" "auth_gate" {
  name   = "auth-gate"
  role   = aws_iam_role.auth_gate.id
  policy = data.aws_iam_policy_document.auth_gate.json
}

# Created by Terraform (not by Lambda on first run) so logs expire.
resource "aws_cloudwatch_log_group" "auth_gate" {
  name              = local.auth_gate_log
  retention_in_days = 30
}

resource "aws_lambda_function" "auth_gate" {
  function_name    = local.auth_gate
  description      = "Cognito trigger: only invited, active users can sign in"
  role             = aws_iam_role.auth_gate.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"] # Graviton: about 20% cheaper per ms
  handler          = "index.handler"
  filename         = data.archive_file.auth_gate.output_path
  source_code_hash = data.archive_file.auth_gate.output_base64sha256
  memory_size      = 256
  timeout          = 5 # Cognito waits at most 5 seconds for a trigger

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.main.name
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.auth_gate.name
  }

  depends_on = [aws_iam_role_policy.auth_gate]
}

# Allow this user pool (and only it) to call the function.
resource "aws_lambda_permission" "cognito_auth_gate" {
  statement_id  = "AllowCognito"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.auth_gate.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}
