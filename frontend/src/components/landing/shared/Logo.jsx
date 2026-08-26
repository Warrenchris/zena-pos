import React from 'react';
import { Link } from 'react-router-dom';

export default function Logo({ className = '', showText = true, size = 'md' }) {
  const sizes = {
    sm: { icon: 'w-8 h-8', text: 'text-body' },
    md: { icon: 'w-9 h-9', text: 'text-h3' },
    lg: { icon: 'w-11 h-11', text: 'text-h2' },
  };
  const s = sizes[size] || sizes.md;

  return (
    <Link
      to="/"
      className={`inline-flex items-center gap-2.5 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-app rounded-lg ${className}`}
      aria-label="Zana POS home"
    >
      <img
        src="/logo.svg"
        alt=""
        className={`${s.icon} rounded-xl shadow-sm transition-transform duration-200 group-hover:scale-[1.02]`}
        width={36}
        height={36}
      />
      {showText && (
        <span className={`${s.text} font-bold text-text-primary tracking-tight`}>
          Zana POS
        </span>
      )}
    </Link>
  );
}
