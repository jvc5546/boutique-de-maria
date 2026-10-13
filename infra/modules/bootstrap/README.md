# Bootstrap

One account's foundation, applied **locally** with your SSO admin login (never from CI, so CI can
never widen its own permissions):

- a **$5/month budget** with email alerts at 20%, 100%, and when the month is forecast to pass 100%
- the **Terraform state bucket** `bdm-tfstate-<account id>` (versioned, encrypted, private, TLS only)
- the **GitHub OIDC provider** and roles:
  - `github-plan` (prod only): pull requests, read-only, for the production plan in CI
  - `github-deploy`: only jobs in the GitHub environment `deploy_environment` (`production` needs your
    approval; `staging` runs on every pull request)
- the **workload boundary** `bdm-workload-boundary`: the most any Lambda role created by the site can do

When a milestone adds an AWS service, widen `deploy_prod` (and the boundary, if Lambdas need it)
here and apply to **both** accounts before merging the PR that uses it.

## Apply

```bash
cd infra/envs/<prod|staging>/bootstrap
cp terraform.tfvars.example terraform.tfvars    # fill in alert_email (git-ignored)
export AWS_PROFILE=boutique                      # boutique-staging for staging
aws sso login
terraform init
terraform plan
terraform apply
```

A brand-new account has no state bucket yet: apply once with the `backend "s3"` block commented
out, then uncomment it and run `terraform init -migrate-state`.
