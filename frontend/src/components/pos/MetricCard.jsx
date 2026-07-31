import React from 'react';

/**
 * MetricCard — POS statistics card component aligned with design system
 */
export default function MetricCard({ icon: IconComponent, label, value, subtext, gradient, animated = false }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-surface border border-border-default shadow-floating transition-all duration-300 hover:border-primary/40 group ${animated ? 'animate-slideIn' : ''}`}>
      {/* Background accent glow */}
      <div className={`absolute inset-0 ${gradient || 'bg-primary/5'} opacity-10 group-hover:opacity-20 transition-opacity duration-300`}></div>

      {/* Content */}
      <div className="relative p-5 sm:p-6">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-105 ${gradient || 'bg-primary/10 text-primary'}`}>
            <IconComponent className="h-6 w-6 text-white" />
          </div>
          <span className="text-caption font-semibold text-text-muted uppercase tracking-wider">Live</span>
        </div>
        <div className="space-y-1">
          <h3 className="text-small font-semibold text-text-secondary">{label}</h3>
          <p className="text-h2 font-bold text-text-primary">{value}</p>
          {subtext && <p className="text-caption text-text-muted">{subtext}</p>}
        </div>
      </div>

      {/* Hover accent border */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent scale-x-0 group-hover:scale-x-100 transition-transform duration-300"></div>
    </div>
  );
}
