# Prime Nest — Production-Grade Secure Backend Architecture (RBAC + JWT RS256)

A reference NestJS backend architecture designed for regulated and security-sensitive environments — payments, healthcare, enterprise SaaS, and AI-driven systems where auditability and resilience are non-negotiable.

**This is not a boilerplate.**  
It is a security-first backend foundation shaped by real production constraints.

---

## Built by

**Ramos de Souza Janones**  
Senior Full-Stack Engineer — Node.js | NestJS | Distributed Systems | LLMs in Production  

I design secure, scalable, audit-ready backend systems for regulated and high-risk domains.

- 🌐 [Website](https://ramosdainformatica.com.br/)
- 💼 [LinkedIn](https://www.linkedin.com/in/ramos-souza/)
- 💻 [GitHub](https://github.com/RamosJSouza)

---

## Why This Architecture Exists

Most backend templates optimize for speed.  
This architecture optimizes for:

- Security reviews
- Compliance readiness
- Auditability
- Failure containment
- Production resilience
- Horizontal scalability

It reflects patterns used in environments where:

- Financial transactions cannot fail silently
- Healthcare data must remain traceable
- Authentication must resist token replay attacks
- AI integrations require structured observability

---

## Core Design Principles

### 1. Asymmetric JWT (RS256)

- Private key signs tokens (server only)
- Public key verifies tokens (safe to distribute)
- Prevents symmetric secret leakage risks
- Compatible with distributed validation
- Access token: 15 minutes
- Refresh token: 7 days
- Rotation with reuse detection enabled

### 2. Refresh Token Rotation + Reuse Detection

- If a compromised refresh token is reused:
  - Entire session family is revoked
  - Event is logged
  - Incident becomes traceable
- No silent compromise.

### 3. Append-Only Audit Logging

- Every mutation recorded
- Correlation ID per request
- No update/delete on audit records
- Designed for traceability and forensic review

### 4. Database-Driven RBAC

- Feature → Permission → RolePermission → Role → User
- Permissions stored in DB
- No hardcoded roles
- Changes take effect immediately
- All mutations guarded

### 5. Fail-Fast Configuration

- Startup validation via Joi
- Production refuses to boot without:
  - `PRIVATE_KEY`
  - `PUBLIC_KEY`
  - `DB_SSL=true`
  - `ALLOWED_ORIGINS` defined
- No silent misconfiguration.

---

## Security Model

- Rate limiting: 100 req / 15 min per IP
- Helmet security headers
- Strict CORS (production required)
- ValidationPipe (whitelist + forbidNonWhitelisted)
- Account lockout: 5 attempts → 15-minute lock
- Password change revokes all active sessions
- `synchronize: false` in production
- Designed to pass internal security review.

---

## Observability & Resilience

- Structured logging with Pino
- Correlation ID propagation
- Liveness & Readiness endpoints
- Docker health checks aligned with readiness
- Graceful shutdown on SIGTERM
- Connection pooling (configurable)
- Horizontal scaling supported (stateless JWT) when `REDIS_HOST` is set for shared cache and JWT denylist

---

## Architecture Constraints

- Single-tenant (no organization scoping in audit or RBAC)
- Async audit via BullMQ when `REDIS_HOST` is set; synchronous fallback otherwise
- Scheduled purge: expired sessions + audit logs older than `AUDIT_RETENTION_DAYS` (default 90)
- Swagger intentionally exposed for integration workflows
- Set `REDIS_HOST` in every production/replica deployment — without it, RBAC permission cache and JWT denylist are per-process (in-memory fallback)
- Global API prefix defaults to `/api` (configurable via `API_PREFIX`)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | [NestJS](https://nestjs.com/) |
| Database | PostgreSQL + [TypeORM](https://typeorm.io/) |
| Cache | Redis when `REDIS_HOST` is set; in-memory (per process) otherwise |
| Auth | JWT RS256 |
| Validation | Class Validator + Joi |
| Logging | Pino |
| API Docs | Swagger |

---

## Real-World Context Behind This Design

This architecture reflects experience in:

- Payment systems (including PIX-related flows)
- Healthcare platforms
- Stripe integrations
- AI system refactoring
- LLM + RAG pipelines in production

When integrating AI into regulated systems, structured logs, correlation IDs, and audit trails stop being optional. They become operational requirements.

---

## Documentation

| Language | Links |
|----------|-------|
| **English** | [Architecture](docs/en/architecture.md) · [Authentication](docs/en/authentication.md) · [RBAC](docs/en/rbac.md) · [Configuration](docs/en/configuration.md) · [Observability](docs/en/observability.md) · [Security](docs/en/security.md) |
| **Português** | [Arquitetura](docs/pt-br/arquitetura.md) · [Autenticação](docs/pt-br/autenticacao.md) · [RBAC](docs/pt-br/rbac.md) · [Configuração](docs/pt-br/configuracao.md) · [Observabilidade](docs/pt-br/observabilidade.md) · [Segurança](docs/pt-br/seguranca.md) |

(See `/docs` directory)

---

## Quick Start

1. Configure `.env`
2. Generate RSA keys
3. Run migrations
4. Seed RBAC
5. Change admin credentials
6. Start application

```bash
cp .env.example .env
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
yarn install
yarn migration:run
yarn seed:rbac
yarn dev
```

> **Important:** Change the seed admin password after first deploy.

### Docker

```bash
# Local development (exposes DB/Redis ports)
npm run docker:up

# Production-like (no host port exposure)
npm run docker:up:prod
```

---

## For Engineering Leaders

This repository can be used as:

- A secure backend reference implementation
- An RBAC foundation
- A JWT rotation example
- An audit-ready architecture blueprint
- A starting point for regulated SaaS systems

---

## Contact

If you are building or modernizing a backend that must survive:

- Security review
- Compliance audits
- Production incidents
- AI integration risks

Let's connect.

- 🌐 [https://ramosdainformatica.com.br/](https://ramosdainformatica.com.br/)
- 💼 [https://www.linkedin.com/in/ramos-souza/](https://www.linkedin.com/in/ramos-souza/)

---

## Navegação (Português)

| Seção | Descrição |
|-------|-----------|
| [Construído por](#built-by) | Autor e links de contato |
| [Por que esta arquitetura existe](#why-this-architecture-exists) | Motivação e contexto |
| [Princípios de design](#core-design-principles) | JWT RS256, rotação, auditoria, RBAC, fail-fast |
| [Modelo de segurança](#security-model) | Rate limit, lockout, CORS, validação |
| [Observabilidade e resiliência](#observability--resilience) | Pino, health checks, graceful shutdown |
| [Restrições de arquitetura](#architecture-constraints) | Single-tenant, Swagger, migrations |
| [Stack tecnológica](#tech-stack) | NestJS, PostgreSQL, Redis, JWT |
| [Contexto real](#real-world-context-behind-this-design) | Pagamentos, healthcare, AI |
| [Documentação](#documentation) | Links para docs em inglês e português |
| [Quick Start](#quick-start) | Passos para rodar o projeto |
| [Para líderes de engenharia](#for-engineering-leaders) | Casos de uso do repositório |
| [Contato](#contact) | Website e LinkedIn |
