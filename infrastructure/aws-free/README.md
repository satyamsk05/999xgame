# 999x AWS Free-Tier EC2 deployment

This deployment keeps the existing application code and runs the backend stack on one EC2 host:

- Node.js + Socket.IO backend
- PostgreSQL in a persistent Docker volume
- Redis in a persistent Docker volume
- Nginx on the host for HTTP/WebSocket proxying
- No ECS/Fargate, ALB, RDS, or ElastiCache

This is the low-cost starting architecture. It is not a substitute for a multi-node production architecture once traffic grows.

## 1. Create the EC2 instance

Use an Ubuntu LTS AMI and select an EC2 instance type explicitly marked **Free tier eligible** in your AWS console. AWS says the eligible types depend on when the AWS account was created; accounts created on/after July 15, 2025 have a 6-month/credit-based Free Tier model. Check the Free Tier label before launching. urlAWS EC2 Free Tier documentationhttps://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html

Security group inbound rules for the first setup:

- SSH TCP 22: **your IP only**
- HTTP TCP 80: `0.0.0.0/0`
- HTTPS TCP 443: `0.0.0.0/0` (needed after TLS is configured)
- Do **not** expose 5050, 5432, or 6379 publicly.

A public IPv4 address is needed for direct internet reachability. AWS documents 750 hours/month of public IPv4 usage with EC2 for eligible Free Tier customers; verify the Free Tier meter in your own account. urlAWS public IPv4 documentationhttps://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html

## 2. Connect to EC2

```bash
ssh -i YOUR_KEY.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

## 3. Bootstrap the server

```bash
git clone https://github.com/satyamsk05/999xgame.git ~/999xgame
cd ~/999xgame
bash infrastructure/aws-free/setup-ec2.sh
```

The first run installs Docker and creates `infrastructure/aws-free/.env.aws` from the safe template. It intentionally stops before starting the production stack until secrets are filled in.

## 4. Configure secrets

```bash
nano ~/999xgame/infrastructure/aws-free/.env.aws
```

Set at minimum:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `ADMIN_JWT_SECRET`
- `CORS_ORIGIN`

Use long random values. Never commit `.env.aws`.

For an initial HTTP smoke test, `CORS_ORIGIN` can use your EC2 public origin. For the real mobile release, use your HTTPS API domain.

## 5. Start the stack

```bash
cd ~/999xgame/infrastructure/aws-free
sudo docker compose --env-file .env.aws -f docker-compose.aws.yml up -d --build
sudo docker compose --env-file .env.aws -f docker-compose.aws.yml ps
curl http://127.0.0.1:5050/ready
```

The backend container listens only on `127.0.0.1:5050`; PostgreSQL and Redis have no host ports published.

## 6. Add Nginx

```bash
sudo apt-get update
sudo apt-get install -y nginx
sudo cp nginx-999xgame.conf.example /etc/nginx/sites-available/999xgame.conf
sudo sed -i 's/YOUR_DOMAIN/YOUR_DOMAIN/g' /etc/nginx/sites-available/999xgame.conf
sudo ln -sf /etc/nginx/sites-available/999xgame.conf /etc/nginx/sites-enabled/999xgame.conf
sudo nginx -t
sudo systemctl reload nginx
```

Replace `YOUR_DOMAIN` with your real domain before the final two commands. For a temporary IP-only smoke test, use the EC2 public IP as `server_name`.

## 7. HTTPS

For the real Flutter release, configure a domain and issue a Let's Encrypt certificate. Keep port 80 available for the HTTP-to-HTTPS redirect and certificate renewal. Do not put database or Redis credentials in Nginx or the Flutter app.

## 8. Update the app

```bash
cd ~/999xgame
git pull --ff-only origin main
cd infrastructure/aws-free
sudo docker compose --env-file .env.aws -f docker-compose.aws.yml up -d --build
```

Persistent PostgreSQL and Redis Docker volumes are retained across container rebuilds.

## Cost guardrail

The architecture deliberately avoids Fargate, ALB, RDS and ElastiCache. AWS still has account-specific Free Tier/credit limits and some resources can incur charges, so monitor the AWS Free Tier/Billing page. EC2 usage is billable outside your eligible limits. urlAWS Free Tier overviewhttps://aws.amazon.com/free/

Never assume an AWS deployment is permanently ₹0. Stop/delete resources when the account's Free Tier/credits expire or when the service is no longer needed.
