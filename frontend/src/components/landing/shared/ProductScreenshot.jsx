import React from 'react';

export default function ProductScreenshot({
  children,
  variant = 'light',
  className = '',
  floatingMetrics = [],
  caption,
}) {
  const isDark = variant === 'dark';

  return (
    <figure className={`relative ${className}`}>
      <div
        className={`relative overflow-hidden rounded-2xl border shadow-floating transition-transform duration-500 ${
          isDark
            ? 'border-white/10 bg-[#1C1917] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)]'
            : 'border-border-default bg-surface'
        }`}
      >
        {/* Browser chrome */}
        <div
          className={`flex items-center gap-2 px-4 py-3 border-b ${
            isDark ? 'border-white/10 bg-[#12100E]' : 'border-border-default bg-surface-2'
          }`}
          aria-hidden="true"
        >
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          </div>
          <div
            className={`mx-auto flex h-6 w-48 max-w-[40%] items-center justify-center rounded-md text-[10px] ${
              isDark ? 'bg-white/5 text-white/40' : 'bg-surface text-text-muted'
            }`}
          >
            app.zanapos.com
          </div>
        </div>

        <div className="relative overflow-hidden">{children}</div>
      </div>

      {floatingMetrics.map((metric, i) => (
        <div
          key={metric.label}
          className={`absolute hidden sm:block rounded-xl border px-3 py-2 shadow-lg backdrop-blur-sm landing-float-${
            i % 3
          } ${
            isDark
              ? 'border-white/10 bg-[#262320]/95 text-white'
              : 'border-border-default bg-surface/95'
          }`}
          style={{
            top: metric.top,
            right: metric.right,
            bottom: metric.bottom,
            left: metric.left,
          }}
          aria-hidden="true"
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
            {metric.label}
          </p>
          <p className={`text-small font-bold ${isDark ? 'text-white' : 'text-text-primary'}`}>
            {metric.value}
          </p>
        </div>
      ))}

      {caption && (
        <figcaption className="mt-4 text-center text-caption text-text-muted">{caption}</figcaption>
      )}
    </figure>
  );
}
