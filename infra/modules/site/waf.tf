# Web firewall in front of CloudFront. The Free flat-rate plan includes WAF with
# up to 5 rules; this uses 4. No WAF logging (not available on the Free plan).

locals {
  managed_rule_groups = {
    # name in AWS                         => priority
    "AWSManagedRulesCommonRuleSet"          = 1 # common web attacks (OWASP-style)
    "AWSManagedRulesAmazonIpReputationList" = 2 # known malicious IPs
    "AWSManagedRulesKnownBadInputsRuleSet"  = 3 # exploit patterns (e.g. Log4j)
  }
}

resource "aws_wafv2_web_acl" "site" {
  name        = "boutique-site"
  description = "Boutique de Maria: CloudFront Free plan web ACL"
  scope       = "CLOUDFRONT" # must live in us-east-1

  default_action {
    allow {}
  }

  dynamic "rule" {
    for_each = local.managed_rule_groups
    content {
      name     = rule.key
      priority = rule.value

      override_action {
        none {} # use each rule group's own block/count actions
      }

      statement {
        managed_rule_group_statement {
          name        = rule.key
          vendor_name = "AWS"

          # SizeRestrictions_BODY blocks any body over 8 KB, which would block
          # product photo uploads (a few hundred KB). Count it instead. The
          # real caps are API Gateway (10 MB), Lambda (6 MB) and the API's own
          # 2 MB WebP/JPEG check. Every other rule in the group still blocks.
          dynamic "rule_action_override" {
            for_each = rule.key == "AWSManagedRulesCommonRuleSet" ? ["SizeRestrictions_BODY"] : []
            content {
              name = rule_action_override.value
              action_to_use {
                count {}
              }
            }
          }
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = rule.key
        sampled_requests_enabled   = true
      }
    }
  }

  rule {
    name     = "rate-limit-per-ip"
    priority = 10

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit                 = var.waf_rate_limit
        evaluation_window_sec = 300
        aggregate_key_type    = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "rate-limit-per-ip"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "boutique-site"
    sampled_requests_enabled   = true
  }
}
