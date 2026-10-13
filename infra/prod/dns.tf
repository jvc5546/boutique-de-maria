# DNS lives at Cloudflare (where the domain is registered).
# proxied = false: Cloudflare only answers DNS; traffic goes straight to CloudFront.

data "cloudflare_zone" "site" {
  filter = {
    name = var.domain
  }
}

# Cloudflare allows a CNAME at the apex and "flattens" it into A/AAAA answers.
resource "cloudflare_dns_record" "apex" {
  zone_id = data.cloudflare_zone.site.id
  name    = var.domain
  type    = "CNAME"
  content = aws_cloudfront_distribution.site.domain_name
  ttl     = 1 # automatic
  proxied = false
  comment = "Site on CloudFront (Terraform: infra/prod)"
}

resource "cloudflare_dns_record" "www" {
  zone_id = data.cloudflare_zone.site.id
  name    = "www.${var.domain}"
  type    = "CNAME"
  content = aws_cloudfront_distribution.site.domain_name
  ttl     = 1
  proxied = false
  comment = "Redirects to the apex in the CloudFront function (Terraform: infra/prod)"
}
