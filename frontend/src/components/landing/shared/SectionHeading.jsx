import React from 'react';

export default function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = 'center',
  className = '',
}) {
  const alignClass =
    align === 'left'
      ? 'text-left items-start'
      : align === 'right'
        ? 'text-right items-end'
        : 'text-center items-center';

  return (
    <div className={`flex flex-col gap-3 max-w-3xl ${alignClass} ${className}`}>
      {eyebrow && (
        <p className="text-caption font-semibold uppercase tracking-widest text-primary">
          {eyebrow}
        </p>
      )}
      {title && (
        <h2 className="text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-[1.15] tracking-tight text-text-primary">
          {title}
        </h2>
      )}
      {subtitle && (
        <p className="text-body text-text-secondary leading-relaxed max-w-2xl">
          {subtitle}
        </p>
      )}
    </div>
  );
}
