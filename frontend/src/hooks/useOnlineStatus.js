import { useSyncExternalStore } from 'react';

const subscribe = (callback) => {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
};

const getSnapshot = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

/** true while the browser believes it has a network connection. */
export default function useOnlineStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
