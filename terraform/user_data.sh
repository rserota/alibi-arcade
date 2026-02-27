#!/bin/bash
set -euo pipefail

echo "$(date) Starting Alibi Arcade bootstrap…"

# log everything
exec > /var/log/alibi-arcade-bootstrap.log 2>&1

# update the OS
yum -y update

# install basic tools
yum install -y curl git

# install Node.js 16 (compatible with Amazon Linux 2)
# remove any stale nodesource repo that might have been created previously
rm -f /etc/yum.repos.d/nodesource-el*18*.repo || true
curl -fsSL https://rpm.nodesource.com/setup_16.x | bash -
yum clean metadata
yum install -y nodejs

# make sure npm is available
npm --version || true
node --version || true

# clone our code (this directory is arbitrary, keep in sync with terraform)
cd /opt || cd /home/ec2-user
mkdir -p alibi-arcade
cd alibi-arcade
# if the repo already exists, pull changes; otherwise clone
if [ -d .git ]; then
    git fetch --all
    git reset --hard origin/${GITHUB_BRANCH}
else
    git clone --depth 1 ${GITHUB_REPO_URL} .
    git checkout ${GITHUB_BRANCH}
fi

# build server
cd server
npm ci
npm run build

# build client
cd ../client
npm ci
npm run build

# create systemd unit (idempotent)
cat <<'UNIT' >/etc/systemd/system/alibi-arcade.service
[Unit]
Description=Alibi Arcade server
After=network.target

[Service]
User=ec2-user
WorkingDirectory=/opt/alibi-arcade/server
ExecStart=/usr/bin/npm start
Restart=always
Environment=PORT=3000
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

# enable & start service
systemctl daemon-reload
systemctl enable --now alibi-arcade

echo "$(date) installing nginx and certbot…"

# install nginx and certbot
yum install -y nginx certbot python3-certbot-nginx

# create nginx config for reverse proxy
cat >/etc/nginx/conf.d/alibi-arcade.conf <<'NGINX'
upstream alibi_arcade_backend {
  server 127.0.0.1:3000;
}

server {
  listen 80;
  server_name alibi-arcade.frivolous.biz;

  # allow certbot challenge
  location /.well-known/acme-challenge/ {
    root /var/www/certbot;
  }

  # redirect all other HTTP traffic to HTTPS
  location / {
    return 301 https://$server_name$request_uri;
  }
}

server {
  listen 443 ssl http2;
  server_name alibi-arcade.frivolous.biz;

  # SSL certificates (certbot will populate these)
  ssl_certificate /etc/letsencrypt/live/alibi-arcade.frivolous.biz/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/alibi-arcade.frivolous.biz/privkey.pem;

  # SSL best practices
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;
  ssl_prefer_server_ciphers on;

  # proxy to node app
  location / {
    proxy_pass http://alibi_arcade_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
  }
}
NGINX

# start nginx (without certs yet, just for cert validation)
systemctl enable nginx
systemctl start nginx

# wait a moment for nginx to be ready
sleep 2

# obtain SSL certificate from Let's Encrypt
certbot certonly \
  --nginx \
  --non-interactive \
  --agree-tos \
  -m admin@frivolous.biz \
  -d alibi-arcade.frivolous.biz

# reload nginx to pick up new SSL certs
systemctl reload nginx

# enable certbot auto-renewal via systemd timer
systemctl enable certbot-renew.timer
systemctl start certbot-renew.timer

echo "$(date) bootstrap complete"