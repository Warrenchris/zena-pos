# ZANA POS — GitHub Copilot Engineering Instructions

**Version:** 2.0.0  
**Project:** Zana POS  
**Classification:** Project-wide Engineering Standards  
**Applies to:** All developers, AI agents, Copilot sessions and automated development workflows.

---

# 1. PROJECT IDENTITY

Zana POS is a business management and financial intelligence platform designed for African SMEs.

It combines:

- Point of Sale (POS)
- Enterprise Resource Management (ERM)
- Customer Relationship Management (CRM)
- Inventory and warehouse management
- Purchasing and supplier management
- Financial management
- Business analytics and reporting
- AI-powered financial assistance and forecasting
- Multi-tenant SaaS management
- Branch and shop management
- Mobile-friendly business operations

The product must prioritize reliability, financial accuracy, security, usability and operational efficiency.

**Engineering objective:** Build production-grade business software, not merely functional demonstrations.

# 2. TECHNOLOGY STACK

Use the existing project architecture as the source of truth.

| Layer | Technology |
|---|---|
| Frontend | React, Vite, JavaScript/TypeScript |
| Styling | Tailwind CSS |
| Backend | Node.js, Express |
| Database | MySQL |
| ORM | Sequelize |
| AI services | Python, FastAPI |
| Authentication | JWT |
| Payments | Safaricom M-Pesa Daraja |
| Deployment | Docker and supported hosting infrastructure |
| Testing | Existing project test frameworks |

Do not introduce alternative frameworks, databases, dependencies or architectural patterns without establishing a clear technical justification.

Never assume that a technology mentioned here is implemented in every module. Verify the actual repository.

# 3. CORE ENGINEERING PRINCIPLES

Every implementation must follow these principles:

1. Preserve existing functionality.
2. Maintain backward compatibility.
3. Prioritize data integrity over implementation speed.
4. Follow established architectural patterns.
5. Avoid unnecessary dependencies.
6. Use modular, maintainable code.
7. Implement appropriate error handling.
8. Avoid duplicated business logic.
9. Protect sensitive information.
10. Write tests for meaningful changes.
11. Avoid speculative implementations.
12. Never conceal errors using artificial fallback values.

Do not introduce breaking changes without explicit approval.

# 4. MANDATORY DEVELOPMENT WORKFLOW

Every engineering task must follow this workflow.

## Phase A — Understand

Before making changes:

- Inspect the repository structure.
- Identify the relevant frontend, backend and AI components.
- Read existing implementations.
- Inspect related API endpoints.
- Understand database relationships.
- Identify existing dependencies.
- Check relevant documentation.
- Identify affected workflows.

Do not modify files before understanding their responsibilities.

## Phase B — Audit

Investigate the requested change.

Identify:

- Existing implementation.
- Root cause of the issue.
- Affected modules.
- Dependencies.
- Security implications.
- Database implications.
- Backward compatibility risks.
- Regression risks.
- Required tests.

Distinguish confirmed findings from assumptions.

## Phase C — Plan

Present an implementation plan containing:

1. Problem statement.
2. Root cause.
3. Proposed solution.
4. Files to be modified.
5. Database changes, if applicable.
6. API changes, if applicable.
7. Security considerations.
8. Testing strategy.
9. Rollback considerations.

## Phase D — Authorization Gate

Follow the user's authorization precisely.

- **AUDIT ONLY:** Inspect, investigate and report. Do not modify files.
- **PLAN ONLY:** Produce an implementation plan. Do not modify files.
- **IMPLEMENT:** Implement only the authorized scope.
- **FULL AUTHORIZATION:** Execute the explicitly approved scope, including necessary testing.

Never interpret an audit request as implementation permission.

If the requested change introduces an unexpected high-risk dependency, migration or architectural change, stop and request approval.

## Phase E — Implementation

When authorized:

- Make focused changes.
- Follow existing conventions.
- Avoid unrelated refactoring.
- Preserve existing API contracts.
- Add appropriate validation.
- Implement appropriate error handling.
- Update tests.
- Update documentation where necessary.

## Phase F — Verification

After implementation:

- Run relevant automated tests.
- Run linting and type checks where available.
- Verify affected API endpoints.
- Check database consistency.
- Test relevant user workflows.
- Check browser console errors.
- Check network requests.
- Check responsive layouts where relevant.
- Report any failures.

Never claim that something was tested if it was not actually tested.

## Phase G — Final Report

Provide:

- Changes implemented.
- Files modified.
- Tests executed.
- Test results.
- Remaining issues.
- Security implications.
- Deployment considerations.

Clearly distinguish completed work from recommendations.

# 5. MULTI-TENANT SAAS ARCHITECTURE

Multi-tenancy is a fundamental architectural requirement.

The organization is the primary SaaS ownership boundary.

Expected relationships include:

- Organization
- Shops and branches
- Organization members
- Subscriptions
- SaaS billing
- Master product catalog
- Customer directory

Shop-level operations include:

- Inventory quantities.
- POS terminals.
- Sales.
- Purchases.
- Local stock movements.
- Shop-specific payment configurations.

## Mandatory isolation requirements

Every organization-owned resource must be properly scoped.

Every shop-owned resource must be properly scoped.

Never trust a `shopId`, `organizationId`, `userId` or similar identifier supplied by the frontend without server-side authorization.

Verify:

- Tenant ownership.
- User membership.
- Role permissions.
- Shop access.
- Resource ownership.
- Cross-tenant access prevention.

Do not rely solely on frontend visibility restrictions.

Never allow one organization to read or modify another organization's records.

Existing single-shop installations must remain functional during SaaS evolution.

# 6. SECURITY STANDARDS

Security must be enforced throughout the application.

## Authentication

- Validate JWT signatures.
- Verify token expiration.
- Enforce issuer and audience where configured.
- Reject invalid or revoked sessions.
- Apply consistent authentication middleware.
- Protect sensitive endpoints.

## Authorization

- Apply role-based and permission-based authorization.
- Enforce permissions on the backend.
- Avoid trusting frontend role information.
- Verify ownership of requested resources.
- Prevent privilege escalation.

## Input validation

Validate:

- Request bodies.
- Query parameters.
- URL parameters.
- Uploaded files.
- Numeric values.
- Dates.
- Identifiers.

Use parameterized database operations.

Prevent SQL injection, XSS, CSRF where applicable, IDOR and parameter tampering.

## Secrets

Never hardcode:

- Database credentials.
- JWT secrets.
- M-Pesa credentials.
- AI provider keys.
- API tokens.

Use environment variables and the established secrets-management approach.

Never expose secrets through logs, API responses or frontend bundles.

# 7. POS TRANSACTION INTEGRITY

POS transactions are financially critical.

Every transaction must maintain consistent financial and inventory records.

Mandatory requirements:

- Database transactions for related financial operations.
- Atomic stock deductions.
- Correct quantity validation.
- Accurate totals and discounts.
- Correct tax calculations where configured.
- Idempotent transaction processing.
- Duplicate submission protection.
- Proper rollback on failure.
- Consistent sale and payment records.
- Accurate transaction references.

Never allow a partially completed transaction to leave inconsistent financial or inventory records.

## Payment integrity

Payment state must distinguish between:

- Pending.
- Successful.
- Failed.
- Cancelled.
- Reversed.
- Partially paid.
- Credit or outstanding balance, where supported.

Do not mark a payment as successful based solely on frontend confirmation.

# 8. MPESA INTEGRATION

M-Pesa integrations must follow Daraja's documented behavior.

Requirements:

- Secure credential handling.
- Server-side payment initiation.
- Callback verification and correlation.
- Idempotent callback processing.
- Duplicate callback protection.
- Accurate payment status transitions.
- Proper transaction references.
- Error and timeout handling.
- Reconciliation support.

Each shop's payment configuration must remain properly isolated.

Never assume that receiving a callback automatically means a payment has been successfully reconciled.

# 9. DATABASE ENGINEERING

MySQL and Sequelize are the established database technologies.

Follow these standards:

- Use migrations for schema changes.
- Preserve existing data.
- Define appropriate indexes.
- Maintain foreign-key relationships.
- Use appropriate database constraints.
- Avoid unnecessary schema duplication.
- Check query performance.
- Preserve transaction boundaries.
- Consider concurrency and race conditions.

Do not use automatic schema synchronization as a production migration strategy.

Do not execute destructive SQL without explicit authorization.

Before migrations, assess:

- Existing records.
- Nullability.
- Default values.
- Foreign keys.
- Unique constraints.
- Indexes.
- Rollback feasibility.

# 10. INVENTORY AND PURCHASING

Inventory must remain consistent across sales, purchases, returns and stock adjustments.

Verify:

- Stock movements.
- Purchase receiving.
- Supplier relationships.
- Branch-level stock ownership.
- SKU and barcode uniqueness rules.
- Stock valuation.
- Returns.
- Damaged goods.
- Concurrent stock updates.

Receiving a purchase must not silently create duplicate inventory entries.

Stock adjustments must have traceable reasons and appropriate authorization.

# 11. FRONTEND AND UI/UX STANDARDS

The interface should feel like a mature commercial SaaS product.

Design references:

- Stripe
- Linear
- Ramp
- Vercel
- Shopify

Prioritize:

- Clear information hierarchy.
- Consistent spacing.
- Responsive layouts.
- Accessible controls.
- Good typography.
- Meaningful loading states.
- Useful empty states.
- Clear error messages.
- Consistent notifications.
- Proper dark-mode support.

Avoid:

- Generic AI-generated layouts.
- Excessive gradients.
- Unnecessary glassmorphism.
- Excessive blur.
- Decorative animations.
- Unnecessary visual complexity.
- Inconsistent components.

Never sacrifice usability for visual appearance.

Preserve established design tokens and component conventions.

# 12. AI AND FINANCIAL INTELLIGENCE

AI services must produce reliable, explainable and appropriately grounded results.

Requirements:

- Validate input data.
- Verify calculations independently.
- Handle insufficient historical data.
- Avoid fabricated business figures.
- Distinguish actual values from predictions.
- Provide appropriate uncertainty information.
- Protect customer and financial information.
- Handle provider failures gracefully.

AI-generated recommendations must never silently modify financial records, inventory or payment states.

All critical financial calculations must be performed and validated using deterministic business logic.

# 13. RECEIPTS, PRINTING AND EXPORTS

Preserve existing receipt-printing functionality.

**Protected thermal-printing boundary:**

Do not modify the following without explicit authorization:

- `src/printing/`
- ESC/POS rasterization.
- Bluetooth Android printing integration.
- 58mm and 80mm thermal receipt templates.
- Credit note thermal-print models.
- `printStoredSale`.
- `#pos-receipt-print-area`.

Non-thermal document exports must preserve established document standards.

Use the existing business identity and shop-specific details.

Maintain appropriate currency formatting, dates, transaction references and financial accuracy.

Never introduce hardcoded business identities into customer-facing documents.

# 14. TESTING AND QUALITY ASSURANCE

Testing must reflect actual business workflows.

Prioritize:

- Unit tests.
- Integration tests.
- API tests.
- Database tests.
- Authentication tests.
- Authorization tests.
- Multi-tenant isolation tests.
- POS transaction tests.
- Payment callback tests.
- Inventory tests.
- Browser-based end-to-end tests.

For financially critical workflows, include:

- Duplicate requests.
- Concurrent requests.
- Invalid inputs.
- Unauthorized access.
- Partial failures.
- Database rollback.
- Retry scenarios.
- Network interruptions.

Do not weaken existing tests merely to make an implementation pass.

Do not remove failing tests without an approved justification.

# 15. LIVE BROWSER TESTING

When browser-testing tools are available and relevant:

- Launch the actual application.
- Authenticate using authorized test accounts.
- Navigate through real workflows.
- Inspect browser console errors.
- Inspect failed network requests.
- Verify form validation.
- Test user permissions.
- Verify responsive behavior.
- Test critical transaction flows.

Use test data and non-production environments.

Never perform destructive actions on live customer data.

Do not claim browser verification when only static code inspection was performed.

# 16. GIT AND CHANGE MANAGEMENT

Before modifying the repository:

- Inspect the current branch.
- Check working-tree status.
- Identify existing uncommitted changes.
- Avoid overwriting unrelated work.

Never:

- Force-push without authorization.
- Delete branches without authorization.
- Rewrite commit history without authorization.
- Commit secrets.
- Discard user changes.
- Reset the working tree indiscriminately.

Use focused commits with meaningful messages when committing is authorized.

# 17. DOCUMENTATION

Keep documentation synchronized with actual implementation.

Update relevant documentation when changing:

- API contracts.
- Database schema.
- Environment variables.
- Authentication.
- Permissions.
- Deployment.
- Business workflows.
- Integration behavior.

Do not document functionality that has not been implemented or verified.

# 18. FINAL ENGINEERING RULE

Always optimize for:

1. Financial correctness.
2. Security.
3. Data integrity.
4. Backward compatibility.
5. Maintainability.
6. Performance.
7. User experience.

When uncertain, investigate before implementing.

When a change risks financial records, tenant isolation, payment integrity or protected functionality, stop and seek clarification.

**The objective is to engineer Zana POS as a secure, dependable, scalable business platform that can be trusted with real business operations.**