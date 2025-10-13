import React from 'react';

const pulseAnimation = `
  @keyframes pulse-ring {
    0% { transform: scale(0.7); opacity: 0; }
    50% { transform: scale(1); opacity: 0.5; }
    100% { transform: scale(1.3); opacity: 0; }
  }
`;

export const InlineLoading = ({ text = 'Loading...', variant = 'default' }) => {
  const variants = {
    default: "border-blue-600 text-blue-600",
    success: "border-green-600 text-green-600",
    error: "border-red-600 text-red-600",
    warning: "border-yellow-600 text-yellow-600"
  };

  return (
    <div className="flex items-center justify-center p-4">
      <div className={`relative`}>
        <div className={`animate-spin rounded-full h-5 w-5 border-b-2 ${variants[variant]}`} />
        <div className={`absolute inset-0 rounded-full border-2 ${variants[variant]} animate-[pulse-ring_1.5s_cubic-bezier(0.4,0,0.6,1)_infinite]`} />
      </div>
      <span className={`ml-2 text-sm ${variants[variant]}`}>{text}</span>
    </div>
  );
};

export const LoadingOverlay = ({ children, isLoading, text = 'Loading...', variant = 'default' }) => {
  const variants = {
    default: "border-blue-600 text-blue-600 bg-blue-50",
    success: "border-green-600 text-green-600 bg-green-50",
    error: "border-red-600 text-red-600 bg-red-50",
    warning: "border-yellow-600 text-yellow-600 bg-yellow-50"
  };

  if (!isLoading) return children;

  return (
    <div className="relative">
      <style>{pulseAnimation}</style>
      {children}
      <div className="absolute inset-0 bg-white/50 dark:bg-black/50 backdrop-blur-sm flex items-center justify-center transition-all duration-300">
        <div className={`flex items-center ${variants[variant].split(' ')[2]} shadow-lg rounded-lg px-6 py-3 transition-all duration-300 animate-[fadeIn_0.3s_ease-in-out]`}>
          <div className="relative">
            <div className={`animate-spin rounded-full h-6 w-6 border-b-2 ${variants[variant].split(' ')[0]}`} />
            <div className={`absolute inset-0 rounded-full border-2 ${variants[variant].split(' ')[0]} animate-[pulse-ring_1.5s_cubic-bezier(0.4,0,0.6,1)_infinite]`} />
          </div>
          <span className={`ml-3 text-sm font-medium ${variants[variant].split(' ')[1]}`}>{text}</span>
        </div>
      </div>
    </div>
  );
};

export const SkeletonLoader = ({ lines = 1, className = "" }) => {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array(lines).fill(0).map((_, i) => (
        <div key={i} className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          </div>
        </div>
      ))}
    </div>
  );
};

export const GridSkeletonLoader = ({ items = 4, className = "" }) => {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
      {Array(items).fill(0).map((_, i) => (
        <div key={i} className="animate-pulse bg-white rounded-lg p-4 shadow">
          <div className="rounded-lg bg-gray-200 h-48 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      ))}
    </div>
  );
};