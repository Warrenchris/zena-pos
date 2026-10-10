# Branch Protection Guide (`master`)

This document specifies the exact GitHub Branch Protection settings and required status checks for `Warrenchris/zena-pos` after merging `ci/hardening`.

---

## 1. Required Status Check Job Names

GitHub branch protection matches the **job `name:`** (or job key if `name:` is omitted) defined in `.github/workflows/*.yml`:

| Workflow File | Workflow `name:` | Exact Required Status Check Name (`job.name`) | Trigger Scope |
| :--- | :--- | :--- | :--- |
| `.github/workflows/backend-ci.yml` | `Backend CI` | **`Backend Test & Docker Validation`** | `backend/**`, `docker-compose.yml`, `docker-compose.prod.yml`, `.github/workflows/backend-ci.yml` |
| `.github/workflows/frontend-ci.yml` | `Frontend CI` | **`Frontend Build & Test`** | `frontend/**`, `docker-compose.yml`, `docker-compose.prod.yml`, `.github/workflows/frontend-ci.yml` |
| `.github/workflows/ai-service-ci.yml` | `AI Service CI` | **`AI Service Verification & Docker Build`** | `ai_service/**`, `.github/workflows/ai-service-ci.yml` |

> [!IMPORTANT]
> **Note on Path-Filtered Workflows & Required Status Checks:**
> Because all three CI workflows use `paths:` filters on `pull_request`, a PR that modifies only `frontend/**` will not trigger `Backend CI` or `AI Service CI`. If GitHub Branch Protection marks a path-filtered job as strictly required, GitHub will block merging PRs that do not touch that path with `"Expected — Waiting for status to be reported"`.
>
> To avoid stuck PRs, either:
> 1. Remove `paths:` filters from the `pull_request:` trigger (keeping `paths:` on `push:` if desired) before marking all 3 checks as required, **or**
> 2. Use GitHub Rulesets / Branch Protection with path filters removed for any check marked required.

---

## 2. Exact GitHub UI Settings (`Settings` → `Branches` → `Add branch protection rule`)

1. **Branch name pattern:** `master`
2. **Protect matching branches:**
   - [x] **Require a pull request before merging**
     - [x] **Require approvals:** `1` (optional for solo maintainer; enable before team/client handover)
     - [x] **Dismiss stale pull request approvals when new commits are pushed**
   - [x] **Require status checks to pass before merging**
     - [x] **Require branches to be up to date before merging** (optional; recommended if path filters are removed)
     - **Status checks that are required:**
       - `Backend Test & Docker Validation`
       - `Frontend Build & Test`
       - `AI Service Verification & Docker Build`
   - [x] **Require conversation resolution before merging**
   - [ ] **Do not allow bypassing the above settings** (leave unchecked if repo admin needs emergency bypass; enable for strict enforcement)
   - [ ] **Allow force pushes:** Disabled (unchecked)
   - [ ] **Allow deletions:** Disabled (unchecked)

---

## 3. Applying via GitHub CLI (`gh api`)

To inspect or apply branch protection on `master` via `gh`:

```bash
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/Warrenchris/zena-pos/branches/master/protection \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Backend Test & Docker Validation",
      "Frontend Build & Test",
      "AI Service Verification & Docker Build"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

---

## 4. Client Handover Note (`sentry-release.yml`)

- `.github/workflows/sentry-release.yml` currently has `if: github.repository_owner == 'Warrenchris'` on the `release` job (`Create Sentry Release & Commits`).
- Do **not** add `Create Sentry Release & Commits` as a required PR status check (it only runs on `push` to `master`/`main`).
- Before transferring repository ownership to the client, decide whether to remove `if: github.repository_owner == 'Warrenchris'` (the workflow already checks `SENTRY_AUTH_TOKEN` and skips cleanly when unset) or update the owner name to the client's GitHub organization.
