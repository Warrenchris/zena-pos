import React from 'react';
import ProductScreenshot from './shared/ProductScreenshot';

export default function LandingDashboardMockup({ variant = 'light' }) {
  const isDark = variant === 'dark';

  const floatingMetrics = isDark
    ? [
        { label: 'Cloud Sync', value: 'Real-time connected', top: '12%', right: '-4%' },
        { label: 'Night Shift', value: 'Dark mode active', bottom: '16%', left: '-4%' },
      ]
    : [
        { label: "Today's Gross Sales", value: 'KES 148,250', top: '12%', right: '-4%' },
        { label: 'Low Stock Alert', value: '4 items need reorder', bottom: '16%', left: '-4%' },
      ];

  const screenshotSrc = isDark ? '/screenshots/dashboard-dark.png' : '/screenshots/dashboard.png';
  const screenshotAlt = isDark
    ? 'Zana POS Dark Mode Operational Dashboard with real-time sales overview and analytics'
    : 'Zana POS Main Management Dashboard with live sales trajectory, branch stats, and KPI cards';

  return (
    <ProductScreenshot
      variant={variant}
      floatingMetrics={floatingMetrics}
      src={screenshotSrc}
      alt={screenshotAlt}
    />
  );
}
