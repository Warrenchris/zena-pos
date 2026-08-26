import React from 'react';

export default function FeatureCard({ icon: Icon, title, description, className = '' }) {
  return (
    <article
      className={`group rounded-2xl border border-border-default bg-surface p-6 transition-all duration-200 hover:border-border-hover hover:shadow-md hover:-translate-y-0.5 ${className}`}
    >
      {Icon && (
        <div
          className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors duration-200 group-hover:bg-primary/15"
          aria-hidden="true"
        >
          <Icon className="h-5 w-5" />
        </div>
      )}
      <h3 className="text-h3 font-semibold text-text-primary mb-2">{title}</h3>
      <p className="text-body text-text-secondary leading-relaxed">{description}</p>
    </article>
  );
}
