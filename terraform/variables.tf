variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (prod, staging, etc.)"
  type        = string
  default     = "prod"
}

variable "domain_name" {
  description = "Primary domain (e.g., frivolous.biz)"
  type        = string
  default     = "frivolous.biz"
}

variable "subdomain_name" {
  description = "Subdomain for the app (e.g., alibi-arcade.frivolous.biz)"
  type        = string
  default     = "alibi-arcade"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"
}

variable "api_url" {
  description = "API URL for the client (e.g., https://alibi-arcade.frivolous.biz)"
  type        = string
}

variable "github_repo_url" {
  description = "GitHub repo URL for cloning (e.g., https://github.com/user/codegen-test.git)"
  type        = string
}

variable "github_branch" {
  description = "Git branch to deploy"
  type        = string
  default     = "main"
}

variable "ssh_public_key" {
  description = "SSH public key for EC2 access"
  type        = string
}
