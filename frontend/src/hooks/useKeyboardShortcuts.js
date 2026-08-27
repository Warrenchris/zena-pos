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
      const targetTag = e.target?.tagName?.toLowerCase();
      const isInputFocused =
        targetTag === 'input' ||
        targetTag === 'textarea' ||
        targetTag === 'select' ||
        e.target?.isContentEditable;

      // Ctrl+/ (Cmd+/) always works, including while typing — it's how a
      // cashier gets back to search from wherever they are. It doesn't
      // collide with any native input-editing behavior.
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        onFocusSearch?.();
        return;
      }

      // Every other shortcut below must NOT fire while the cashier is typing
      // in a field — Ctrl+Backspace is "delete previous word" in native text
      // inputs, and Ctrl+Enter is a common in-field submit convention. Firing
      // "Cancel Sale" or "Proceed to Payment" underneath a keystroke the
      // cashier meant for the text field they're in is exactly the bug this
      // guard exists to prevent.
      if (isInputFocused) return;

      // Proceed to Payment: F2 or Ctrl+Enter / Cmd+Enter
      if (e.key === 'F2' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) {
        e.preventDefault();
        onProceedToPayment?.();
        return;
      }

      // Hold Current Cart: F3
      if (e.key === 'F3') {
        e.preventDefault();
        onHoldCart?.();
        return;
      }

      // Open Held Carts: F4
      if (e.key === 'F4') {
        e.preventDefault();
        onOpenHeldCarts?.();
        return;
      }

      // Cancel Sale: F9 or Ctrl+Backspace / Cmd+Backspace
      if (e.key === 'F9' || ((e.ctrlKey || e.metaKey) && e.key === 'Backspace')) {
        e.preventDefault();
        onCancelSale?.();
        return;
      }

      // Toggle Keyboard Shortcuts Help: '?'
      if (e.key === '?') {
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
