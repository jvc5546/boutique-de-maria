# Boutique de María

Private, invite-only distributor site for body mists and lotions. The site is in Spanish; code and docs are in English.

## Stack

Astro on S3 + CloudFront (Free flat-rate plan) · Cognito with Google sign-in · API Gateway + Lambda (Node.js) · DynamoDB · Terraform · GitHub Actions with OIDC (no stored cloud keys). DNS at Cloudflare. AWS, us-east-1.

## Environments

| | URL | AWS account | Deployed |
|---|---|---|---|
| staging | https://staging.boutiquedemariamx.com | `boutique-de-maria-staging` | on every pull request |
| production | https://boutiquedemariamx.com | `boutique-de-maria` (239280166667) | on merge to `main`, **after approval** |

Each environment is its own AWS account, so code running in a pull request can never touch production.

## Layout

```
web/                      Astro site (Spanish UI)
lambdas/
  auth-gate/              Cognito trigger: the invite list
  api/                    the site API behind /api/*
seed/                     sample data
infra/
  modules/
    site/                 one environment's site: S3, CloudFront (Free plan), WAF, ACM, DNS,
                          Cognito + Google, DynamoDB, Lambdas, API Gateway
    bootstrap/            one account's setup: state bucket, budget alerts, GitHub OIDC roles,
                          permissions boundary (always applied locally, never from CI)
  envs/
    prod/{site,bootstrap}
    staging/{site,bootstrap}
.github/workflows/
  ci.yml                  pull requests: build, tests, production plan, deploy to staging
  deploy.yml              main: deploy to production (waits for approval)
  deploy-env.yml          the deploy itself, shared by both
```

## How a change ships

1. Open a pull request. CI builds the site, runs the Lambda tests, shows the production Terraform plan, and deploys the branch to **staging**.
2. Try it on staging.boutiquedemariamx.com.
3. Merge. The production deploy starts and **waits for an approval** in GitHub Actions.

## Security model

- **No stored cloud keys.** GitHub Actions gets short-lived AWS credentials through OIDC.
- **Roles:**

  | Role | Account | Who can use it | Access |
  |---|---|---|---|
  | `github-plan` | production | pull requests | read-only |
  | `github-deploy` | staging | jobs in the `staging` GitHub environment | write, staging account only |
  | `github-deploy` | production | jobs in the `production` environment | write, and GitHub requires a reviewer's approval first |

- **The approval can't be skipped by editing a workflow.** Without `environment: production`, the OIDC token's subject changes and AWS refuses it.
- **Least privilege:**
  - Deploy roles can only touch the services the site uses.
  - They can't edit IAM, except Lambda roles under `/bdm/`, which must carry a permissions boundary.
  - Long-term spending commitments are explicitly denied.
- **Limits:** API Gateway is throttled (5 requests/s, bursts of 10), and CloudFront sits behind WAF with managed rules and a per-IP rate limit.
- **Supply chain:** third-party GitHub Actions are pinned to exact commits.
- **Budgets:** each account emails an alert at 20% and 100% of a $5/month budget.

## Local development

```bash
cd web && npm install && npm run dev      # http://localhost:4321, API proxied to staging
node --test lambdas/*/test/*.test.mjs     # Lambda tests (from the repo root)
```

For real sign-in on localhost, copy `web/.env.example` to `web/.env` and set `PUBLIC_AUTH_CLIENT_ID`
(`terraform output -raw auth_client_id` in `infra/envs/staging/site`). Only staging accepts localhost sign-ins.

## Sign-in

Google is the only way in. The `auth-gate` Lambda lets a Google account in only if its email is an
active user in the `bdm-main` table, and runs again on every token refresh, so a removed user is out
within an hour.

GitHub settings (**Settings → Secrets and variables → Actions**):

| Name | Kind | Value |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | Cloudflare token: Zone DNS Edit + Zone Read, this zone only |
| `GOOGLE_CLIENT_ID` | variable | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | secret | Google OAuth client secret |
| `ADMINS` | variable | JSON, email → display name: `{"a@example.com":"Admin"}` |
| `AWS_PLAN_ROLE_ARN` | variable | `github-plan` in production |
| `AWS_DEPLOY_ROLE_ARN` | variable | `github-deploy` in production |
| `AWS_STAGING_DEPLOY_ROLE_ARN` | variable | `github-deploy` in staging |

Google OAuth client redirect URIs: `https://auth.boutiquedemariamx.com/oauth2/idpresponse` and
`https://auth-staging.boutiquedemariamx.com/oauth2/idpresponse`.

## API (M3)

`https://boutiquedemariamx.com/api/*` → CloudFront (WAF) → API Gateway (checks the Cognito
ID token) → `bdm-api` Lambda (looks the person up in the table on every call).

| Route | Returns |
|---|---|
| `GET /api/catalog` | Listed products with the caller's tier price (admins: both prices), stock, package contents, same-scent items, photo; the orders WhatsApp number |
| `GET/POST /api/admin/products`, `PUT /api/admin/products/{id}` | Admins: every product as stored; create (id from the name) or replace one |
| `POST /api/admin/products/{id}/photo` | Admins: a WebP/JPEG (≤ 2 MB, already squared by the browser), stored at `media/products/` in the site bucket |
| `GET /api/admin/users`, `PUT /api/admin/users/{email}` | Admins: distributors (add, tier, access). Admin accounts stay in Terraform (`ADMINS`) |
| `GET/PUT /api/admin/settings` | Admins: orders WhatsApp number, international format with country code |

Products live in `bdm-main` under `pk = PRODUCT`, `sk = <id>`; prices are integer cents (MXN).
A package's stock is its scarcest item's. An item at zero stock for 60 days leaves the catalog until restocked. Load sample products with [seed/README.md](seed/README.md).

## Milestones

| | Milestone | Status |
|---|---|---|
| M0 | Foundations: AWS account, budgets, domain, repo, state bucket, OIDC | done |
| M1 | Hosting: Astro skeleton live on the domain with HTTPS | done |
| M2 | Sign-in: Cognito + Google, invite list, admins | done |
| M3 | Catalog | done |
| M3.5 | Staging account, deploy approvals, security hardening | done |
| M4 | Admin | in progress |
| M5 | Orders | |
| M6 | Customer catalogs | |
| M7 | Metrics | |
| M8 | Demo and pitch | |
