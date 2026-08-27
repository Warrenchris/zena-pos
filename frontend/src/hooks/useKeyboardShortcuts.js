import { useEffect } from 'react';

/**
 * Custom Hook for global POS keyboard shortcuts
 * Active strictly in 'product-selection' mode when no modal or drawer is open.
 */
export function useKeyboardShortcuts({
  isActive,
  onProceedToPayment,
  onHoldCart,
  onOpenHeldCarts,
  onCancelSale,
  onFocusSearch,
  onToggleHelp
}) {
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e) => {
      // Don't intercept if an input is active (except for specific modifier combos like Ctrl+Enter or Ctrl+/)
      const targetTag = e.target?.tagName?.toLowerCase();
      const isInputFocused = targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select';

      // 1. Focus Search Input: Ctrl+/ or Cmd+/
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        onFocusSearch?.();
        return;
      }

      // 2. Proceed to Payment: F2 or Ctrl+Enter / Cmd+Enter
      if (e.key === 'F2' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) {
        e.preventDefault();
        onProceedToPayment?.();
        return;
      }

      // 3. Hold Current Cart: F3
      if (e.key === 'F3') {
        e.preventDefault();
        onHoldCart?.();
        return;
      }

      // 4. Open Held Carts: F4
      if (e.key === 'F4') {
        e.preventDefault();
        onOpenHeldCarts?.();
        return;
      }

      // 5. Cancel Sale: F9 or Ctrl+Backspace / Cmd+Backspace
      if (e.key === 'F9' || ((e.ctrlKey || e.metaKey) && e.key === 'Backspace')) {
        e.preventDefault();
        onCancelSale?.();
        return;
      }

      // 6. Toggle Keyboard Shortcuts Help: '?' (when not typing in an input)
      if (e.key === '?' && !isInputFocused) {
        e.preventDefault();
        onToggleHelp?.();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isActive,
    onProceedToPayment,
    onHoldCart,
    onOpenHeldCarts,
    onCancelSale,
    onFocusSearch,
    onToggleHelp
  ]);
}

export default useKeyboardShortcuts;
