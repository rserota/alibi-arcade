data "aws_route53_zone" "primary" {
  name = var.domain_name
}

resource "aws_route53_record" "server" {
  zone_id = data.aws_route53_zone.primary.zone_id
  name    = "${var.subdomain_name}.${var.domain_name}"
  type    = "A"
  ttl     = 300
  records = [aws_eip.server.public_ip]
}
