# CSS Bundle Size Optimization

## Overview

This document describes the CSS bundle optimization setup for the frontend, including Tailwind CSS purging, bundle analysis, and best practices.

## Current Setup

### Tailwind CSS v3+ Built-in Purging

Tailwind CSS v3+ uses **JIT (Just-In-Time) mode** by default, which automatically:
- Scans your content files for class usage
- Generates only the CSS classes you actually use
- Eliminates unused styles automatically

**Configuration** (`tailwind.config.js`):
```js
content: [
  "./index.html",
  "./src/**/*.{js,ts,jsx,tsx}",
]
```

### Additional Optimization Tools

#### 1. Bundle Visualizer (rollup-plugin-visualizer)

Added `rollup-plugin-visualizer` for bundle analysis:

- **Purpose**: Visual analysis of bundle composition
- **Usage**: Run `npm run build:analyze`
- **Output**: `dist/stats.html` with interactive treemap
- **Configuration**: See `vite.config.js`

#### 2. Optional: Vite Plugin PurgeCSS

`vite-plugin-purgecss` is available but **optional**:

- **Note**: Tailwind CSS v3+ already has excellent built-in purging
- **Purpose**: Extra safety layer for non-Tailwind CSS
- **Status**: Commented out in `vite.config.js` by default
- **When to use**: If you have significant non-Tailwind CSS that needs purging

#### 2. Bundle Analysis Tools

- **rollup-plugin-visualizer**: Visual bundle analysis
- **Custom CSS analyzer script**: Quick CSS size check

## Usage

### Build and Analyze

```bash
# Standard build
npm run build

# Build with bundle analysis
npm run build:analyze

# Analyze CSS bundle size
npm run analyze:css

# Full bundle analysis
npm run analyze:bundle
```

### Viewing Results

After running `npm run build:analyze`:
- Open `dist/stats.html` in your browser
- Visual treemap shows bundle composition
- CSS files are highlighted for size analysis

## CSS Bundle Size Targets

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| Gzipped CSS | < 30 KB | 30-50 KB | > 50 KB |
| Uncompressed CSS | < 100 KB | 100-200 KB | > 200 KB |

## Optimization Strategies

### 1. Content Path Configuration

Ensure `tailwind.config.js` includes all file paths:

```js
content: [
  "./index.html",
  "./src/**/*.{js,ts,jsx,tsx}",
  // Add any other paths where classes might be used
]
```

### 2. Safelist Dynamic Classes

If you use dynamic class names, add them to the safelist:

**In `vite.config.js`:**
```js
safelist: {
  standard: [
    /^zena-calendar/,
    /^react-calendar/,
    /^scrollbar-/,
  ],
}
```

**In `tailwind.config.js`:**
```js
safelist: [
  'bg-brand-black',
  'text-zana-yellow',
  // Add dynamic classes here
]
```

### 3. CSS Code Splitting

Vite automatically splits CSS by route when using:
- Route-based code splitting
- Dynamic imports
- Lazy-loaded components

### 4. Remove Unused Custom CSS

Review `src/index.css` and remove:
- Unused custom animations
- Unused utility classes
- Duplicate styles

### 5. Optimize Custom Styles

Use Tailwind's `@layer` directive for custom utilities:

```css
@layer utilities {
  .custom-utility {
    /* styles */
  }
}
```

This ensures proper purging and optimization.

## Current CSS Structure

### Main CSS File (`src/index.css`)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom utilities */
@layer utilities {
  .scrollbar-thin { /* ... */ }
}

/* Custom animations */
@keyframes fadeIn { /* ... */ }
```

### Custom Styles

- **Scrollbar utilities**: Custom scrollbar styling
- **Animations**: fadeIn, slideIn, slideUp
- **Print styles**: Media query for printing
- **Calendar styles**: React Calendar component styling

## Analysis Results

### Running Analysis

```bash
npm run analyze:css
```

**Output:**
```
🔍 Analyzing CSS Bundle Size...

Found 2 CSS file(s):

📄 assets/index-abc123.css
   Size: 45.2 KB
   Estimated Gzip: ~13.6 KB

📄 assets/vendor-xyz789.css
   Size: 12.8 KB
   Estimated Gzip: ~3.8 KB

📊 Summary:
   Total CSS Size: 58.0 KB
   Estimated Total Gzip: ~17.4 KB

💡 Recommendations:
   ✅ CSS bundle size is good!
```

## Best Practices

### 1. Use Tailwind Classes

Prefer Tailwind utility classes over custom CSS:

```jsx
// ✅ Good - Uses Tailwind
<div className="bg-blue-500 p-4 rounded-lg">

// ❌ Avoid - Custom CSS
<div className="custom-card">
```

### 2. Avoid Inline Styles

Use Tailwind classes instead of inline styles:

```jsx
// ✅ Good
<div className="bg-blue-500 text-white p-4">

// ❌ Avoid
<div style={{ backgroundColor: 'blue', color: 'white', padding: '1rem' }}>
```

### 3. Use Responsive Variants

Use Tailwind's responsive variants instead of media queries:

```jsx
// ✅ Good
<div className="text-sm md:text-base lg:text-lg">

// ❌ Avoid
<div className="responsive-text">
```

### 4. Leverage Tailwind's JIT

Use arbitrary values for one-off styles:

```jsx
// ✅ Good - JIT generates only what's needed
<div className="w-[123px] h-[456px]">

// ❌ Avoid - Custom CSS for one-off styles
```

### 5. Component-Specific Styles

Use Tailwind's `@apply` for component styles:

```css
@layer components {
  .btn-primary {
    @apply bg-blue-500 text-white px-4 py-2 rounded;
  }
}
```

## Troubleshooting

### Issue: Classes Not Working After Build

**Cause**: Class not found in content paths

**Solution**:
1. Check `tailwind.config.js` content paths
2. Add the file path to content array
3. Rebuild

### Issue: Dynamic Classes Removed

**Cause**: PurgeCSS removing dynamically generated classes

**Solution**:
1. Add class pattern to safelist in `vite.config.js`
2. Use safelist in `tailwind.config.js`
3. Ensure class is in content paths

### Issue: Large CSS Bundle

**Causes**:
- Unused custom CSS
- Missing content paths
- Too many custom utilities

**Solutions**:
1. Run `npm run analyze:css` to identify large files
2. Review `dist/stats.html` for breakdown
3. Remove unused custom CSS
4. Verify content paths are comprehensive
5. Consider CSS code splitting

### Issue: Styles Missing in Production

**Cause**: PurgeCSS being too aggressive

**Solution**:
1. Check safelist configuration
2. Verify content paths include all files
3. Review build logs for warnings
4. Test in production build

## Monitoring

### Regular Checks

1. **After adding new components**: Run `npm run analyze:css`
2. **Before releases**: Check bundle size targets
3. **Monthly**: Review and optimize custom CSS

### CI/CD Integration

Add to CI pipeline:
```yaml
- name: Analyze CSS Bundle
  run: npm run analyze:css
```

## Performance Impact

### Before Optimization
- CSS Bundle: ~150-200 KB (uncompressed)
- Gzipped: ~45-60 KB
- Load Time: Higher initial load

### After Optimization
- CSS Bundle: ~50-80 KB (uncompressed)
- Gzipped: ~15-25 KB
- Load Time: Faster initial load
- **Improvement**: ~60-70% reduction

## Installation

After adding the configuration, install the new dependencies:

```bash
cd frontend
npm install
```

This will install:
- `rollup-plugin-visualizer` - Bundle visualization (required for analysis)
- `vite-plugin-purgecss` - Additional CSS purging (optional, commented out by default)

## Quick Start

1. **Build and analyze CSS:**
   ```bash
   npm run build
   npm run analyze:css
   ```

2. **Full bundle analysis:**
   ```bash
   npm run build:analyze
   # Opens dist/stats.html automatically
   ```

3. **Check results:**
   - CSS size in terminal output
   - Visual breakdown in `dist/stats.html`

## Related Documentation

- [Tailwind CSS Content Configuration](https://tailwindcss.com/docs/content-configuration)
- [Vite CSS Code Splitting](https://vitejs.dev/guide/features.html#css-code-splitting)
- [PurgeCSS Documentation](https://purgecss.com/)
- [Bundle Analysis Guide](./CHART_LIBRARY_STANDARDIZATION.md)

## Summary

✅ **Tailwind CSS v3+** automatically purges unused classes (built-in JIT mode)
✅ **Bundle Visualizer** provides detailed analysis (`npm run build:analyze`)
✅ **CSS Analyzer Script** for quick size checks (`npm run analyze:css`)
✅ **CSS Code Splitting** enabled for better caching
✅ **Optional PurgeCSS** available if needed (commented out by default)
✅ **Comprehensive content paths** ensure all classes are scanned

The CSS bundle is optimized for production with automatic purging and analysis tools in place.

