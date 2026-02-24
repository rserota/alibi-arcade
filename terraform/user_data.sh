#!/bin/bash
set -e

# Log all output
exec > >(tee -a /var/log/alibi-arcade-bootstrap.log)
exec 2>&1

echo "Starting Alibi Arcade bootstrap..."

# Update system
yum update -y
yum install -y nodejs npm git curl certbot python3-certbot-nginx

# Create app directory
mkdir -p /opt/alibi-arcade
cd /opt/alibi-arcade

# Clone repository
git clone ${GITHUB_REPO_URL} .
git checkout ${GITHUB_BRANCH}

# Install shared dependencies
cd /opt/alibi-arcade/shared
npm ci

# Build and install server
cd /opt/alibi-arcade/server
npm ci
npm run build

# Build client
cd /opt/alibi-arcade/client
npm ci
VITE_API_URL="${API_URL}" npm run build

# Copy client build to a location for serving (optional, if using nginx)
# For now, assume server serves static files or we'll handle this later

# Create systemd service for Node server
cat > /etc/systemd/system/alibi-arcade.service << 'SYSTEMD_EOF'
[Unit]
Description=Alibi Arcade Server
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/alibi-arcade/server
Environment="NODE_ENV=production"
Environment="PORT=3000"
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5

# Security hardening
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SYSTEMD_EOF

# Create ec2-user if needed and set ownership
useradd -m -s /bin/bash ec2-user 2>/dev/null || true
chown -R ec2-user:ec2-user /opt/alibi-arcade

# Enable and start service
systemctl daemon-reload
systemctl enable alibi-arcade
systemctl start alibi-arcade

echo "Alibi Arcade bootstrap complete!"
