# 999xGame local testing

This repository now includes `docker-compose.local.yml` so PostgreSQL, Redis and the Node backend can be started together without installing either database locally.

## 1. Start backend + PostgreSQL + Redis

From the repository root:

```bash
docker compose -f docker-compose.local.yml up --build
```

Wait until the backend reports that `/ready` is healthy. The local API is:

```text
http://localhost:5050
```

Quick check:

```bash
curl http://localhost:5050/ready
```

Database migrations are applied automatically by the backend on first startup. The migration runner is idempotent, so restarting the stack does not recreate or delete the schema.

## 2. Run Flutter locally

Install Flutter and run from the repository root.

### Android emulator

The Android emulator reaches the host machine through `10.0.2.2`:

```bash
flutter pub get
flutter run --dart-define=SERVER_DOMAIN=http://10.0.2.2:5050
```

### iOS simulator / macOS

The simulator can use `localhost`:

```bash
flutter pub get
flutter run --dart-define=SERVER_DOMAIN=http://localhost:5050
```

### Physical Android phone

Use the computer's LAN IP instead of `10.0.2.2`, for example:

```bash
flutter run --dart-define=SERVER_DOMAIN=http://192.168.1.10:5050
```

The phone and computer must be on the same network, and the computer firewall must allow TCP port `5050`.

## 3. Stop / reset local services

Stop containers while keeping local database data:

```bash
docker compose -f docker-compose.local.yml down
```

Completely reset the local database and Redis data:

```bash
docker compose -f docker-compose.local.yml down -v
```

## Important

This compose file is **local development only**. It uses local placeholder secrets, PostgreSQL without SSL, and a local payment UPI value. Do not use it as production configuration.

Real OTP/WhatsApp verification still depends on the configured verification provider. The local stack is intended to make the API, database, Redis, migrations, realtime workers and Flutter networking testable without a production server.
