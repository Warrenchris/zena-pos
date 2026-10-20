import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  SparklesIcon,
  ExclamationTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  LightBulbIcon,
} from '@heroicons/react/24/outline';

/**
 * Normalizes raw insights from GET /api/insights into a safe display model.
 * Safely handles missing/malformed shapes, filters out technical errors,
 * avoids duplicate entries, and never fabricates claims from raw trend points.
 */
export function normalizeInsights(insights) {
  if (!insights || typeof insights !== 'object' || Array.isArray(insights)) {
    return [];
  }

  const normalized = [];
  const seenKeys = new Set();

  const isTechnicalError = (text) => {
    if (typeof text !== 'string') return true;
    const lower = text.toLowerCase();
    return (
      lower.includes('error:') ||
      lower.includes('sqlite_') ||
      lower.includes('sequelize') ||
      lower.includes('traceback') ||
      lower.includes('exception') ||
      lower.includes('500 internal') ||
      lower.includes('undefined') ||
      lower.includes('null pointer')
    );
  };

  // 1. Normalize Alerts
  if (Array.isArray(insights.alerts)) {
    insights.alerts.forEach((alert, idx) => {
      if (!alert || typeof alert !== 'object' || Array.isArray(alert)) return;

      const rawType = typeof alert.type === 'string' ? alert.type.trim() : '';
      const rawSeverity = typeof alert.severity === 'string' ? alert.severity.trim().toLowerCase() : '';
      const rawTitle = typeof alert.title === 'string' ? alert.title.trim() : '';
      const rawDesc = typeof alert.description === 'string' ? alert.description.trim() : '';
      const rawMsg = typeof alert.message === 'string' ? alert.message.trim() : '';
      const rawRec = typeof alert.recommendation === 'string' ? alert.recommendation.trim() : '';

      const message = rawDesc || rawMsg || rawRec;
      if (!message || isTechnicalError(message)) return;

      let title = rawTitle;
      if (!title) {
        const typeLower = rawType.toLowerCase();
        if (typeLower === 'sales_anomaly') title = 'Unusual Sales Pattern';
        else if (typeLower === 'inventory') title = 'Inventory Alert';
        else if (typeLower === 'sales') title = 'Sales Performance Alert';
        else if (typeLower === 'customer') title = 'Customer Alert';
        else if (typeLower === 'market') title = 'Market Advisory';
        else if (rawType) title = `${rawType} Alert`;
        else title = 'Business Alert';
      }
      if (isTechnicalError(title)) return;

      let category = 'Alert';
      const typeLower = rawType.toLowerCase();
      if (typeLower === 'sales_anomaly') category = 'Anomaly';
      else if (typeLower === 'inventory') category = 'Inventory';
      else if (typeLower === 'sales') category = 'Sales';
      else if (typeLower === 'customer') category = 'Customer';
      else if (typeLower === 'market') category = 'Market';
      else if (rawType) category = rawType;

      let severity = 'info';
      if (rawSeverity === 'high' || rawSeverity === 'critical') severity = 'high';
      else if (rawSeverity === 'medium' || rawSeverity === 'warning') severity = 'medium';
      else if (rawSeverity === 'low') severity = 'low';

      const dedupKey = message.toLowerCase();
      if (seenKeys.has(dedupKey)) return;
      seenKeys.add(dedupKey);

      normalized.push({
        id: `alert-${rawType || 'alert'}-${idx}-${normalized.length}`,
        kind: 'alert',
        category,
        title,
        message,
        severity,
        recommendation: rawRec && rawRec !== message ? rawRec : null,
      });
    });
  }

  // 2. Normalize Recommendations
  if (Array.isArray(insights.recommendations)) {
    insights.recommendations.forEach((rec, idx) => {
      if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return;

      const rawType = typeof rec.type === 'string' ? rec.type.trim() : '';
      const rawPriority = typeof rec.priority === 'string' ? rec.priority.trim().toLowerCase() : '';
      const rawMsg = typeof rec.message === 'string' ? rec.message.trim() : '';

      if (!rawMsg || isTechnicalError(rawMsg)) return;

      const typeUpper = rawType.toUpperCase();
      let title = '';
      if (typeUpper === 'INVENTORY') title = 'Restock Recommendation';
      else if (typeUpper === 'FINANCIAL') title = 'Expense Recommendation';
      else if (typeUpper === 'FORECAST') title = 'Stock Depletion Forecast';
      else if (typeUpper === 'DECISION') title = 'Pricing Strategy';
      else if (typeUpper === 'AI') title = 'AI Recommendation';
      else if (rawType) title = `${rawType} Recommendation`;
      else title = 'Recommendation';

      if (isTechnicalError(title)) return;

      let category = 'Recommendation';
      if (typeUpper === 'INVENTORY') category = 'Inventory';
      else if (typeUpper === 'FINANCIAL') category = 'Financial';
      else if (typeUpper === 'FORECAST') category = 'Forecast';
      else if (typeUpper === 'DECISION') category = 'Pricing';
      else if (typeUpper === 'AI') category = 'AI Insights';
      else if (rawType) category = rawType;

      let severity = 'info';
      if (rawPriority === 'high' || rawPriority === 'critical') severity = 'high';
      else if (rawPriority === 'medium' || rawPriority === 'warning') severity = 'medium';
      else if (rawPriority === 'low') severity = 'low';

      const dedupKey = rawMsg.toLowerCase();
      if (seenKeys.has(dedupKey)) return;
      seenKeys.add(dedupKey);

      normalized.push({
        id: `rec-${rawType || 'rec'}-${idx}-${normalized.length}`,
        kind: 'recommendation',
        category,
        title,
        message: rawMsg,
        severity,
      });
    });
  }

  // 3. Optional Trends (only if an existing textual message is present)
  if (Array.isArray(insights.trends)) {
    insights.trends.forEach((trend, idx) => {
      if (!trend || typeof trend !== 'object' || Array.isArray(trend)) return;
      const message = typeof trend.message === 'string' ? trend.message.trim() : '';
      const title = typeof trend.title === 'string' ? trend.title.trim() : 'Sales Trend';
      if (message && !isTechnicalError(message) && !isTechnicalError(title)) {
        const dedupKey = message.toLowerCase();
        if (!seenKeys.has(dedupKey)) {
          seenKeys.add(dedupKey);
          normalized.push({
            id: `trend-${idx}-${normalized.length}`,
            kind: 'trend',
            category: 'Trend',
            title,
            message,
            severity: 'info',
          });
        }
      }
    });
  }

  return normalized;
}

const severityBadgeStyles = {
  high: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  low: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  info: 'bg-primary/10 text-primary border-primary/20',
};

const ROTATION_INTERVAL_MS = 30000;

export default function DashboardInsightsCarousel({
  insights,
  loading = false,
  error = null,
  onRetry,
  className = '',
}) {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const items = useMemo(() => normalizeInsights(insights), [insights]);

  // Safely clamp active index whenever items change or shrink
  useEffect(() => {
    if (items.length === 0) {
      setCurrentIndex(0);
    } else if (currentIndex >= items.length) {
      setCurrentIndex(0);
    }
  }, [items.length, currentIndex]);

  // Auto-rotate every 30,000 ms only when >= 2 eligible insights, paused on hover/focus
  useEffect(() => {
    if (items.length < 2 || isHovered || isFocused) {
      return undefined;
    }

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, ROTATION_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [items.length, isHovered, isFocused]);

  const handlePrev = useCallback(() => {
    if (items.length < 2) return;
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
  }, [items.length]);

  const handleNext = useCallback(() => {
    if (items.length < 2) return;
    setCurrentIndex((prev) => (prev + 1) % items.length);
  }, [items.length]);

  const handleSelectSlide = useCallback((index) => {
    setCurrentIndex(index);
  }, []);

  const handleViewAll = useCallback(() => {
    navigate('/ai/insights');
  }, [navigate]);

  // 1. Loading State
  if (loading) {
    return (
      <div
        className={`rounded-2xl border border-border-default bg-surface p-4 shadow-floating animate-pulse ${className}`.trim()}
        role="status"
        aria-label="Loading insights..."
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="h-4 w-32 rounded bg-surface-2" />
          <div className="h-5 w-16 rounded-full bg-surface-2" />
        </div>
        <div className="space-y-1.5 my-2.5">
          <div className="h-4 w-3/4 rounded bg-surface-2" />
          <div className="h-3.5 w-full rounded bg-surface-2" />
        </div>
        <div className="flex items-center justify-between pt-1">
          <div className="flex gap-1.5">
            <div className="h-2 w-5 rounded-full bg-surface-2" />
            <div className="h-2 w-2 rounded-full bg-surface-2" />
            <div className="h-2 w-2 rounded-full bg-surface-2" />
          </div>
          <div className="h-3 w-14 rounded bg-surface-2" />
        </div>
      </div>
    );
  }

  // 2. Error State
  if (error) {
    return (
      <div
        role="alert"
        className={`rounded-2xl border border-danger/30 bg-surface p-4 shadow-floating flex flex-col justify-between ${className}`.trim()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-danger font-semibold text-small">
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Unable to load insights</span>
            </div>
            <p className="text-caption text-text-muted mt-1 truncate">{error}</p>
          </div>
          <button
            type="button"
            onClick={handleViewAll}
            className="text-caption font-semibold text-text-secondary hover:text-text-primary shrink-0 transition-colors focus:outline-none focus-visible:underline"
          >
            View all
          </button>
        </div>
        {onRetry && (
          <div className="mt-3">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-caption font-semibold text-danger border border-danger/30 hover:bg-danger/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
            >
              <ArrowPathIcon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Retry</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // 3. Calm Empty State
  if (items.length === 0) {
    return (
      <div
        className={`rounded-2xl border border-border-default bg-surface p-4 shadow-floating flex flex-col justify-between ${className}`.trim()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <SparklesIcon className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="text-caption font-semibold uppercase tracking-wider text-text-muted">
              Business Insights
            </span>
          </div>
          <button
            type="button"
            onClick={handleViewAll}
            className="text-caption font-semibold text-text-secondary hover:text-text-primary transition-colors focus:outline-none focus-visible:underline"
          >
            View all
          </button>
        </div>
        <p className="text-small text-text-muted my-2">
          No active alerts or recommendations. Operations are running normally.
        </p>
        <div className="text-[11px] text-text-muted/80">
          Updated automatically with your store operations
        </div>
      </div>
    );
  }

  // 4. Carousel State with Eligible Items
  const currentItem = items[currentIndex] || items[0];
  const hasMultiple = items.length >= 2;
  const badgeStyle = severityBadgeStyles[currentItem.severity] || severityBadgeStyles.info;

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Business Insights"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setIsFocused(false);
        }
      }}
      className={`rounded-2xl border border-border-default bg-surface p-4 shadow-floating transition-all duration-200 hover:border-border-hover flex flex-col justify-between ${className}`.trim()}
    >
      {/* Header: Title / Badge + View All */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {currentItem.kind === 'alert' ? (
            <ExclamationTriangleIcon className="h-4 w-4 text-amber-500 shrink-0" aria-hidden="true" />
          ) : (
            <LightBulbIcon className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
          )}
          <span className="text-caption font-semibold uppercase tracking-wider text-text-muted truncate">
            Business Insights
          </span>
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 uppercase tracking-wider ${badgeStyle}`}
          >
            {currentItem.category}
          </span>
        </div>

        <button
          type="button"
          onClick={handleViewAll}
          className="text-caption font-semibold text-text-secondary hover:text-text-primary shrink-0 transition-colors focus:outline-none focus-visible:underline"
        >
          View all
        </button>
      </div>

      {/* Slide Content */}
      <div
        role="group"
        aria-roledescription="slide"
        aria-label={`${currentIndex + 1} of ${items.length}`}
        className="my-1.5 transition-opacity duration-200 motion-reduce:transition-none"
      >
        <h4 className="text-body font-semibold text-text-primary tracking-tight truncate">
          {currentItem.title}
        </h4>
        <p className="text-caption text-text-secondary line-clamp-2 mt-0.5">
          {currentItem.message}
        </p>
      </div>

      {/* Footer: Pagination Dots + Slide Counter + Controls */}
      <div className="flex items-center justify-between gap-2 pt-1 mt-1 border-t border-border-default/40">
        {hasMultiple ? (
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Insight slides">
            {items.map((item, idx) => {
              const isSelected = idx === currentIndex;
              return (
                <button
                  key={item.id || idx}
                  type="button"
                  role="tab"
                  onClick={() => handleSelectSlide(idx)}
                  aria-label={`Go to slide ${idx + 1} of ${items.length}`}
                  aria-selected={isSelected}
                  className={`h-1.5 rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isSelected ? 'w-5 bg-primary' : 'w-2 bg-border-default hover:bg-border-hover'
                  }`}
                />
              );
            })}
          </div>
        ) : (
          <div className="text-[11px] text-text-muted/80">Active insight</div>
        )}

        <div className="flex items-center gap-1 shrink-0">
          {hasMultiple && (
            <>
              <span className="text-[11px] text-text-muted font-medium select-none mr-1">
                {currentIndex + 1} of {items.length}
              </span>
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous insight"
                className="p-1 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <ChevronLeftIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next insight"
                className="p-1 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <ChevronRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
