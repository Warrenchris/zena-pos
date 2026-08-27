import React from 'react';
import {
  XMarkIcon,
  CommandLineIcon
} from '@heroicons/react/24/outline';
import Button from '../ui/Button';

const SHORTCUTS = [
  { key: 'F2  /  Ctrl+Enter', action: 'Proceed to Payment' },
  { key: 'F3', action: 'Hold current cart' },
  { key: 'F4', action: 'Open Held Carts drawer' },
  { key: 'F9  /  Ctrl+⌫', action: 'Cancel current sale' },
  { key: 'Ctrl+/', action: 'Focus search catalog input' },
  { key: '?', action: 'Toggle this shortcuts help' },
  { key: 'Esc', action: 'Dismiss undo removal / modal' }
];

export default function KeyboardShortcutsPopover({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border-default rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-slideIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border-default pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <CommandLineIcon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-h3 font-bold text-text-primary">Keyboard Shortcuts</h3>
              <p className="text-caption text-text-muted">Quick POS actions for faster checkout</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-2 rounded-xl transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="divide-y divide-border-default">
          {SHORTCUTS.map((item, idx) => (
            <div key={idx} className="py-2.5 flex items-center justify-between">
              <span className="text-small text-text-secondary">{item.action}</span>
              <kbd className="px-2.5 py-1 text-caption font-mono font-bold text-text-primary bg-surface-2 border border-border-default rounded-lg shadow-2xs">
                {item.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="pt-2 border-t border-border-default">
          <Button
            type="button"
            variant="primary"
            size="md"
            fullWidth
            onClick={onClose}
          >
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
