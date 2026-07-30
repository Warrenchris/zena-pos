/**
 * ChartTheme — Centralized configuration for all Recharts visualizations
 * Enforces Zana POS semantic color system and WCAG AA contrast standards.
 */

export const CHART_COLORS = {
  primary: '#FFD600',   // Gold accent
  secondary: '#38BDF8', // Sky blue
  success: '#22C55E',   // Emerald green
  warning: '#F59E0B',   // Amber
  purple: '#A855F7',    // Purple
  danger: '#EF4444',    // Red
};

export const CHART_PALETTE = [
  CHART_COLORS.primary,
  CHART_COLORS.secondary,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.purple,
  CHART_COLORS.danger,
];

export const chartDefaults = {
  grid: {
    stroke: 'rgba(255, 214, 0, 0.08)',
    strokeDasharray: '4 4',
  },
  xAxis: {
    stroke: 'rgba(255, 214, 0, 0.2)',
    tick: { fill: '#9CA3AF', fontSize: 12, fontFamily: 'Inter, sans-serif' },
    tickLine: false,
  },
  yAxis: {
    stroke: 'rgba(255, 214, 0, 0.2)',
    tick: { fill: '#9CA3AF', fontSize: 12, fontFamily: 'Inter, sans-serif' },
    tickLine: false,
  },
  tooltip: {
    contentStyle: {
      backgroundColor: '#1F2126', // surface-3
      borderColor: 'rgba(255, 214, 0, 0.2)',
      borderRadius: '10px',
      color: '#F9FAFB',
      boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
      padding: '12px 16px',
    },
    itemStyle: {
      color: '#F9FAFB',
      fontSize: '14px',
      fontWeight: 500,
    },
    labelStyle: {
      color: '#FFD600',
      fontSize: '12px',
      fontWeight: 600,
      marginBottom: '4px',
    },
  },
};

export default chartDefaults;
