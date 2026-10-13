# Free TLS certificate from AWS Certificate Manager, validated through Cloudflare DNS.
# CloudFront only accepts certificates from us-east-1.

resource "aws_acm_certificate" "site" {
  domain_name               = var.site_host
  subject_alternative_names = var.redirect_hosts
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# ACM asks us to prove we own the domain by publishing one CNAME per name.
resource "cloudflare_dns_record" "cert_validation" {
  for_each = {
    for o in aws_acm_certificate.site.domain_validation_options : o.domain_name => o
  }

  zone_id = data.cloudflare_zone.site.id
  name    = trimsuffix(each.value.resource_record_name, ".")
  type    = each.value.resource_record_type
  content = trimsuffix(each.value.resource_record_value, ".")
  ttl     = 60
  proxied = false
  comment = "ACM validation (Terraform: ${var.env})"
}

# Waits (usually 1-5 minutes) until ACM sees the records and issues the certificate.
resource "aws_acm_certificate_validation" "site" {
  certificate_arn = aws_acm_certificate.site.arn
  validation_record_fqdns = [
    for o in aws_acm_certificate.site.domain_validation_options : trimsuffix(o.resource_record_name, ".")
  ]

  depends_on = [cloudflare_dns_record.cert_validation]
}
