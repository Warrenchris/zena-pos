import React, { useState } from 'react';
import { ArrowDownTrayIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import Button from '../ui/Button';
import { toast } from '../../utils/toast';

export default function ExportButtons({ expenses = [], formatCurrency, filters }) {
  const [exportingCSV, setExportingCSV] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);

  const exportCSV = async () => {
    if (!expenses || expenses.length === 0) {
      toast.error('No expense records to export');
      return;
    }
    setExportingCSV(true);
    try {
      const XLSX = await import('xlsx');
      const rows = expenses.map((e) => ({
        Description: e.description || '',
        Category: e.category ? e.category.replace('_', ' ') : '',
        Amount: e.amount || 0,
        Date: e.date ? new Date(e.date).toLocaleDateString() : '',
        PaymentMethod: e.paymentMethod ? e.paymentMethod.replace('_', ' ') : '',
        Reference: e.reference || '',
        AddedBy: e.recordedBy?.name || e.user?.name || '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
      XLSX.writeFile(wb, `expenses-${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Expenses exported to Excel successfully');
    } catch (error) {
      console.error('Failed to export CSV/Excel:', error);
      toast.error('Failed to export expenses to Excel. Please try again.');
    } finally {
      setExportingCSV(false);
    }
  };

  const exportPDF = async () => {
    if (!expenses || expenses.length === 0) {
      toast.error('No expense records to export');
      return;
    }
    setExportingPDF(true);
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF();

      doc.setFontSize(16);
      doc.text('Expense Management Report', 14, 18);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 25);

      const body = expenses.map((e) => [
        e.description || '',
        e.category ? e.category.replace('_', ' ') : '',
        formatCurrency ? formatCurrency(e.amount) : String(e.amount),
        e.date ? new Date(e.date).toLocaleDateString() : '',
        e.paymentMethod ? e.paymentMethod.replace('_', ' ') : '',
        e.recordedBy?.name || e.user?.name || '—',
      ]);

      autoTable(doc, {
        head: [['Description', 'Category', 'Amount', 'Date', 'Payment', 'Added By']],
        body,
        startY: 30,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [120, 68, 33], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [248, 245, 242] },
      });

      doc.save(`expenses-${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('Expenses exported to PDF successfully');
    } catch (error) {
      console.error('Failed to export PDF:', error);
      toast.error('Failed to export expenses to PDF. Please try again.');
    } finally {
      setExportingPDF(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        leftIcon={ArrowDownTrayIcon}
        onClick={exportCSV}
        loading={exportingCSV}
        aria-label="Export expenses to Excel"
      >
        Export Excel
      </Button>
      <Button
        variant="outline"
        size="sm"
        leftIcon={DocumentTextIcon}
        onClick={exportPDF}
        loading={exportingPDF}
        aria-label="Export expenses to PDF"
      >
        Export PDF
      </Button>
    </div>
  );
}
