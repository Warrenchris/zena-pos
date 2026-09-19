import React from 'react';
import Modal from '../ui/Modal';
import PrinterSettingsPanel from './PrinterSettingsPanel';

/** Printer settings in a dialog, for use outside the Settings page (e.g. at the POS). */
export default function PrinterSettingsModal({ isOpen, onClose }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Printer settings"
      description="How this device prints receipts."
      size="lg"
    >
      <PrinterSettingsPanel showHeading={false} />
    </Modal>
  );
}
