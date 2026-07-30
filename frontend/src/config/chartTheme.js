/**
 * ChartTheme — Centralized configuration for all Recharts visualizations
 * Enforces Zana POS Enterprise Light SaaS design standards (Linear / Stripe style).
 */

export const CHART_COLORS = {
  primary:   '#D4A017', // Refined Gold
  secondary: '#0EA5E9', // Sky Blue
  success:   '#22C55E', // Emerald Green
  warning:   '#F59E0B', // Amber
  purple:    '#8B5CF6', // Purple
  danger:    '#EF4444', // Red
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
    stroke: '#F3F4F6',
    strokeDasharray: '4 4',
  },
  xAxis: {
    stroke: '#E5E7EB',
    tick: { fill: '#6B7280', fontSize: 12, fontFamily: 'Inter, sans-serif' },
    tickLine: false,
  },
  yAxis: {
    stroke: '#E5E7EB',
    tick: { fill: '#6B7280', fontSize: 12, fontFamily: 'Inter, sans-serif' },
    tickLine: false,
  },
  tooltip: {
    contentStyle: {
      backgroundColor: '#FFFFFF',
      borderColor: '#E5E7EB',
      borderRadius: '12px',
      color: '#111827',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)',
      padding: '12px 16px',
    },
    itemStyle: {
      color: '#111827',
      fontSize: '14px',
      fontWeight: 500,
    },
    labelStyle: {
      color: '#6B7280',
      fontSize: '12px',
      fontWeight: 600,
      marginBottom: '4px',
    },
  },
};

export default chartDefaults;
