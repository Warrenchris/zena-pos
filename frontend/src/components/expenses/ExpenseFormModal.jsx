import React, { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { expensesAPI } from '../../services/api';
import { toast } from '../../utils/toast';

const categories = [
  { value: 'inventory', label: 'Inventory' },
  { value: 'salary', label: 'Salaries' },
  { value: 'rent', label: 'Rent' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'other', label: 'Other' },
];

const paymentMethods = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'mobile_money', label: 'M-Pesa / Mobile Money' },
  { value: 'other', label: 'Other' },
];

export default function ExpenseFormModal({ open, onClose, onSaved, editing }) {
  const [form, setForm] = useState({
    description: '',
    amount: '',
    date: '',
    category: 'other',
    paymentMethod: 'cash',
    reference: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (editing) {
      setForm({
        description: editing.description || '',
        amount: editing.amount || '',
        date: editing.date ? editing.date.substring(0, 10) : '',
        category: editing.category || 'other',
        paymentMethod: editing.paymentMethod || 'cash',
        reference: editing.reference || '',
        notes: editing.notes || '',
      });
    } else {
      setForm({
        description: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        category: 'other',
        paymentMethod: 'cash',
        reference: '',
        notes: '',
      });
    }
    setErrors({});
  }, [editing, open]);

  const onChange = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) {
      setErrors((errs) => ({ ...errs, [field]: undefined }));
    }
  };

  const validate = () => {
    const errs = {};
    if (!form.description?.trim()) errs.description = 'Description is required';
    if (!form.amount || Number(form.amount) <= 0) errs.amount = 'Amount must be greater than 0';
    if (!form.category) errs.category = 'Category is required';
    if (!form.paymentMethod) errs.paymentMethod = 'Payment method is required';
    if (!form.date) errs.date = 'Date is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (editing) {
        await expensesAPI.update(editing.id, form);
        toast.success('Expense updated successfully');
      } else {
        await expensesAPI.create(form);
        toast.success('Expense added successfully');
      }
      onSaved?.();
    } catch {
      toast.error('Failed to save expense');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = (hasError) => `
    w-full bg-surface text-text-primary border rounded-xl px-3.5 py-2.5 text-small transition-colors duration-150
    placeholder-text-muted focus:outline-none focus:ring-2
    ${
      hasError
        ? 'border-danger focus:ring-danger/30 focus:border-danger'
        : 'border-border-default hover:border-border-hover focus:ring-primary/30 focus:border-primary'
    }
  `;

  return (
    <Modal
      isOpen={Boolean(open)}
      onClose={onClose}
      title={editing ? 'Edit Expense' : 'Add Expense'}
      description="Record operational costs to maintain accurate business cash flow."
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4 pt-2">
        <div>
          <label htmlFor="expense-description" className="block text-small font-semibold text-text-primary mb-1.5">
            Description <span className="text-danger">*</span>
          </label>
          <input
            id="expense-description"
            type="text"
            value={form.description}
            onChange={(e) => onChange('description', e.target.value)}
            placeholder="e.g., Monthly electricity bill, shop cleaning, office supplies"
            className={inputClass(errors.description)}
          />
          {errors.description && (
            <p className="text-caption text-danger font-medium mt-1">{errors.description}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="expense-amount" className="block text-small font-semibold text-text-primary mb-1.5">
              Amount <span className="text-danger">*</span>
            </label>
            <input
              id="expense-amount"
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => onChange('amount', e.target.value)}
              placeholder="0.00"
              className={inputClass(errors.amount)}
            />
            {errors.amount && (
              <p className="text-caption text-danger font-medium mt-1">{errors.amount}</p>
            )}
          </div>

          <div>
            <label htmlFor="expense-date" className="block text-small font-semibold text-text-primary mb-1.5">
              Date <span className="text-danger">*</span>
            </label>
            <input
              id="expense-date"
              type="date"
              value={form.date}
              onChange={(e) => onChange('date', e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className={inputClass(errors.date)}
            />
            {errors.date && (
              <p className="text-caption text-danger font-medium mt-1">{errors.date}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="expense-category" className="block text-small font-semibold text-text-primary mb-1.5">
              Category <span className="text-danger">*</span>
            </label>
            <select
              id="expense-category"
              value={form.category}
              onChange={(e) => onChange('category', e.target.value)}
              className={`${inputClass(errors.category)} cursor-pointer`}
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value} className="bg-surface text-text-primary">
                  {c.label}
                </option>
              ))}
            </select>
            {errors.category && (
              <p className="text-caption text-danger font-medium mt-1">{errors.category}</p>
            )}
          </div>

          <div>
            <label htmlFor="expense-payment-method" className="block text-small font-semibold text-text-primary mb-1.5">
              Payment Method <span className="text-danger">*</span>
            </label>
            <select
              id="expense-payment-method"
              value={form.paymentMethod}
              onChange={(e) => onChange('paymentMethod', e.target.value)}
              className={`${inputClass(errors.paymentMethod)} cursor-pointer`}
            >
              {paymentMethods.map((m) => (
                <option key={m.value} value={m.value} className="bg-surface text-text-primary">
                  {m.label}
                </option>
              ))}
            </select>
            {errors.paymentMethod && (
              <p className="text-caption text-danger font-medium mt-1">{errors.paymentMethod}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="expense-reference" className="block text-small font-semibold text-text-primary mb-1.5">
              Reference / Invoice # (optional)
            </label>
            <input
              id="expense-reference"
              type="text"
              value={form.reference}
              onChange={(e) => onChange('reference', e.target.value)}
              placeholder="e.g. INV-2026-0042, Receipt #89"
              className={inputClass(false)}
            />
          </div>

          <div>
            <label htmlFor="expense-notes" className="block text-small font-semibold text-text-primary mb-1.5">
              Notes (optional)
            </label>
            <input
              id="expense-notes"
              type="text"
              value={form.notes}
              onChange={(e) => onChange('notes', e.target.value)}
              placeholder="Additional notes or payee info"
              className={inputClass(false)}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-default">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={submitting}
          >
            {editing ? 'Save Changes' : 'Add Expense'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
