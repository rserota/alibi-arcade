data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_security_group" "server" {
  name        = "alibi-arcade-server"
  description = "Security group for Alibi Arcade server"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # WARNING: Restrict this to your IP for production
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_key_pair" "deployer" {
  key_name   = "alibi-arcade-deployer"
  public_key = var.ssh_public_key

  lifecycle {
    ignore_changes = [public_key]
  }
}

resource "aws_eip" "server" {
  domain = "vpc"

  tags = {
    Name = "alibi-arcade-eip"
  }

  depends_on = [aws_instance.server]
}

resource "aws_eip_association" "server" {
  instance_id      = aws_instance.server.id
  allocation_id    = aws_eip.server.id
}

locals {
  user_data_script = base64encode(templatefile("${path.module}/user_data.sh", {
    GITHUB_REPO_URL = var.github_repo_url
    GITHUB_BRANCH   = var.github_branch
    API_URL         = var.api_url
  }))
}

resource "aws_instance" "server" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.deployer.key_name
  vpc_security_group_ids = [aws_security_group.server.id]
  iam_instance_profile   = aws_iam_instance_profile.server.name

  user_data = local.user_data_script

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 20
    delete_on_termination = true
  }

  monitoring = true

  tags = {
    Name = "alibi-arcade-server"
  }
}

resource "aws_iam_role" "server" {
  name = "alibi-arcade-server-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_instance_profile" "server" {
  name = "alibi-arcade-server-profile"
  role = aws_iam_role.server.name
}

# Allow SSM for Systems Manager (optional, for remote session access without SSH)
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.server.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_cloudwatch_log_group" "server" {
  name              = "/alibi-arcade/server"
  retention_in_days = 7

  tags = {
    Name = "alibi-arcade-server-logs"
  }
}
