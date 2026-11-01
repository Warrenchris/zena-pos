import React from 'react';
import { toast } from '../../utils/toast';

export default function ExportButtons({ expenses = [], formatCurrency, filters }) {
  const exportCSV = async () => {
    try {
      const XLSX = await import('xlsx');
      const rows = expenses.map((e) => ({
        Description: e.description,
        Category: e.category,
        Amount: e.amount,
        Date: e.date ? new Date(e.date).toLocaleDateString() : '',
        Payment: e.paymentMethod,
        AddedBy: e.recordedBy?.name || e.user?.name || '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
      XLSX.writeFile(wb, 'expenses.xlsx');
    } catch (error) {
      console.error('Failed to export CSV:', error);
      toast.error('Failed to export expenses to Excel/CSV. Please try again.');
    }
  };

  const exportPDF = async () => {
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF();
      doc.text('Expenses Report', 14, 16);
      const body = expenses.map((e) => [
        e.description,
        e.category,
        (formatCurrency ? formatCurrency(e.amount) : e.amount),
        e.date ? new Date(e.date).toLocaleDateString() : '',
        e.paymentMethod,
        e.recordedBy?.name || e.user?.name || '',
      ]);
      autoTable(doc, {
        head: [['Description', 'Category', 'Amount', 'Date', 'Payment', 'Added By']],
        body,
        startY: 22,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [245, 158, 11], textColor: [0, 0, 0] },
      });
      doc.save('expenses.pdf');
    } catch (error) {
      console.error('Failed to export PDF:', error);
      toast.error('Failed to export expenses to PDF. Please try again.');
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button onClick={exportCSV} className="px-3 py-2 rounded-md border border-yellow-600/30 text-gray-200 hover:bg-yellow-600/10">Export CSV</button>
      <button onClick={exportPDF} className="px-3 py-2 rounded-md border border-yellow-600/30 text-gray-200 hover:bg-yellow-600/10">Export PDF</button>
    </div>
  );
}
