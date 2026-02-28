#!/bin/bash
set -euo pipefail

echo "$(date) Starting Alibi Arcade bootstrap…"

# log everything
exec > /var/log/alibi-arcade-bootstrap.log 2>&1

# update the OS
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

# install basic tools and AWS CLI
apt-get install -y curl git awscli

# install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# verify installation
npm --version || true
node --version || true

# clone our code
cd /opt
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

# install all workspace dependencies from root
npm ci

# build server
npm run build --workspace=server

# build client
npm run build --workspace=client

# fetch OpenAI API key from Parameter Store
echo "$(date) fetching OpenAI API key from Parameter Store..."
OPENAI_KEY=$(aws ssm get-parameter --name /alibi-arcade/prod/openai_api_key --with-decryption --query Parameter.Value --output text --region us-east-1 2>/dev/null || echo "")

# create systemd unit
cat >/etc/systemd/system/alibi-arcade.service <<UNIT
[Unit]
Description=Alibi Arcade server
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/opt/alibi-arcade
ExecStart=/usr/bin/npm start --workspace=server
Restart=always
Environment=PORT=3000
Environment=OPENAI_API_KEY=$OPENAI_KEY
Environment=NODE_PATH=/opt/alibi-arcade/node_modules
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

# enable & start service
systemctl daemon-reload
systemctl enable --now alibi-arcade

echo "$(date) installing nginx and certbot…"

# install nginx and certbot
apt-get install -y nginx certbot python3-certbot-nginx

# create nginx config for reverse proxy
cat >/etc/nginx/sites-available/alibi-arcade <<'NGINX'
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

# enable site
ln -sf /etc/nginx/sites-available/alibi-arcade /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# start nginx
systemctl enable nginx
systemctl start nginx

# wait for nginx to be ready
sleep 3

# obtain SSL certificate from Let's Encrypt (using standalone mode to avoid nginx validation issues)
echo "$(date) obtaining SSL certificate..."
systemctl stop nginx
certbot certonly \
  --standalone \
  --non-interactive \
  --agree-tos \
  -m admin@frivolous.biz \
  -d alibi-arcade.frivolous.biz || echo "Certbot failed, continuing..."
systemctl start nginx

# reload nginx to pick up new SSL certs
systemctl reload nginx || true

# enable certbot auto-renewal
systemctl enable certbot.timer || true
systemctl start certbot.timer || true

echo "$(date) bootstrap complete"
