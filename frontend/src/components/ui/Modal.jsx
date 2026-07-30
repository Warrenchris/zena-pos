import React, { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import Button from './Button';

/**
 * Modal — Accessible dialog primitive with focus trap, ESC handling, backdrop blur & animations
 */
const sizeStyles = {
  sm: 'max-w-md',        // 448px
  md: 'max-w-lg',        // 512px
  lg: 'max-w-2xl',       // 672px
  xl: 'max-w-4xl',       // 896px
  fullscreen: 'max-w-full min-h-screen rounded-none',
};

export default function Modal({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  showCloseButton = true,
  children,
  footer,
  className = '',
  initialFocusRef,
}) {
  return (
    <Transition show={Boolean(isOpen)} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50"
        onClose={onClose}
        initialFocus={initialFocusRef}
      >
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-250"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity" />
        </Transition.Child>

        {/* Scrollable Container */}
        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-6">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-250"
              enterFrom="opacity-0 scale-95 translateY-4"
              enterTo="opacity-100 scale-100 translateY-0"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100 translateY-0"
              leaveTo="opacity-0 scale-95 translateY-4"
            >
              <Dialog.Panel
                className={`
                  w-full transform overflow-hidden rounded-2xl bg-surface-1 border border-border-default
                  p-6 text-left align-middle shadow-modal transition-all responsive-modal
                  ${sizeStyles[size] || sizeStyles.md}
                  ${className}
                `}
              >
                {/* Header */}
                {(title || showCloseButton) && (
                  <div className="flex items-start justify-between gap-4 pb-4 border-b border-border-default mb-4">
                    <div>
                      {title && (
                        <Dialog.Title as="h3" className="text-h3 font-semibold text-text-primary">
                          {title}
                        </Dialog.Title>
                      )}
                      {description && (
                        <Dialog.Description className="text-small text-text-muted mt-1">
                          {description}
                        </Dialog.Description>
                      )}
                    </div>
                    {showCloseButton && (
                      <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
                        aria-label="Close modal"
                      >
                        <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}

                {/* Body */}
                <div className="relative">
                  {children}
                </div>

                {/* Footer */}
                {footer && (
                  <div className="mt-6 pt-4 border-t border-border-default flex items-center justify-end gap-3">
                    {footer}
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
