# Performance Baseline — Phase 1 Complete

**Date**: 2026-07-30
**Build time**: 58.81s

## Bundle Sizes (Phase 1 baseline)

| Chunk | Raw | Gzipped | Notes |
|---|---|---|---|
| `index` (main entry) | 375.53 KB | 100.29 KB | App code + styles |
| `react-vendor` | 205.46 KB | 66.93 KB | React, ReactDOM, Redux, Router |
| `chart-vendor` | 435.59 KB | 115.01 KB | Recharts (lazy-loaded) |
| `xlsx` | 429.67 KB | 143.27 KB | Excel export (lazy-loaded) |
| `jspdf` | 357.52 KB | 117.93 KB | PDF generation (lazy-loaded) |
| `html2canvas` | 201.43 KB | 48.04 KB | Screenshot (lazy-loaded) |
| `ui-vendor` | 41.04 KB | 13.98 KB | HeadlessUI, Heroicons |

## Performance Budget Targets

| Metric | Target | Status |
|---|---|---|
| JS Bundle (main, gzip) | < 300 KB | ⚠️ 100 KB (main) — OK, but vendor chunks large |
| LCP | < 2.5s | TBD (needs running server) |
| CLS | < 0.1 | TBD |
| FID | < 100ms | TBD |
| Lighthouse Accessibility | > 95 | TBD |
