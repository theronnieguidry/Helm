# Local Development Setup

This guide explains how to run Helm locally on Windows (or any platform) outside of the Replit environment.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- Node.js 20+ and npm

## Quick Start

### 1. Start PostgreSQL

From the project root:

```bash
docker compose -f dev/docker-compose.yml up -d
```

This starts a PostgreSQL 16 container on port 5432.

### 2. Configure Environment Variables

Create or update `.env` in the project root:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/helm_local
SESSION_SECRET=local-dev-secret-change-in-production
DEV_AUTH_BYPASS=true
```

> **Note:** `DEV_AUTH_BYPASS=true` is required to enable the development authentication bypass. This is a security measure to prevent accidental auth bypass in production environments.

### 3. Initialize the Database

Push the schema to your local database:

```bash
npm run db:push
```

### 4. Start the Development Server

```bash
npm run dev:local
```

The app will be available at http://localhost:5000

When `DEV_AUTH_BYPASS=true` is set, authentication is bypassed and you're automatically logged in as a mock user. You'll see a warning banner in the console confirming dev auth is active.

## Commands Reference

| Command | Description |
|---------|-------------|
| `docker compose -f dev/docker-compose.yml up -d` | Start PostgreSQL |
| `docker compose -f dev/docker-compose.yml down` | Stop PostgreSQL |
| `docker compose -f dev/docker-compose.yml down -v` | Stop and delete data |
| `npm run dev:local` | Start dev server (Windows-compatible) |
| `npm run db:push` | Sync database schema |

## Troubleshooting

### Port 5432 already in use

If you have another PostgreSQL instance running, either stop it or change the port in `docker-compose.yml`:

```yaml
ports:
  - "5433:5432"  # Use port 5433 instead
```

Then update your `.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/helm_local
```

### Database connection refused

1. Ensure Docker Desktop is running
2. Check container status: `docker ps`
3. View logs: `docker compose -f dev/docker-compose.yml logs`

### Reset database

To start fresh:

```bash
docker compose -f dev/docker-compose.yml down -v
docker compose -f dev/docker-compose.yml up -d
npm run db:push
```
