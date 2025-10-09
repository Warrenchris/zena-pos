export function downloadCSV(filename, rows) {
  if (!rows || rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  const header = keys.join(',') + '\n';
  const body = rows.map(r => keys.map(k => {
    const v = r[k] == null ? '' : String(r[k]).replace(/"/g, '""');
    return `"${v}"`;
  }).join(',')).join('\n');

  const csv = header + body;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default downloadCSV;
