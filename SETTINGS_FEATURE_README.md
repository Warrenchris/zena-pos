# Settings Module & System Configuration Documentation

## Overview

The Settings feature provides a comprehensive system configuration interface for the Zana POS platform. Delivered across four methodical implementation sprints, it allows administrators to manage business profiles, POS checkout parameters, receipt templates, M-Pesa payment credentials with AES-256-CBC encryption, security policies, interactive role-permission matrices, auto-generated SKU/barcode catalogs, and notification preferences.

---

## 🚀 Sprint-by-Sprint Implementation Summary

### 🛒 Sprint 1: POS Configuration Essentials
- **Tax/VAT Rate Setting**: Added `taxRate` decimal column to `SystemSettings`. Integrated dynamic checkout tax calculations into `POSModal.jsx`.
- **Receipt Customization**: Added `receiptHeader`, `receiptFooter`, `showLogoOnReceipt`, `printerType`, and `printerIP` fields to `SystemSettings`. Applied custom headers, footers, and logos to printed receipts in `SaleDetailModal.jsx`.
- **Payment Methods & Encrypted M-Pesa Config**: Added `paybillNumber`, `tillNumber`, `consumerKey`, `consumerSecret`, `passkey`, and `enabledPaymentMethods`. Built AES-256-CBC encryption utility ([encryption.js](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/utils/encryption.js)) storing credentials safely in the DB and masking secrets (`****1234`) on GET requests.

### 🛡️ Sprint 2: Security & Account Management
- **KRA PIN & Business Registration**: Added `kraPin` and `registrationNumber` to `Shops` model and updated company settings UI.
- **Password Change Endpoint**: Implemented `POST /api/auth/change-password` requiring current password verification before hashing and saving new credentials with bcrypt.
- **Logo Upload & XSS Prevention**: Built `POST /api/settings/logo` endpoint using `multer` with a 2MB size limit. Hardened MIME type validation to allow only safe raster image formats (`JPEG`, `PNG`, `WEBP`, `GIF`) and **explicitly dropped SVG** to prevent stored XSS vectors.

### 🔐 Sprint 3: Roles & Permissions Matrix
- **Granular Permission Matrix API**: Created `GET /api/permissions/matrix` and `PUT /api/permissions/matrix` in [permissionController.js](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/controllers/permissionController.js) with auto-seeding for 14 granular system permissions.
- **Self-Lockout Protection**: Implemented backend validation enforcing that `manage_settings` and `manage_users` cannot be stripped from the `admin` role.
- **Interactive UI Matrix**: Created [RolePermissionMatrix.jsx](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/frontend/src/components/RolePermissionMatrix.jsx) with role column headers, diff tracking, and save confirmation.
- **Privilege Escalation Hardening**: Gated `/api/permissions/matrix` routes strictly to `req.user.role === 'admin'`, preventing manager roles from escalating their own privileges.

### 📦 Sprint 4: Inventory & Notifications Quick Wins
- **Global Low-Stock Fallback**: Added `lowStockThreshold` (default 10) to `SystemSettings`. Updated low-stock calculation logic across [insightsController.js](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/controllers/insightsController.js) and [ManageStock.jsx](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/frontend/src/pages/ManageStock.jsx) to evaluate `product.reorderPoint` with a fallback to `lowStockThreshold`.
- **Auto SKU & Barcode Generation**: Built [skuGenerator.js](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/utils/skuGenerator.js) featuring hand-rolled EAN-13 check-digit calculation, UPC-A, and CODE128 generators. Wired auto-generation into product creation when SKU or barcode fields are left blank.
- **AI Digest Frequency Preference**: Added `aiDigestFrequency` (`none`, `daily`, `weekly`) to `SystemSettings` and exposed dropdown controls under the Notifications tab.

---

## 🗄️ Database Migrations Summary

| Migration File | Added Fields | Table |
|---|---|---|
| `20260811000000-add-pos-and-payment-settings.js` | `taxRate`, `receiptHeader`, `receiptFooter`, `showLogoOnReceipt`, `printerType`, `printerIP`, `paybillNumber`, `tillNumber`, `consumerKey`, `consumerSecret`, `passkey`, `enabledPaymentMethods` | `SystemSettings` |
| `20260811000001-add-kra-pin-to-shops.js` | `kraPin`, `registrationNumber` | `Shops` |
| `20260811000002-add-inventory-and-ai-settings.js` | `lowStockThreshold`, `skuPrefix`, `barcodeFormat`, `aiDigestFrequency` | `SystemSettings` |

---

## 🧪 Integration Test Suite Summary

All sprint integration test scripts run cleanly against the dev database with **100% pass rate**:

```bash
# Run all sprint integration tests
node backend/test-sprint-settings.js    # ✅ POS Config & M-Pesa Encryption
node backend/test-sprint2-settings.js   # ✅ Password Change & Logo Upload
node backend/test-sprint3-settings.js   # ✅ Roles Matrix & Lockout Prevention
node backend/test-sprint4-settings.js   # ✅ SKU/EAN-13 Generator & Low-Stock Fallback
```

---

## 📋 Production Deployment & Backlog Checklist

### 🔑 Production Deployment Requirements
1. **`ENCRYPTION_SECRET` Requirement**: Ensure `ENCRYPTION_SECRET` (a 32-character hexadecimal string or 256-bit key) is set in your production environment variables (`.env`). The backend will throw a fatal error on startup if this secret is missing.
   ```bash
   # Generate key command
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. **`uploads/` Folder Permissions**: Ensure the `backend/public/uploads` directory has write permissions for Multer file uploads.
3. **Static File Serving**: Confirm reverse proxies (Nginx / Cloudflare) forward `/uploads/` requests cleanly to Node static middleware.

### 📌 Backlog Tickets & Future Scope
- **[BACKLOG-01] AI Digest Cron Runner**: `aiDigestFrequency` preference is stored in `SystemSettings`. A future cron job ticket should schedule daily/weekly email generation consuming this setting.
- **[BACKLOG-02] Session Management / Token Revocation**: Password changes invalidate active sessions via local state. A future Redis token blacklist or `passwordChangedAt` middleware check can be added if shorter JWT TTLs are desired.
- **[BACKLOG-03] Multi-Device Logout**: Session list viewer / active session revocation on secondary devices.

---

**Version**: 2.0.0 (Full Settings Module Implemented)  
**Last Updated**: August 2026  
**Compatibility**: Zana POS v1.0+
