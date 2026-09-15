import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { BuildingStorefrontIcon, SparklesIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import Modal from './ui/Modal';
import Input from './ui/Input';
import Button from './ui/Button';
import { createBranch, fetchAccessibleShops } from '../store/slices/shopSlice';
import { useToast } from './Toast';

export default function CreateBranchModal({ isOpen, onClose }) {
  const dispatch = useDispatch();
  let showToast = () => {};
  try {
    const toast = useToast();
    if (toast?.showToast) {
      showToast = toast.showToast;
    }
  } catch (_) {
    showToast = (opts) => {
      if (typeof window !== 'undefined' && window.showToast) {
        window.showToast(opts);
      }
    };
  }
  const creatingBranch = useSelector((state) => state.shop?.creatingBranch);

  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    kraPin: '',
    registrationNumber: '',
  });

  const [validationError, setValidationError] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [quotaError, setQuotaError] = useState(null);

  const handleInputChange = (field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    if (field === 'name' && validationError) {
      setValidationError('');
    }
    if (generalError) setGeneralError('');
    if (quotaError) setQuotaError(null);
  };

  const handleClose = () => {
    if (creatingBranch) return;
    setFormData({
      name: '',
      address: '',
      phone: '',
      kraPin: '',
      registrationNumber: '',
    });
    setValidationError('');
    setGeneralError('');
    setQuotaError(null);
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setValidationError('Branch name is required');
      return;
    }

    setValidationError('');
    setGeneralError('');
    setQuotaError(null);

    const payload = {
      name: formData.name.trim(),
      address: formData.address.trim() || undefined,
      phone: formData.phone.trim() || undefined,
      kraPin: formData.kraPin.trim() || undefined,
      registrationNumber: formData.registrationNumber.trim() || undefined,
    };

    const resultAction = await dispatch(createBranch(payload));

    if (createBranch.fulfilled.match(resultAction)) {
      showToast({
        type: 'success',
        title: 'Branch Created',
        message: `Branch "${formData.name.trim()}" created successfully.`,
      });
      // Ensure switcher list is fresh
      dispatch(fetchAccessibleShops());
      handleClose();
    } else if (createBranch.rejected.match(resultAction)) {
      const payloadError = resultAction.payload;
      const isQuotaExceeded =
        payloadError?.code === 'QUOTA_EXCEEDED' ||
        payloadError?.data?.code === 'QUOTA_EXCEEDED';

      if (isQuotaExceeded) {
        // Display the upgrade-prompt message text from the response directly
        const upgradeMsg =
          payloadError?.data?.error ||
          payloadError?.message ||
          'Branch limit reached for your current plan. Upgrade required.';
        setQuotaError({
          message: upgradeMsg,
          currentPlan: payloadError?.data?.currentPlan,
          requiredPlan: payloadError?.data?.requiredPlan,
          limit: payloadError?.data?.limit,
        });
      } else {
        const errorMsg =
          payloadError?.message ||
          payloadError?.data?.error ||
          'Failed to create branch. Please try again.';
        setGeneralError(errorMsg);
        showToast({
          type: 'error',
          title: 'Error Creating Branch',
          message: errorMsg,
        });
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add New Branch"
      description="Create an additional branch or store location for your organization."
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        {/* Quota Exceeded Alert Banner */}
        {quotaError && (
          <div
            role="alert"
            className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 space-y-2"
          >
            <div className="flex items-start gap-2.5">
              <SparklesIcon className="h-5 w-5 shrink-0 mt-0.5 text-amber-500" />
              <div>
                <h4 className="text-small font-bold text-amber-700 dark:text-amber-300">
                  Plan Quota Exceeded
                </h4>
                <p className="text-caption mt-0.5 leading-relaxed font-medium">
                  {quotaError.message}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* General Error Banner */}
        {generalError && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-danger/10 border border-danger/30 text-danger text-small flex items-start gap-2.5"
          >
            <ExclamationTriangleIcon className="h-5 w-5 shrink-0 mt-0.5 text-danger" />
            <span className="font-medium">{generalError}</span>
          </div>
        )}

        {/* Branch Name (Required) */}
        <Input
          id="branch-name"
          label="Branch Name"
          placeholder="e.g. Westlands Branch, CBD Outlet"
          value={formData.name}
          onChange={handleInputChange('name')}
          required
          error={validationError}
          disabled={creatingBranch}
          leftIcon={BuildingStorefrontIcon}
          autoFocus
        />

        {/* Physical Address (Optional) */}
        <Input
          id="branch-address"
          label="Physical Address"
          placeholder="e.g. Kimathi Street, 2nd Floor, Nairobi"
          value={formData.address}
          onChange={handleInputChange('address')}
          disabled={creatingBranch}
        />

        {/* Phone Number (Optional) */}
        <Input
          id="branch-phone"
          label="Phone Number"
          type="tel"
          placeholder="e.g. +254 700 000 000"
          value={formData.phone}
          onChange={handleInputChange('phone')}
          disabled={creatingBranch}
        />

        {/* Two column row for KRA PIN and Reg Number */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            id="branch-kraPin"
            label="KRA PIN"
            placeholder="e.g. P051234567Z"
            value={formData.kraPin}
            onChange={handleInputChange('kraPin')}
            disabled={creatingBranch}
          />
          <Input
            id="branch-regNumber"
            label="Registration No."
            placeholder="e.g. CPR/2024/12345"
            value={formData.registrationNumber}
            onChange={handleInputChange('registrationNumber')}
            disabled={creatingBranch}
          />
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-default mt-6">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={creatingBranch}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={creatingBranch}
            disabled={creatingBranch}
          >
            Create Branch
          </Button>
        </div>
      </form>
    </Modal>
  );
}
