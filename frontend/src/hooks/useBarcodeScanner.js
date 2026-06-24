/**
 * useBarcodeScanner Custom Hook
 * 
 * TIMING-BASED DETECTION APPROACH:
 * Hardware scanners (USB/Bluetooth) emulate keyboards by typing characters in rapid succession,
 * typically under 50ms total, followed by an "Enter" key. This is much faster than a human typing.
 * 
 * 80MS THRESHOLD:
 * We use an 80ms threshold to identify if consecutive keystrokes belong to a scanner input.
 * If the delay between two keystrokes exceeds 80ms, we assume the user is typing manually or that
 * the scan has finished, so we reset the character buffer.
 * 
 * ACTIVEELEMENT CHECK:
 * If the user is currently typing inside a search box, textarea, or customer form, we must not
 * intercept their keystrokes. Checking `document.activeElement.tagName` ensures the scanner
 * listener is bypassed when input components are focused.
 */

import { useEffect, useRef } from 'react';

export function useBarcodeScanner({ onScan, isActive }) {
  const bufferRef = useRef('');
  const lastTimeRef = useRef(0);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!isActive) {
      bufferRef.current = '';
      lastTimeRef.current = 0;
      return;
    }

    const handleKeyDown = (e) => {
      // Ignore keystrokes when focused on input, textarea, select, or contenteditable elements
      if (document.activeElement) {
        const tagName = document.activeElement.tagName;
        if (
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName) ||
          document.activeElement.contentEditable === 'true' ||
          document.activeElement.getAttribute('contenteditable') === 'true'
        ) {
          return;
        }
      }

      const key = e.key;

      if (key === 'Enter') {
        if (bufferRef.current.length >= 3) {
          onScanRef.current(bufferRef.current);
        }
        bufferRef.current = '';
        lastTimeRef.current = 0;
        return;
      }

      // Ignore modifiers and non-printable keys
      if (key.length !== 1) {
        return;
      }

      const now = Date.now();
      const diff = now - lastTimeRef.current;

      if (lastTimeRef.current > 0 && diff <= 80) {
        bufferRef.current += key;
      } else {
        bufferRef.current = key;
      }
      lastTimeRef.current = now;
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActive]);
}
