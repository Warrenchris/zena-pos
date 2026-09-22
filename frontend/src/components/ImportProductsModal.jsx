import { useState } from 'react';
import { XMarkIcon, DocumentArrowUpIcon, CheckCircleIcon, ExclamationCircleIcon, DocumentIcon } from '@heroicons/react/24/outline';
import api from '../services/api';

export default function ImportProductsModal({ onClose, onImportComplete }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const validTypes = [
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ];
      const validExtensions = ['.csv', '.xlsx', '.xls'];
      const fileExt = selectedFile.name.toLowerCase().substring(selectedFile.name.lastIndexOf('.'));
      
      if (validTypes.includes(selectedFile.type) || validExtensions.includes(fileExt)) {
        setFile(selectedFile);
        setError(null);
        setResult(null);
      } else {
        setError('Please upload a CSV or Excel file (.csv, .xlsx, .xls)');
        setFile(null);
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await api.post('/products/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      setResult(response.data);
      if (onImportComplete) {
        onImportComplete();
      }
    } catch (err) {
      console.error('Import error:', err);
      setError(err.response?.data?.error || 'Failed to import products. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    // Create a simple CSV template
    const template = [
      ['name', 'sku', 'barcode', 'description', 'price', 'cost', 'stockQuantity', 'reorderPoint', 'category', 'weightGrams', 'expirationDate'],
      ['Sample Product 1', 'SKU001', '1234567890123', 'Product description', '10.99', '5.99', '100', '10', 'Electronics', '500', '2025-12-31'],
      ['Sample Product 2', '', '', 'Another product', '15.99', '8.99', '50', '5', 'Electronics', '', '']
    ];

    const csvContent = template.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'products_import_template.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
      <div 
        className="relative w-full max-w-2xl bg-surface border border-border-default shadow-modal rounded-2xl p-6 text-text-primary transition-all duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border-default/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-2xs">
              <DocumentArrowUpIcon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-text-primary tracking-tight">
                Import Products
              </h3>
              <p className="text-caption text-text-muted">
                Upload a CSV or Excel file to import products in bulk
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors focus:outline-none"
            aria-label="Close dialog"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="pt-4 space-y-4">
          {!result ? (
            <>
              {/* File Upload Area */}
              <div className="border-2 border-dashed border-border-default rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
                <input
                  type="file"
                  id="file-upload"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={uploading}
                />
                <label
                  htmlFor="file-upload"
                  className={`cursor-pointer ${uploading ? 'pointer-events-none opacity-50' : ''}`}
                >
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-surface-2 flex items-center justify-center">
                      <DocumentIcon className="h-8 w-8 text-text-muted" />
                    </div>
                    <div>
                      <p className="text-small font-medium text-text-primary">
                        {file ? file.name : 'Click to upload or drag and drop'}
                      </p>
                      <p className="text-caption text-text-muted mt-1">
                        CSV or Excel files (.csv, .xlsx, .xls) up to 5MB
                      </p>
                    </div>
                  </div>
                </label>
              </div>

              {/* Template Download */}
              <div className="flex items-center justify-between p-4 bg-surface-2 rounded-xl">
                <div>
                  <p className="text-small font-medium text-text-primary">
                    Need a template?
                  </p>
                  <p className="text-caption text-text-muted">
                    Download a sample CSV file with the correct format
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-4 py-2 rounded-xl border border-border-default text-text-secondary hover:text-text-primary bg-surface-2 hover:bg-surface-3 font-medium text-small transition-colors"
                >
                  Download Template
                </button>
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex items-start gap-3 p-4 bg-danger/10 border border-danger/30 rounded-xl">
                  <ExclamationCircleIcon className="h-5 w-5 text-danger flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-small font-medium text-danger">Import Error</p>
                    <p className="text-caption text-danger/80 mt-1">{error}</p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-default/80">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={uploading}
                  className="px-4 py-2.5 rounded-xl border border-border-default text-text-secondary hover:text-text-primary bg-surface-2 hover:bg-surface-3 font-medium text-small transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  className="px-5 py-2.5 bg-primary text-white rounded-xl font-semibold text-small hover:bg-primary-hover active:bg-primary-active shadow-sm transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? 'Importing...' : 'Import Products'}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Import Results */}
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-success/10 border border-success/30 rounded-xl text-center">
                    <p className="text-2xl font-bold text-success">{result.summary.successful}</p>
                    <p className="text-caption text-success/80">Successful</p>
                  </div>
                  <div className="p-4 bg-warning/10 border border-warning/30 rounded-xl text-center">
                    <p className="text-2xl font-bold text-warning">{result.summary.skipped}</p>
                    <p className="text-caption text-warning/80">Skipped</p>
                  </div>
                  <div className="p-4 bg-danger/10 border border-danger/30 rounded-xl text-center">
                    <p className="text-2xl font-bold text-danger">{result.summary.errors}</p>
                    <p className="text-caption text-danger/80">Errors</p>
                  </div>
                </div>

                {/* Success Message */}
                <div className="flex items-start gap-3 p-4 bg-success/10 border border-success/30 rounded-xl">
                  <CheckCircleIcon className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-small font-medium text-success">Import Completed</p>
                    <p className="text-caption text-success/80 mt-1">{result.message}</p>
                  </div>
                </div>

                {/* Errors (if any) */}
                {result.errors && result.errors.length > 0 && (
                  <div className="p-4 bg-surface-2 rounded-xl max-h-48 overflow-y-auto">
                    <p className="text-small font-medium text-text-primary mb-2">Errors Details:</p>
                    <div className="space-y-2">
                      {result.errors.map((err, index) => (
                        <div key={index} className="flex items-start gap-2 text-caption">
                          <span className="text-danger font-medium">Row {err.row}:</span>
                          <span className="text-text-muted">{err.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Successful Products (first 5) */}
                {result.successfulProducts && result.successfulProducts.length > 0 && (
                  <div className="p-4 bg-surface-2 rounded-xl max-h-48 overflow-y-auto">
                    <p className="text-small font-medium text-text-primary mb-2">Successfully Imported:</p>
                    <div className="space-y-2">
                      {result.successfulProducts.slice(0, 5).map((product, index) => (
                        <div key={index} className="flex items-center gap-2 text-caption">
                          <CheckCircleIcon className="h-4 w-4 text-success flex-shrink-0" />
                          <span className="text-text-muted">{product.name} (SKU: {product.sku})</span>
                        </div>
                      ))}
                      {result.successfulProducts.length > 5 && (
                        <p className="text-caption text-text-muted italic">
                          ... and {result.successfulProducts.length - 5} more products
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-default/80">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2.5 rounded-xl border border-border-default text-text-secondary hover:text-text-primary bg-surface-2 hover:bg-surface-3 font-medium text-small transition-colors"
                >
                  Import More
                </button>
                
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 bg-primary text-white rounded-xl font-semibold text-small hover:bg-primary-hover active:bg-primary-active shadow-sm transition-all duration-150 active:scale-[0.98]"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}