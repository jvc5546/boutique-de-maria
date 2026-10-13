# Bootstrap (M0)

Run once, from your computer, with the `boutique` SSO profile. It creates:

- a **$5/month budget** with email alerts at $1, $5, and when the month is forecast to pass $5
- the **Terraform state bucket** `bdm-tfstate-<account id>` (versioned, encrypted, private, TLS only, S3 native locking)
- the **GitHub OIDC provider** and two roles:
  - `github-plan`: pull requests only, read-only
  - `github-deploy`: `main` branch only; ReadOnlyAccess plus write access limited to what infra/prod manages
- the **workload boundary** `bdm-workload-boundary`: the most any role created by infra/prod
  (Lambda execution roles under `/bdm/`) can ever do. `github-deploy` can only create roles that carry it.

When a milestone adds an AWS service, widen `deploy_prod` (and the boundary, if Lambdas need it)
here and apply locally **before** merging the PR that uses it.

## Steps

```bash
cd infra/bootstrap
export AWS_PROFILE=boutique
aws sso login
aws sts get-caller-identity                     # must show 239280166667

terraform init
terraform plan        # expect 15 to add
terraform apply
```

Then move the state into the bucket it just created:

1. In `versions.tf`, uncomment the `backend "s3"` block (the bucket name is already filled in).
2. `terraform init -migrate-state` and answer `yes`.
3. Delete the local `terraform.tfstate*` files (they're git-ignored, but don't keep stale copies).

Then connect GitHub:

1. Repo **Settings → Secrets and variables → Actions → Variables** (variables, not secrets; role ARNs aren't secret):
   - `AWS_DEPLOY_ROLE_ARN` = output `github_deploy_role_arn`
   - `AWS_PLAN_ROLE_ARN` = output `github_plan_role_arn`
2. **Actions → verify-aws → Run workflow** on `main`. The last step should print the `github-deploy` role in the boutique account.

Finally, check that `boutique-monthly` shows under **Billing and Cost Management → Budgets** in the boutique account. Alerts go straight to the email in `alert_email`; there's nothing to confirm.
