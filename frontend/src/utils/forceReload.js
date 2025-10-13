// Force reload utility for development
export const forceReload = () => {
  // Clear all possible caches
  if ('caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => {
        caches.delete(name);
      });
    });
  }
  
  // Clear localStorage
  localStorage.clear();
  
  // Clear sessionStorage
  sessionStorage.clear();
  
  // Force reload with cache bypass
  window.location.reload(true);
};

export const clearAllCaches = () => {
  // Clear service worker cache
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(registration => {
        registration.unregister();
      });
    });
  }
  
  // Clear all storage
  localStorage.clear();
  sessionStorage.clear();
  
  // Clear IndexedDB
  if ('indexedDB' in window) {
    indexedDB.databases().then(databases => {
      databases.forEach(db => {
        indexedDB.deleteDatabase(db.name);
      });
    });
  }
  
  console.log('🧹 All caches cleared');
};

// Auto-clear cache on development
if (process.env.NODE_ENV === 'development') {
  // Clear cache every 5 minutes in development
  setInterval(() => {
    console.log('🔄 Auto-clearing cache...');
    clearAllCaches();
  }, 5 * 60 * 1000);
}
