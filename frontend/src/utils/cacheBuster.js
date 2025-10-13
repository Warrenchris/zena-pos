// Cache busting utility
export const bustCache = () => {
  if (process.env.NODE_ENV === 'development') {
    // Clear various caches
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => {
          caches.delete(name);
        });
      });
    }
    
    // Clear localStorage cache
    const cacheKeys = Object.keys(localStorage).filter(key => 
      key.includes('route') || key.includes('cache')
    );
    cacheKeys.forEach(key => localStorage.removeItem(key));
    
    console.log('🧹 Cache cleared');
  }
};

export const forceReload = () => {
  bustCache();
  window.location.reload();
};
