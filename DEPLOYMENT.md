# Alibi Arcade Deployment Guide (AWS EC2 + Terraform)

This guide walks you through deploying Alibi Arcade to AWS EC2 using Terraform.

## Prerequisites

1. **AWS Account** with access to EC2, Route53, IAM, and CloudWatch.
2. **Terraform** (v1.0+) installed locally.
3. **AWS CLI** configured with credentials.
4. **SSH key pair** created locally (for access to EC2).
5. **Git** repository pushed to GitHub (for bootstrapping).
6. **Domain**: `frivolous.biz` already registered and pointing to AWS Route53.

## Setup Steps

### 1. Prepare Your Environment

#### Generate SSH Key (if you don't have one)
```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/alibi-arcade-key -N ""
cat ~/.ssh/alibi-arcade-key.pub
```

#### Store SSH Public Key
Copy the output and save it for use in `terraform.tfvars`.

#### Push Repository to GitHub
```bash
cd /path/to/codegen-test
git remote add origin https://github.com/YOUR_USERNAME/codegen-test.git
git branch -M main
git push -u origin main
```

### 2. Create Terraform Variables File

Create `terraform/terraform.tfvars`:

> **Note:** you must already own a hosted zone for `frivolous.biz` in
> Route53. The `domain_name` variable should be set to that zone's name.
> Terraform will then create an **A record** for the subdomain composed of
> `subdomain_name + "." + domain_name` (for example
> `alibi-arcade.frivolous.biz`). You don't need a separate hosted zone for
> the subdomain; Route53 records live inside the parent zone.

```hcl
aws_region     = "us-east-1"
environment    = "prod"
domain_name    = "frivolous.biz"
subdomain_name = "alibi-arcade"
instance_type  = "t3.micro"
<---- I'm here
# Must match your hosted zone in Route53
api_url         = "https://alibi-arcade.frivolous.biz"

# Your GitHub repo (clone over HTTPS)
github_repo_url = "https://github.com/rserota/alibi-arcade"
github_branch   = "main"

# SSH public key (from step 1)
ssh_public_key  = "ssh-rsa AAAAB3NzaC1yc2E... your-public-key-here"
```

### 3. Create Terraform State Backend (One-time)

Before running `terraform init`, bootstrap the S3 + DynamoDB backend:

```bash
cd terraform
aws s3 mb s3://alibi-arcade-terraform-state --region us-east-1
aws s3api put-bucket-versioning \
  --bucket alibi-arcade-terraform-state \
  --versioning-configuration Status=Enabled

aws dynamodb create-table \
  --table-name terraform-state-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

# Enable server-side encryption (optional but recommended)
aws s3api put-bucket-encryption \
  --bucket alibi-arcade-terraform-state \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'
```

### 4. Deploy Infrastructure

```bash
cd terraform

# Initialize Terraform (will connect to S3 backend)
terraform init

# Review planned changes
terraform plan

# Apply changes (creates EC2, security group, Route53 record, etc.)
terraform apply

# Note the outputs (instance ID, public IP, SSH command)
```

### 5. Verify Deployment

Once `terraform apply` completes:

1. **Wait 2-3 minutes** for the EC2 bootstrap script to finish.
2. **Check instance logs**:
   ```bash
   ssh -i ~/.ssh/alibi-arcade-key ec2-user@$(terraform output -raw public_ip)
   tail -f /var/log/alibi-arcade-bootstrap.log
   ```
3. **Verify DNS**:
   ```bash
   dig alibi-arcade.frivolous.biz
   # Should resolve to the Elastic IP
   ```
4. **Test the API** (after a few minutes):
   ```bash
   curl https://alibi-arcade.frivolous.biz/api/story \
     -X POST \
     -H "Content-Type: application/json" \
     -d '...'
   ```
5. **Open the client** in a browser:
   ```
   https://alibi-arcade.frivolous.biz
   ```

### 6. HTTPS/TLS Setup (Let's Encrypt)

The bootstrap script installs `certbot`. To set up HTTPS:

```bash
# SSH into the instance
ssh -i ~/.ssh/alibi-arcade-key ec2-user@$(terraform output -raw public_ip)

# Generate certificate (assumes nginx is set up, or use standalone)
sudo certbot certonly --standalone -d alibi-arcade.frivolous.biz

# Configure nginx or Node server to use the cert
# Certificate path: /etc/letsencrypt/live/alibi-arcade.frivolous.biz/
```

**For Node.js HTTPS**, modify the server code to load the cert:
```javascript
const https = require('https');
const fs = require('fs');

const options = {
  key: fs.readFileSync('/etc/letsencrypt/live/alibi-arcade.frivolous.biz/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/alibi-arcade.frivolous.biz/fullchain.pem'),
};

https.createServer(options, app).listen(443);
```

Or use **nginx as a reverse proxy** (simpler):
```bash
sudo yum install -y nginx
# Configure nginx to reverse proxy to Node on port 3000
# and serve HTTPS with certbot cert
```

### 7. Deploy Updates

Push code changes to `main` branch:
```bash
git push origin main
```

Then SSH into the instance and pull:
```bash
ssh -i ~/.ssh/alibi-arcade-key ec2-user@$(terraform output -raw public_ip)
cd /opt/alibi-arcade
git pull origin main
npm run build  # or run your build commands
sudo systemctl restart alibi-arcade
```

Or set up **GitHub Actions** (see `/.github/workflows/deploy.yml` template below).

### 8. Monitor & Maintain

**Check service status**:
```bash
ssh -i ~/.ssh/alibi-arcade-key ec2-user@$(terraform output -raw public_ip)
sudo systemctl status alibi-arcade
sudo journalctl -u alibi-arcade -f
```

**View logs in CloudWatch**:
```bash
aws logs tail /alibi-arcade/server --follow
```

**Restart service** if needed:
```bash
ssh -i ~/.ssh/alibi-arcade-key ec2-user@$(terraform output -raw public_ip)
sudo systemctl restart alibi-arcade
```

### 9. Destroy Infrastructure (Cleanup)

```bash
cd terraform
terraform destroy
```

---

## GitHub Actions CI/CD (Optional)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy Alibi Arcade

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build client
        run: |
          cd client
          npm ci
          VITE_API_URL=https://alibi-arcade.frivolous.biz npm run build
      
      - name: Build server
        run: |
          cd shared && npm ci
          cd ../server && npm ci && npm run build
      
      - name: Deploy to EC2
        env:
          SSH_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
          EC2_IP: ${{ secrets.EC2_PUBLIC_IP }}
        run: |
          mkdir -p ~/.ssh
          echo "$SSH_KEY" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          ssh-keyscan -H $EC2_IP >> ~/.ssh/known_hosts
          
          ssh -i ~/.ssh/deploy_key ec2-user@$EC2_IP << 'EOF'
          cd /opt/alibi-arcade
          git pull origin main
          cd shared && npm ci
          cd ../server && npm ci && npm run build
          cd ../client && npm ci && VITE_API_URL=https://alibi-arcade.frivolous.biz npm run build
          sudo systemctl restart alibi-arcade
          EOF
```

Store secrets in GitHub:
- `SSH_PRIVATE_KEY`: Contents of `~/.ssh/alibi-arcade-key`
- `EC2_PUBLIC_IP`: Terraform output (or hardcode `alibi-arcade.frivolous.biz`)

---

## Costs

**Estimated monthly**:
- **EC2 t3.micro**: ~$5-8 (eligible for free tier first 12 months)
- **Elastic IP**: Free (if in use)
- **Route53**: ~$0.50 (hosted zone) + queries
- **CloudWatch Logs**: Free tier covers 5GB/month
- **Total**: ~$5-10/month (after free tier)

---

## Troubleshooting

### Bootstrap script failed
```bash
ssh -i ~/.ssh/alibi-arcade-key ec2-user@$(terraform output -raw public_ip)
tail -100 /var/log/alibi-arcade-bootstrap.log
```

### DNS not resolving
```bash
# Check Route53 record
aws route53 list-resource-record-sets \
  --hosted-zone-id $(aws route53 list-hosted-zones-by-name --dns-name frivolous.biz --query 'HostedZones[0].Id' --output text) \
  --query "ResourceRecordSets[?Name=='alibi-arcade.frivolous.biz.']"
```

### CORS errors in browser
Ensure the server allows the origin. Update `server/src/index.ts`:
```javascript
app.use(cors({
  origin: ['https://alibi-arcade.frivolous.biz'],
}));
```

---

## Next Steps

- Set up **auto-renewal of Let's Encrypt certificate** (certbot renewal cron job).
- Add **autoscaling** if traffic spikes.
- Configure **email alerts** for EC2 CPU/memory via CloudWatch.
- Set up **log aggregation** to CloudWatch or ELK stack.
