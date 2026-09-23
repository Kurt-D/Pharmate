# CI/CD and approved releases

`ci.yml` verifies every pull request and main-branch push using `npm ci`, lint,
dependency audit, server tests, and a production client build. A successful run
creates a versioned release artifact tied to its commit SHA.

`production-release.yml` is manual and uses GitHub's `production` Environment.
Configure required reviewers, then add only these environment secrets:
`DEPLOY_HOST`, `DEPLOY_USER`, and `DEPLOY_SSH_KEY`. The workflow transfers the
selected CI artifact to the VPS; it never runs `git pull` or deploys an
unverified working tree.

On the VPS, create `/var/www/pharmate/shared/server.env` with restrictive file
permissions and configure Nginx/PM2 to point to `/var/www/pharmate/current`.
Keep only a tested set of prior release directories for rollback. Do not store
production secrets in GitHub repository variables or the artifact.
