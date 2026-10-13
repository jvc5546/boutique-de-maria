# Boutique de María

Private, invite-only distributor site for body mists and lotions. Spanish-only site; code and docs in English.

## Stack

Astro on S3 + CloudFront (Free flat-rate plan) · Cognito with Google sign-in · API Gateway + Lambda (Node.js) · DynamoDB · Terraform · GitHub Actions with OIDC (no stored AWS keys). Domain `boutiquedemariamx.com` at Cloudflare Registrar, DNS at Cloudflare. AWS account `boutique-de-maria` (239280166667), us-east-1.

## Layout

```
web/              Astro site (Spanish UI)
lambdas/
  auth-gate/      Cognito trigger: the invite list (M2)
  api/            the site API behind /api/* (M3)
seed/             sample data (catalog-sample.json)
infra/
  bootstrap/      one-time setup: state bucket, budget alerts, GitHub OIDC roles (M0)
  prod/           the live site: S3 + CloudFront (Free plan) + WAF + ACM + Cloudflare DNS (M1),
                  sign-in: Cognito + Google, DynamoDB table, auth-gate Lambda (M2),
                  API: API Gateway (JWT) + api Lambda behind CloudFront /api/* (M3)
.github/workflows/
  ci.yml          pull requests: build the site, Lambda tests, terraform plan (read-only role)
  deploy.yml      main: terraform apply, build + upload the site, refresh CloudFront
  verify-aws.yml  manual: print the OIDC token claims and AWS identity
```

## Local development

```bash
cd web && npm install && npm run dev      # http://localhost:4321
node --test lambdas/*/test/*.test.mjs     # Lambda tests (from the repo root)
```

For real sign-in on localhost, copy `web/.env.example` to `web/.env` and fill in
`PUBLIC_AUTH_CLIENT_ID` from `terraform output auth_client_id` (in `infra/prod`).

## Sign-in (M2)

Google is the only way in. The `auth-gate` Lambda lets a Google account in only if its email
is an active user in the `bdm-main` table, and it runs again on every token refresh, so a
removed distributor is out within an hour.

GitHub settings (**Settings → Secrets and variables → Actions**):

| Name | Kind | Value |
|---|---|---|
| `GOOGLE_CLIENT_ID` | variable | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | **secret** | Google OAuth client secret |
| `ADMINS` | variable | JSON, email → display name: `{"a@example.com":"Admin"}` |

Google OAuth client: Web application, authorized redirect URI
`https://auth.boutiquedemariamx.com/oauth2/idpresponse`.

Terraform for `infra/prod` needs AWS access (`AWS_PROFILE=boutique`) and a Cloudflare token
(`CLOUDFLARE_API_TOKEN`, Zone:DNS:Edit + Zone:Read on boutiquedemariamx.com only).

## API (M3)

`https://boutiquedemariamx.com/api/*` → CloudFront (WAF) → API Gateway (checks the Cognito
ID token) → `bdm-api` Lambda (looks the person up in the table on every call).

| Route | Returns |
|---|---|
| `GET /api/catalog` | Active products with the caller's tier price (admins: both prices), stock, package contents, same-scent items |

Products live in `bdm-main` under `pk = PRODUCT`, `sk = <id>`; prices are integer cents (MXN).
A package's stock is its scarcest item's. Load the sample catalog with [seed/README.md](seed/README.md).

## Milestones

| | Milestone | Status |
|---|---|---|
| M0 | Foundations: AWS account, budgets, domain, repo, state bucket, OIDC | done |
| M1 | Hosting: Astro skeleton live on the domain with HTTPS | done |
| M2 | Sign-in: Cognito + Google, invite list, admins | done |
| M3 | Catalog | in progress |
| M4 | Admin | |
| M5 | Orders | |
| M6 | Customer catalogs | |
| M7 | Metrics | |
| M8 | Demo and pitch | |
