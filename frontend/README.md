# Zana POS Frontend

This package delivers the Zana POS user interface. The React app is built with Vite and Tailwind CSS and now ships with a mobile‑first, responsive experience that scales from 320 px phones to 4K workstations.

## Getting Started

- Install dependencies: `npm install`
- Run the dev server: `npm run dev`
- Build for production: `npm run build`
- Preview the production build: `npm run preview`
- Run unit tests: `npm test`

The app targets the browsers supported by the current Vite defaults. For best results, develop against a modern Chromium, Firefox, or Safari build.

## Responsive Design System

The UI follows a mobile‑first approach with custom breakpoints defined in `tailwind.config.js`.

| Token | Width Range | Usage |
| ----- | ----------- | ----- |
| `xs`  | 320px | Small phones |
| `sm`  | 480px | Large phones |
| `md`  | 768px | Tablets |
| `lg`  | 1024px | Laptops |
| `xl`  | 1440px | Desktops |
| `2xl` | 1920px | Large displays |
| `3xl` | 2560px | Ultra-wide |
| `4xl` | 3840px | 4K displays |

Global spacing and typography scales live in `src/index.css` under the `@layer base` block. Helper classes such as `.app-shell`, `.card-grid`, and `.responsive-table` provide consistent layout primitives without duplicating utility stacks.

### Layout & Navigation

- `Layout.jsx` handles the app shell, using responsive padding and safe-area support.
- `ModernSidebar.jsx` delivers an accessible off-canvas experience on mobile and a fixed sidebar on desktop.
- `TopNavBar.jsx` swaps between a hamburger navigation/search overlay on mobile and the full toolbar on larger screens.

### Component Guidelines

- Tables opt into the `.responsive-table` utility and expose `data-label` attributes so rows collapse into cards on narrow screens.
- Chart panels (example: `AnalyticsRevenue.jsx`) size with CSS `clamp()` to remain legible across devices.
- Buttons and interactive elements include the `.mobile-nav-trigger`/`.touch-target` helpers to meet the 44 px tap target guidance.

## Accessibility Checklist

- Use semantic containers (`<header>`, `<main>`, `<nav>`, `<section>`) and keep ARIA attributes up to date with state (`aria-expanded`, `aria-controls`, etc.).
- Provide visible focus states. Tailwind focus ring utilities are already configured for most buttons.
- Ensure contrast ratios stay above 4.5:1. When introducing new colors, verify with tooling such as the Chrome DevTools color picker.
- Keep keyboard navigation in mind; every interactive element must be reachable using `Tab` and `Shift+Tab`.

## Testing Responsiveness

1. Launch the app locally (`npm run dev`).
2. Open browser dev tools and use the device toolbar to test 320 px, 375 px, 768 px, 1024 px, 1440 px, and 1920 px widths in both orientations.
3. Confirm the following for each viewport:
   - No horizontal overflow (except purposeful table scroll containers).
   - Navigation is accessible and clearly labeled.
   - Tap targets remain ≥44 px.
   - Charts and tables remain readable without zooming.
4. Run `npm run build && npm run preview` to verify the production bundle and check Lighthouse scores (Performance, Accessibility, Best Practices ≥90).

## Performance Tips

- Prefer lazy loading for heavy analytics routes/components.
- Use the `ResponsiveContainer` components for charts (Recharts already supported) and leverage the utility classes for responsive images/assets (`<img srcset>` or `<picture>` as needed).
- Keep animations GPU-friendly and reduce motion for users who prefer it by honoring the `prefers-reduced-motion` media query when adding new effects.

## Contributing

1. Follow the responsive utilities already in place before introducing new custom CSS.
2. When creating new components, start from a single-column mobile layout and progressively enhance for larger breakpoints.
3. Update this document or add a dedicated pattern entry when shipping new reusable responsive primitives.
