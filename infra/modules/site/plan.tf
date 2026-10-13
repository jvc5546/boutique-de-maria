# CloudFront flat-rate Free plan: $0/month, no overage charges.
# Free subscriptions activate immediately (paid tiers would need a separate approval).
# Allowance: 100 GB + 1M requests/month, WAF (5 rules), DDoS protection, TLS.

resource "awscc_pricingplanmanager_subscription" "free" {
  plan_family = "CloudFront"
  plan_tier   = "FREE"
  resource_arns = [
    aws_cloudfront_distribution.site.arn,
    aws_wafv2_web_acl.site.arn,
  ]
}
