import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

export default function ExportButtons({ expenses = [], formatCurrency, filters }) {
  const exportCSV = () => {
    const rows = expenses.map((e) => ({
      Description: e.description,
      Category: e.category,
      Amount: e.amount,
      Date: e.date ? new Date(e.date).toLocaleDateString() : '',
      Payment: e.paymentMethod,
      AddedBy: e.recordedBy?.name || e.user?.name || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses')
    XLSX.writeFile(wb, 'expenses.xlsx')
  }

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.text('Expenses Report', 14, 16)
    const body = expenses.map((e) => [
      e.description,
      e.category,
      (formatCurrency ? formatCurrency(e.amount) : e.amount),
      e.date ? new Date(e.date).toLocaleDateString() : '',
      e.paymentMethod,
      e.recordedBy?.name || e.user?.name || '',
    ])
    doc.autoTable({
      head: [['Description', 'Category', 'Amount', 'Date', 'Payment', 'Added By']],
      body,
      startY: 22,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [245, 158, 11], textColor: [0, 0, 0] },
    })
    doc.save('expenses.pdf')
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={exportCSV} className="px-3 py-2 rounded-md border border-yellow-600/30 text-gray-200 hover:bg-yellow-600/10">Export CSV</button>
      <button onClick={exportPDF} className="px-3 py-2 rounded-md border border-yellow-600/30 text-gray-200 hover:bg-yellow-600/10">Export PDF</button>
    </div>
  )
}


