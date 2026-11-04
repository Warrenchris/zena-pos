import React, { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useSelector } from 'react-redux';
import {
  ArrowDownTrayIcon,
  DocumentTextIcon,
  TableCellsIcon,
  PrinterIcon,
} from '@heroicons/react/24/outline';
import Button from '../ui/Button';
import { toast } from '../../utils/toast';
import { expensesAPI } from '../../services/api';
import { generatePDF } from '../../utils/documentGenerator';
import { generateExcel } from '../../utils/excelGenerator';
import { downloadCSV } from '../../utils/csv';
import { resolveBusinessIdentity } from '../../utils/businessIdentity';
import { PrintableDocumentContainer } from '../documents/PrintableDocumentContainer';

export default function ExportButtons({
  expenses = [],
  formatCurrency,
  filters = {},
  total = 0,
  periodTotal = 0,
}) {
  const auth = useSelector((state) => state.auth);
  const settings = useSelector((state) => state.settings);
  const shop = useSelector((state) => state.shop?.currentShop || state.shop?.shop);
  const identity = useMemo(() => resolveBusinessIdentity({ auth: { ...auth, shop }, settings }), [auth, settings, shop]);

  const [exporting, setExporting] = useState(null); // 'csv' | 'excel' | 'pdf' | 'print' | null
  const [printRecords, setPrintRecords] = useState(null);

  /**
   * Fetches the complete filtered expense dataset across all pages if the current
   * paginated view only contains a subset of matching records.
   * Pages through backend pagination safely using authoritative metadata until all records are retrieved.
   * Never falls back to partial data on failure; aborts with a descriptive error.
   */
  const resolveAllExpenses = async () => {
    if (typeof total === 'number' && total === 0) {
      return [];
    }

    if (typeof total === 'number' && total > 0 && total <= expenses.length) {
      return expenses;
    }

    const pageSize = 500;
    const seenIds = new Set();
    const fetchedRows = [];
    let currentPage = 1;
    let expectedTotal = typeof total === 'number' ? total : null;
    let expectedTotalPages = null;

    let hasMore = true;
    while (hasMore) {
      let response;
      try {
        response = await expensesAPI.getAll({
          ...filters,
          page: currentPage,
          limit: pageSize,
        });
      } catch (err) {
        console.error(`Failed to fetch expenses page ${currentPage}:`, err);
        throw new Error(
          `Failed to retrieve expenses on page ${currentPage}. Export aborted to prevent incomplete financial data.`
        );
      }

      const data = response?.data;
      const rows = Array.isArray(data?.expenses)
        ? data.expenses
        : Array.isArray(data?.rows)
          ? data.rows
          : Array.isArray(data)
            ? data
            : [];

      // Update authoritative metadata if returned by backend
      if (typeof data?.total === 'number') {
        expectedTotal = data.total;
      }
      if (typeof data?.totalPages === 'number') {
        expectedTotalPages = data.totalPages;
      }

      // If backend returns no records, end of dataset is reached
      if (rows.length === 0) {
        hasMore = false;
        break;
      }

      // Deduplicate records across pages in case of concurrent offset shifts
      for (const row of rows) {
        const idKey = row.id ?? `${row.date}-${row.description}-${row.amount}`;
        if (!seenIds.has(idKey)) {
          seenIds.add(idKey);
          fetchedRows.push(row);
        }
      }

      // Check authoritative termination conditions:
      // 1. Authoritative total count reached
      if (expectedTotal !== null && fetchedRows.length >= expectedTotal) {
        hasMore = false;
        break;
      }

      // 2. Authoritative totalPages reached
      if (expectedTotalPages !== null && currentPage >= expectedTotalPages) {
        hasMore = false;
        break;
      }

      currentPage += 1;
    }

    // Completeness verification: abort if declared authoritative total was not fully retrieved
    if (expectedTotal !== null && expectedTotal > 0 && fetchedRows.length < expectedTotal) {
      throw new Error(
        `Incomplete financial dataset: expected ${expectedTotal} records but retrieved ${fetchedRows.length}. Export aborted.`
      );
    }

    return fetchedRows;
  };

  const exportCSV = async () => {
    setExporting('csv');
    try {
      const records = await resolveAllExpenses();
      if (!records || records.length === 0) {
        toast.error('No expense records to export');
        return;
      }

      const rows = records.map((e) => ({
        Date: e.date ? new Date(e.date).toLocaleDateString() : '',
        Category: (e.category || '').replace(/_/g, ' '),
        Description: e.description || '',
        Amount: Number(e.amount || 0).toFixed(2),
        'Payment Method': (e.paymentMethod || '').replace(/_/g, ' '),
        Reference: e.reference || '',
        'Recorded By': e.recordedBy?.name || e.employee?.firstName || e.user?.name || '',
      }));

      const totalAmount = records.reduce((sum, e) => sum + Number(e.amount || 0), 0);
      rows.push({
        Date: 'TOTAL',
        Category: '',
        Description: '',
        Amount: totalAmount.toFixed(2),
        'Payment Method': '',
        Reference: '',
        'Recorded By': '',
      });

      const today = new Date().toISOString().split('T')[0];
      downloadCSV(`expenses-${today}.csv`, rows);
      toast.success(`Exported ${records.length} expense records to CSV`);
    } catch (err) {
      console.error('CSV export failed:', err);
      toast.error(err.message || 'Failed to export expenses to CSV');
    } finally {
      setExporting(null);
    }
  };

  const exportExcelHandler = async () => {
    setExporting('excel');
    try {
      const records = await resolveAllExpenses();
      if (!records || records.length === 0) {
        toast.error('No expense records to export');
        return;
      }

      const totalAmount = records.reduce((sum, e) => sum + Number(e.amount || 0), 0);

      const columns = [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Category', key: 'category', width: 18 },
        { header: 'Description', key: 'description', width: 32 },
        { header: 'Amount', key: 'amount', width: 16, numFmt: '#,##0.00' },
        { header: 'Payment Method', key: 'paymentMethod', width: 18 },
        { header: 'Reference', key: 'reference', width: 18 },
        { header: 'Recorded By', key: 'recordedBy', width: 22 },
      ];

      const data = records.map((e) => ({
        date: e.date ? new Date(e.date).toLocaleDateString() : '—',
        category: (e.category || '').replace(/_/g, ' '),
        description: e.description || '—',
        amount: Number(e.amount || 0),
        paymentMethod: (e.paymentMethod || '').replace(/_/g, ' '),
        reference: e.reference || '—',
        recordedBy: e.recordedBy?.name || e.employee?.firstName || e.user?.name || '—',
      }));

      const totalsRow = {
        date: 'TOTAL',
        category: '',
        description: '',
        amount: totalAmount,
        paymentMethod: '',
        reference: '',
        recordedBy: '',
      };

      const meta = [
        { label: 'Date Range', value: `${filters?.startDate || 'All Time'} to ${filters?.endDate || 'Present'}` },
        { label: 'Category', value: filters?.category || 'All Categories' },
        { label: 'Total Records', value: records.length },
      ];
      if (periodTotal > 0) {
        meta.push({ label: 'Period Total', value: formatCurrency ? formatCurrency(periodTotal) : String(periodTotal) });
      }

      const today = new Date().toISOString().split('T')[0];
      await generateExcel({
        title: 'Expense Management Report',
        filename: `expenses-${today}.xlsx`,
        identity,
        meta,
        columns,
        data,
        totalsRow,
      });

      toast.success(`Exported ${records.length} expense records to Excel`);
    } catch (err) {
      console.error('Excel export failed:', err);
      toast.error(err.message || 'Failed to export expenses to Excel');
    } finally {
      setExporting(null);
    }
  };

  const exportPDFHandler = async () => {
    setExporting('pdf');
    try {
      const records = await resolveAllExpenses();
      if (!records || records.length === 0) {
        toast.error('No expense records to export');
        return;
      }

      const totalAmount = records.reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const avgExpense = records.length > 0 ? totalAmount / records.length : 0;

      // Group by category to find top spending category
      const categoryTotals = {};
      records.forEach((e) => {
        const cat = (e.category || 'other').replace(/_/g, ' ');
        categoryTotals[cat] = (categoryTotals[cat] || 0) + Number(e.amount || 0);
      });
      const topCatEntry = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
      const topCategory = topCatEntry ? `${topCatEntry[0]} (${formatCurrency ? formatCurrency(topCatEntry[1]) : topCatEntry[1].toFixed(2)})` : 'None';

      const columns = [
        { header: 'Date', key: 'date', width: 22 },
        { header: 'Category', key: 'category', width: 26 },
        { header: 'Description', key: 'description', width: 44 },
        { header: 'Amount', key: 'amount', align: 'right', width: 26 },
        { header: 'Payment Method', key: 'paymentMethod', width: 28 },
        { header: 'Reference', key: 'reference', width: 24 },
        { header: 'Recorded By', key: 'recordedBy', width: 28 },
      ];

      const data = records.map((e) => ({
        date: e.date ? new Date(e.date).toLocaleDateString() : '—',
        category: (e.category || '').replace(/_/g, ' '),
        description: e.description || '—',
        amount: formatCurrency ? formatCurrency(e.amount || 0) : Number(e.amount || 0).toFixed(2),
        paymentMethod: (e.paymentMethod || '').replace(/_/g, ' '),
        reference: e.reference || '—',
        recordedBy: e.recordedBy?.name || e.employee?.firstName || e.user?.name || '—',
      }));

      const totalsRow = {
        date: 'TOTAL',
        category: '',
        description: '',
        amount: formatCurrency ? formatCurrency(totalAmount) : totalAmount.toFixed(2),
        paymentMethod: '',
        reference: '',
        recordedBy: '',
      };

      const meta = [
        { label: 'Date Range', value: `${filters?.startDate || 'All Time'} to ${filters?.endDate || 'Present'}` },
        { label: 'Category Filter', value: filters?.category || 'All Categories' },
        { label: 'Payment Method', value: filters?.paymentMethod || 'All Methods' },
        { label: 'Total Records', value: records.length },
      ];
      if (periodTotal > 0) {
        meta.push({ label: 'Period Budget Total', value: formatCurrency ? formatCurrency(periodTotal) : String(periodTotal) });
      }

      const summaryCards = [
        {
          label: 'Total Expenses',
          value: formatCurrency ? formatCurrency(totalAmount) : totalAmount.toFixed(2),
        },
        {
          label: 'Transaction Count',
          value: records.length,
        },
        {
          label: 'Average Expense',
          value: formatCurrency ? formatCurrency(avgExpense) : avgExpense.toFixed(2),
        },
        {
          label: 'Top Category',
          value: topCategory,
        },
      ];

      const today = new Date().toISOString().split('T')[0];
      await generatePDF({
        title: 'Expense Management Report',
        subtitle: `Operational expenditure breakdown for ${identity.displayName || 'All Branches'}`,
        filename: `expenses-${today}.pdf`,
        identity,
        meta,
        summaryCards,
        columns,
        data,
        totalsRow,
        orientation: 'landscape',
      });

      toast.success(`Exported ${records.length} expense records to PDF`);
    } catch (err) {
      console.error('PDF export failed:', err);
      toast.error(err.message || 'Failed to export expenses to PDF');
    } finally {
      setExporting(null);
    }
  };

  const triggerPrint = async () => {
    setExporting('print');
    try {
      const records = await resolveAllExpenses();
      if (!records || records.length === 0) {
        toast.error('No expense records to print');
        return;
      }
      setPrintRecords(records);
      setTimeout(() => {
        window.print();
        setExporting(null);
      }, 50);
    } catch (err) {
      console.error('Print preparation failed:', err);
      toast.error(err.message || 'Failed to prepare expenses for printing');
    } finally {
      setExporting(null);
    }
  };

  const activePrintRecords = printRecords || (exporting === 'print' ? expenses : []);
  const printTotalAmount = activePrintRecords.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const printAvgExpense = activePrintRecords.length > 0 ? printTotalAmount / activePrintRecords.length : 0;

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={exportCSV}
          disabled={exporting !== null}
          className="flex items-center gap-1.5"
          title="Export CSV"
        >
          <ArrowDownTrayIcon className="w-4 h-4" />
          <span>{exporting === 'csv' ? 'Exporting...' : 'CSV'}</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={exportExcelHandler}
          disabled={exporting !== null}
          className="flex items-center gap-1.5"
          title="Export Excel"
        >
          <TableCellsIcon className="w-4 h-4 text-emerald-600" />
          <span>{exporting === 'excel' ? 'Exporting...' : 'Excel'}</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={exportPDFHandler}
          disabled={exporting !== null}
          className="flex items-center gap-1.5"
          title="Export PDF"
        >
          <DocumentTextIcon className="w-4 h-4 text-rose-500" />
          <span>{exporting === 'pdf' ? 'Exporting...' : 'PDF'}</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={triggerPrint}
          disabled={exporting !== null}
          className="flex items-center gap-1.5"
          title="Print Expenses"
        >
          <PrinterIcon className="w-4 h-4 text-slate-600" />
          <span>{exporting === 'print' ? 'Preparing...' : 'Print'}</span>
        </Button>
      </div>

      {/* Pre-rendered Isolated Print View for Browser Print Preview (A4 UDDS)
          Pre-rendered in DOM with class "print-only" to eliminate any print-lifecycle race conditions.
          aria-hidden="true" ensures screen readers and test query selectors ignore this pre-rendered view. */}
      <div className="print-only" aria-hidden="true">
        <PrintableDocumentContainer
          title="EXPENSE MANAGEMENT REPORT"
          subtitle={`Period: ${filters?.startDate || 'All Time'} to ${filters?.endDate || 'Present'}`}
          identity={identity}
          meta={[
            { label: 'Category Filter', value: filters?.category || 'All Categories' },
            { label: 'Payment Method', value: filters?.paymentMethod || 'All Methods' },
            { label: 'Total Records', value: activePrintRecords.length },
          ]}
        >
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 rounded border border-slate-200">
              <div>
                <div className="text-xs uppercase text-slate-500 font-semibold">Total Expenses</div>
                <div className="text-lg font-bold text-slate-800">
                  {formatCurrency ? formatCurrency(printTotalAmount) : printTotalAmount}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-slate-500 font-semibold">Expense Count</div>
                <div className="text-lg font-bold text-slate-800">{activePrintRecords.length}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-slate-500 font-semibold">Average Expense</div>
                <div className="text-lg font-bold text-slate-800">
                  {formatCurrency ? formatCurrency(printAvgExpense) : printAvgExpense.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Table of Records */}
            <div>
              <table className="w-full text-xs text-left border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className="p-2 border border-slate-200">Date</th>
                    <th className="p-2 border border-slate-200">Category</th>
                    <th className="p-2 border border-slate-200">Description</th>
                    <th className="p-2 border border-slate-200 text-right">Amount</th>
                    <th className="p-2 border border-slate-200">Payment</th>
                    <th className="p-2 border border-slate-200">Recorded By</th>
                  </tr>
                </thead>
                <tbody>
                  {activePrintRecords.map((e, idx) => (
                    <tr key={e.id || idx} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                      <td className="p-2 border border-slate-200">
                        {e.date ? new Date(e.date).toLocaleDateString() : '—'}
                      </td>
                      <td className="p-2 border border-slate-200 capitalize">
                        {(e.category || '').replace(/_/g, ' ')}
                      </td>
                      <td className="p-2 border border-slate-200">{e.description || '—'}</td>
                      <td className="p-2 border border-slate-200 text-right font-medium">
                        {formatCurrency ? formatCurrency(e.amount || 0) : String(e.amount || 0)}
                      </td>
                      <td className="p-2 border border-slate-200 capitalize">
                        {(e.paymentMethod || '').replace(/_/g, ' ')}
                      </td>
                      <td className="p-2 border border-slate-200">
                        {e.recordedBy?.name || e.employee?.firstName || e.user?.name || '—'}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100 font-bold">
                    <td className="p-2 border border-slate-200" colSpan="3">
                      TOTAL
                    </td>
                    <td className="p-2 border border-slate-200 text-right">
                      {formatCurrency ? formatCurrency(printTotalAmount) : printTotalAmount}
                    </td>
                    <td className="p-2 border border-slate-200" colSpan="2" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </PrintableDocumentContainer>
      </div>
    </>
  );
}

ExportButtons.propTypes = {
  expenses: PropTypes.arrayOf(PropTypes.object),
  formatCurrency: PropTypes.func,
  filters: PropTypes.object,
  total: PropTypes.number,
  periodTotal: PropTypes.number,
};
