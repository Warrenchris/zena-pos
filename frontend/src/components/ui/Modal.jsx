import React, { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

/**
 * Modal — Floating modal dialog primitive with backdrop blur & smooth transition
 * Enterprise 24px radius floating shell container.
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
        {/* Backdrop Overlay */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-stone-950/50 backdrop-blur-xs transition-opacity" />
        </Transition.Child>

        {/* Container */}
        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-6">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-98 translateY-2"
              enterTo="opacity-100 scale-100 translateY-0"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100 translateY-0"
              leaveTo="opacity-0 scale-98 translateY-2"
            >
              <Dialog.Panel
                className={`
                  w-full transform overflow-hidden rounded-2xl bg-surface border border-border-default
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
                        <Dialog.Title as="h3" className="text-h3 font-bold text-text-primary tracking-tight">
                          {title}
                        </Dialog.Title>
                      )}
                      {description && (
                        <Dialog.Description className="text-small text-text-secondary mt-1">
                          {description}
                        </Dialog.Description>
                      )}
                    </div>
                    {showCloseButton && (
                      <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
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
