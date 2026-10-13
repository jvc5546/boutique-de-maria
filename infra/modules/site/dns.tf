# DNS lives at Cloudflare (where the domain is registered).
# proxied = false: Cloudflare only answers DNS; traffic goes straight to CloudFront.

data "cloudflare_zone" "site" {
  filter = {
    name = var.zone
  }
}

# The site's own name. For the apex, Cloudflare allows a CNAME and "flattens"
# it into A/AAAA answers.
resource "cloudflare_dns_record" "site" {
  zone_id = data.cloudflare_zone.site.id
  name    = var.site_host
  type    = "CNAME"
  content = aws_cloudfront_distribution.site.domain_name
  ttl     = 1 # automatic
  proxied = false
  comment = "Site on CloudFront (Terraform: ${var.env})"
}

# Extra names (www) that the CloudFront function redirects to site_host.
resource "cloudflare_dns_record" "redirect" {
  for_each = toset(var.redirect_hosts)

  zone_id = data.cloudflare_zone.site.id
  name    = each.value
  type    = "CNAME"
  content = aws_cloudfront_distribution.site.domain_name
  ttl     = 1
  proxied = false
  comment = "Redirects to ${var.site_host} in the CloudFront function (Terraform: ${var.env})"
}
