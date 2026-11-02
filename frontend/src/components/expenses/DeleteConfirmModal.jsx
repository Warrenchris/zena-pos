import React from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

export default function DeleteConfirmModal({ open, title = 'Delete Expense', message, onCancel, onConfirm, loading = false }) {
  return (
    <Modal
      isOpen={Boolean(open)}
      onClose={onCancel}
      title={title}
      size="sm"
    >
      <div className="space-y-4 pt-1">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-danger/10 text-danger shrink-0">
            <ExclamationTriangleIcon className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="text-body text-text-secondary leading-relaxed">
            {message || 'Are you sure you want to delete this expense record? This action cannot be undone.'}
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-default">
          <Button
            variant="secondary"
            size="md"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="md"
            onClick={onConfirm}
            loading={loading}
          >
            Delete Expense
          </Button>
        </div>
      </div>
    </Modal>
  );
}
