# 999x AWS EC2 deployment

This deployment keeps the application backend on one EC2 host:

- Node.js + Socket.IO backend in Docker
- Supabase PostgreSQL as the external database
- Redis in a persistent local Docker volume
- Nginx on the host for REST and WebSocket proxying
- No ECS/Fargate, ALB, RDS, or ElastiCache

This is a low-cost starting architecture. It is not a substitute for a multi-node production architecture once traffic grows.

## 1. Create the EC2 instance

Use an Ubuntu LTS AMI and select an EC2 instance type explicitly marked **Free tier eligible** in your AWS console. AWS says eligibility depends on when the AWS account was created; verify the Free Tier label and billing meter in your own account.

Security group inbound rules:

- SSH TCP 22: **your IP only**
- HTTP TCP 80: `0.0.0.0/0`
- HTTPS TCP 443: `0.0.0.0/0`
- Do **not** expose 5050, 5432, or 6379 publicly.

A public IPv4 address is needed for direct internet reachability. AWS public IPv4 usage can incur charges depending on account eligibility, so monitor the AWS billing/Free Tier page.

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

The first run installs Docker and creates `infrastructure/aws-free/.env.aws` from the safe template. It intentionally stops before starting the production stack until the required secrets are filled in.

## 4. Configure secrets

```bash
nano ~/999xgame/infrastructure/aws-free/.env.aws
```

Set at minimum:

- `DB_PASSWORD` — your Supabase database password
- `JWT_SECRET`
- `ADMIN_JWT_SECRET`
- `CORS_ORIGIN`

Also verify `DB_HOST`, `DB_NAME`, and `DB_USER` point to the intended Supabase project. Use long random JWT secrets. Never commit `.env.aws`.

For an initial HTTP smoke test, `CORS_ORIGIN` can use your EC2 public origin. For the real mobile release, use your HTTPS API domain.

## 5. Start the stack

```bash
cd ~/999xgame/infrastructure/aws-free
sudo docker compose --env-file .env.aws -f docker-compose.aws.yml up -d --build
sudo docker compose --env-file .env.aws -f docker-compose.aws.yml ps
curl http://127.0.0.1:5050/ready
```

The backend is published only on `127.0.0.1:5050`, so it is reachable locally and through Nginx but is not directly exposed to the public network. Redis has no public host port.

The backend readiness endpoint verifies the required PostgreSQL/Redis dependencies before returning success.

## 6. Add Nginx

```bash
sudo apt-get update
sudo apt-get install -y nginx
sudo cp nginx-999xgame.conf.example /etc/nginx/sites-available/999xgame.conf
sudo sed -i 's/YOUR_DOMAIN/your-real-domain.example/g' /etc/nginx/sites-available/999xgame.conf
sudo ln -sf /etc/nginx/sites-available/999xgame.conf /etc/nginx/sites-enabled/999xgame.conf
sudo nginx -t
sudo systemctl reload nginx
```

Replace `your-real-domain.example` with the actual API domain. For a temporary IP-only smoke test, use the EC2 public IP as `server_name`.

## 7. HTTPS

For the real Flutter release, configure DNS for your API domain and issue a Let's Encrypt certificate. Keep port 80 available for the HTTP-to-HTTPS redirect and certificate renewal. Do not put database or Redis credentials in Nginx or the Flutter app.

Before the release build, ensure the GitHub Actions `SERVER_DOMAIN` secret is set to the same HTTPS API origin used by the mobile client.

## 8. Update the app

```bash
cd ~/999xgame
git pull --ff-only origin main
cd infrastructure/aws-free
sudo docker compose --env-file .env.aws -f docker-compose.aws.yml up -d --build
sudo docker compose --env-file .env.aws -f docker-compose.aws.yml ps
curl http://127.0.0.1:5050/ready
```

The local Redis volume is retained across container rebuilds. PostgreSQL data is managed by Supabase, so the EC2 Docker stack does not contain a PostgreSQL data volume.

## Cost guardrail

The architecture deliberately avoids Fargate, ALB, RDS and ElastiCache. AWS still has account-specific Free Tier/credit limits and some resources can incur charges. Monitor the AWS billing/Free Tier page and do not assume the deployment is permanently ₹0.

Never commit `.env.aws` or place production secrets in Flutter source code.
