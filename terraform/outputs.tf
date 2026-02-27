output "instance_id" {
  value = aws_instance.server.id
}

output "public_ip" {
  value = aws_eip.server.public_ip
}

output "api_url" {
  value = "https://${aws_route53_record.server.name}"
}

output "ssh_command" {
  value = "ssh -i /path/to/key.pem ubuntu@${aws_eip.server.public_ip}"
}
