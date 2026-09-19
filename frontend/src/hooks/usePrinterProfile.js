import { useCallback, useRef, useState } from 'react';
import { DEFAULT_PROFILE, loadProfile, saveProfile } from '../printing/profile';

/**
 * Read and edit this device's printer profile.
 *
 * Every change is validated and saved to the device immediately, so there is
 * no separate "save" step: printReceipt() reads the same stored profile the
 * next time a receipt is printed.
 *
 * @returns {{ profile: object, update: (patch: object) => void, reset: () => void }}
 */
export default function usePrinterProfile() {
  const [profile, setProfile] = useState(() => loadProfile());
  const latest = useRef(profile);

  const commit = useCallback((next) => {
    const saved = saveProfile(next);
    latest.current = saved;
    setProfile(saved);
  }, []);

  const update = useCallback((patch) => commit({ ...latest.current, ...patch }), [commit]);
  const reset = useCallback(() => commit({ ...DEFAULT_PROFILE }), [commit]);

  return { profile, update, reset };
}
