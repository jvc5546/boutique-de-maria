data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  # GitHub OIDC subject prefix with immutable IDs:
  # repo:jvc5546@41653402/boutique-de-maria@1414851640
  gh_subject   = "repo:${var.github_owner}@${var.github_owner_id}/${var.github_repo}@${var.github_repo_id}"
  state_bucket = "bdm-tfstate-${local.account_id}"

  # Names infra/prod uses for what it creates (all prefixed bdm-).
  table_arns   = "arn:aws:dynamodb:${var.region}:${local.account_id}:table/bdm-*"
  lambda_arns  = "arn:aws:lambda:${var.region}:${local.account_id}:function:bdm-*"
  log_arns     = "arn:aws:logs:${var.region}:${local.account_id}:log-group:/aws/lambda/bdm-*"
  role_arns    = "arn:aws:iam::${local.account_id}:role/bdm/*"
  boundary_arn = "arn:aws:iam::${local.account_id}:policy/bdm-workload-boundary"
}

# Refuse to run against the wrong account (for example your personal-site account).
resource "terraform_data" "account_guard" {
  lifecycle {
    precondition {
      condition     = local.account_id == var.expected_account_id
      error_message = "Wrong AWS account: the CLI profile points at a different account than expected_account_id. Use --profile boutique / AWS_PROFILE=boutique."
    }
  }
}

# ---------------------------------------------------------------------------
# Budget alerts (created first in spirit: cheap insurance against surprises)
# ---------------------------------------------------------------------------

resource "aws_budgets_budget" "monthly" {
  name         = "boutique-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # $1 when the limit is $5
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 20
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }

  depends_on = [terraform_data.account_guard]
}

# ---------------------------------------------------------------------------
# Terraform state bucket (S3 native locking, no DynamoDB lock table needed)
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "state" {
  bucket = local.state_bucket

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [terraform_data.account_guard]
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    id     = "expire-old-state-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

data "aws_iam_policy_document" "state_tls_only" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.state.arn,
      "${aws_s3_bucket.state.arn}/*",
    ]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = data.aws_iam_policy_document.state_tls_only.json

  depends_on = [aws_s3_bucket_public_access_block.state]
}

# ---------------------------------------------------------------------------
# GitHub Actions OIDC: no AWS keys stored in GitHub
# ---------------------------------------------------------------------------

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]

  depends_on = [terraform_data.account_guard]
}

# Plan role: pull requests only. Read-only on AWS, plus read/write on the state
# bucket (plan writes the lock file).
data "aws_iam_policy_document" "plan_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${local.gh_subject}:pull_request"]
    }
  }
}

resource "aws_iam_role" "github_plan" {
  name                 = "github-plan"
  description          = "GitHub Actions: terraform plan on pull requests (read-only)"
  assume_role_policy   = data.aws_iam_policy_document.plan_trust.json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "plan_readonly" {
  role       = aws_iam_role.github_plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

data "aws_iam_policy_document" "state_access" {
  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.state.arn]
  }
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.state.arn}/*"]
  }
}

resource "aws_iam_role_policy" "plan_state" {
  name   = "terraform-state"
  role   = aws_iam_role.github_plan.id
  policy = data.aws_iam_policy_document.state_access.json
}

# ReadOnlyAccess doesn't cover the newer Pricing Plan Manager service, which
# infra/prod reads to plan the CloudFront Free plan subscription.
data "aws_iam_policy_document" "plan_extra_read" {
  statement {
    actions = [
      "pricingplanmanager:Get*",
      "pricingplanmanager:List*",
    ]
    resources = ["*"]
  }

  # Cognito settings Terraform refreshes on every plan (MFA config, the
  # Google provider) that ReadOnlyAccess may not cover.
  statement {
    actions = [
      "cognito-idp:Describe*",
      "cognito-idp:Get*",
      "cognito-idp:List*",
    ]
    resources = ["*"]
  }

  # Terraform reads back the admin records it manages in the table.
  statement {
    actions   = ["dynamodb:GetItem"]
    resources = [local.table_arns]
  }
}

resource "aws_iam_role_policy" "plan_extra_read" {
  name   = "extra-read"
  role   = aws_iam_role.github_plan.id
  policy = data.aws_iam_policy_document.plan_extra_read.json
}

# Deploy role: only the main branch can assume it.
# Least privilege: read everything, write only what infra/prod and the deploy
# workflow manage. No IAM writes, so it can't grant itself more access.
# Each milestone that adds a service (Cognito, Lambda, DynamoDB...) widens it.
data "aws_iam_policy_document" "deploy_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${local.gh_subject}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name                 = "github-deploy"
  description          = "GitHub Actions: terraform apply and deploys from main"
  assume_role_policy   = data.aws_iam_policy_document.deploy_trust.json
  max_session_duration = 3600
}

# Read: terraform plan/refresh needs to see every resource it manages.
resource "aws_iam_role_policy_attachment" "deploy_readonly" {
  role       = aws_iam_role.github_deploy.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

# Terraform state: same access as the plan role.
resource "aws_iam_role_policy" "deploy_state" {
  name   = "terraform-state"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.state_access.json
}

# Write: only the services infra/prod uses.
data "aws_iam_policy_document" "deploy_prod" {
  # Site bucket(s): bucket settings and the `aws s3 sync` upload.
  statement {
    sid     = "SiteBuckets"
    actions = ["s3:*"]
    resources = [
      "arn:aws:s3:::bdm-site-*",
      "arn:aws:s3:::bdm-site-*/*",
    ]
  }

  # CloudFront: distribution, origin access control, function, cache invalidations.
  statement {
    sid       = "CloudFront"
    actions   = ["cloudfront:*"]
    resources = ["*"]
  }

  # WAF web ACL (CLOUDFRONT scope) and the TLS certificate.
  statement {
    sid       = "WafAndCertificates"
    actions   = ["wafv2:*", "acm:*"]
    resources = ["*"]
  }

  # CloudFront Free flat-rate plan, managed through the awscc provider,
  # which calls the Cloud Control API (IAM prefix: cloudformation).
  statement {
    sid = "FreePlan"
    actions = [
      "pricingplanmanager:*",
      "cloudformation:CreateResource",
      "cloudformation:GetResource",
      "cloudformation:UpdateResource",
      "cloudformation:DeleteResource",
      "cloudformation:ListResources",
      "cloudformation:GetResourceRequestStatus",
      "cloudformation:ListResourceRequests",
      "cloudformation:CancelResourceRequest",
    ]
    resources = ["*"]
  }

  # Some AWS services create their own service-linked role on first use.
  # Limited to AWS's reserved path, so it can't create ordinary roles.
  statement {
    sid       = "ServiceLinkedRoles"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["arn:aws:iam::*:role/aws-service-role/*"]
  }

  # --- M2: sign-in -------------------------------------------------------

  statement {
    sid       = "Cognito"
    actions   = ["cognito-idp:*"]
    resources = ["*"]
  }

  statement {
    sid       = "DynamoDB"
    actions   = ["dynamodb:*"]
    resources = [local.table_arns, "${local.table_arns}/*"]
  }

  statement {
    sid       = "Lambda"
    actions   = ["lambda:*"]
    resources = [local.lambda_arns]
  }

  statement {
    sid       = "LambdaLogs"
    actions   = ["logs:*"]
    resources = [local.log_arns, "${local.log_arns}:*"]
  }

  # --- M3: catalog API -------------------------------------------------

  # API Gateway's IAM actions are just HTTP verbs on paths (/apis, /apis/<id>/...).
  statement {
    sid       = "ApiGateway"
    actions   = ["apigateway:*"]
    resources = ["arn:aws:apigateway:${var.region}::/*"]
  }

  # Lambda execution roles. The deploy role can create or change a role only
  # under /bdm/ and only with the workload boundary attached, so no role it
  # makes can do more than the boundary allows, whatever policy it's given.
  statement {
    sid = "WorkloadRolesWithBoundary"
    actions = [
      "iam:CreateRole",
      "iam:PutRolePolicy",
      "iam:AttachRolePolicy",
    ]
    resources = [local.role_arns]
    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [local.boundary_arn]
    }
  }

  # Housekeeping on those roles (removing permissions is always safe).
  statement {
    sid = "WorkloadRolesManage"
    actions = [
      "iam:DeleteRole",
      "iam:DeleteRolePolicy",
      "iam:DetachRolePolicy",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:UpdateRole",
      "iam:UpdateRoleDescription",
      "iam:UpdateAssumeRolePolicy",
    ]
    resources = [local.role_arns]
  }

  # Hand those roles to Lambda, and only to Lambda.
  statement {
    sid       = "PassWorkloadRolesToLambda"
    actions   = ["iam:PassRole"]
    resources = [local.role_arns]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }
}

# The ceiling for every role infra/prod creates (Lambda execution roles).
# A role's real permissions are the overlap of its own policy and this one.
# Widen it here, locally, when a milestone needs a new service.
data "aws_iam_policy_document" "workload_boundary" {
  statement {
    sid = "AppData"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:BatchGetItem",
      "dynamodb:Query",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:BatchWriteItem",
      "dynamodb:ConditionCheckItem",
    ]
    resources = [local.table_arns, "${local.table_arns}/index/*"]
  }

  statement {
    sid       = "OwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${local.log_arns}:*"]
  }
}

resource "aws_iam_policy" "workload_boundary" {
  name        = "bdm-workload-boundary"
  description = "Permissions boundary for roles created by infra/prod (github-deploy)"
  policy      = data.aws_iam_policy_document.workload_boundary.json
}

resource "aws_iam_role_policy" "deploy_prod" {
  name   = "deploy-prod"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.deploy_prod.json
}
