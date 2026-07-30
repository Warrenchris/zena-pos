import React from 'react';
import Spinner from './Spinner';
import EmptyState from './EmptyState';
import Button from './Button';
import { ChevronUpIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

/**
 * Table — Enterprise-grade responsive table primitive
 */
export default function Table({
  columns = [],
  data = [],
  loading = false,
  emptyTitle = 'No data available',
  emptyDescription = 'There are no records matching your request.',
  sortColumn,
  sortDirection = 'asc',
  onSort,
  selectedRows = [],
  onSelectRow,
  onSelectAll,
  pagination,
  className = '',
}) {
  const isAllSelected = data.length > 0 && selectedRows.length === data.length;

  return (
    <div className={`w-full flex flex-col gap-4 ${className}`}>
      <div className="w-full overflow-x-auto rounded-xl border border-border-default bg-surface-1 shadow-sm">
        <table className="responsive-table w-full text-left text-body border-collapse">
          {/* Header */}
          <thead className="bg-surface-2 text-text-muted text-caption uppercase tracking-wider border-b border-border-default sticky top-0 z-10">
            <tr>
              {onSelectAll && (
                <th scope="col" className="p-4 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={onSelectAll}
                    aria-label="Select all rows"
                    className="rounded border-border-default bg-surface-1 text-primary focus:ring-primary/50"
                  />
                </th>
              )}
              {columns.map((col) => {
                const isSorted = sortColumn === col.key;
                const ariaSort = isSorted ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined;

                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={ariaSort}
                    onClick={() => col.sortable && onSort && onSort(col.key)}
                    className={`
                      p-4 font-semibold select-none
                      ${col.sortable ? 'cursor-pointer hover:text-text-primary transition-colors' : ''}
                      ${col.headerClassName || ''}
                    `}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{col.label}</span>
                      {col.sortable && isSorted && (
                        sortDirection === 'asc' ? (
                          <ChevronUpIcon className="h-4 w-4 text-primary" aria-hidden="true" />
                        ) : (
                          <ChevronDownIcon className="h-4 w-4 text-primary" aria-hidden="true" />
                        )
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Body */}
          <tbody className="divide-y divide-border-default text-text-primary">
            {loading ? (
              Array.from({ length: 5 }).map((_, rIdx) => (
                <tr key={rIdx} className="animate-pulse">
                  {onSelectAll && <td className="p-4"><div className="h-4 w-4 bg-surface-2 rounded" /></td>}
                  {columns.map((col, cIdx) => (
                    <td key={cIdx} className="p-4">
                      <div className="h-4 bg-surface-2 rounded w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (onSelectAll ? 1 : 0)} className="p-0">
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : (
              data.map((row, rIdx) => {
                const isSelected = selectedRows.includes(row.id || rIdx);

                return (
                  <tr
                    key={row.id || rIdx}
                    className={`
                      hover:bg-surface-2/60 transition-colors
                      ${isSelected ? 'bg-primary/5' : ''}
                    `}
                  >
                    {onSelectRow && (
                      <td className="p-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onSelectRow(row.id || rIdx)}
                          aria-label={`Select row ${rIdx + 1}`}
                          className="rounded border-border-default bg-surface-1 text-primary focus:ring-primary/50"
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        data-label={col.label}
                        className={`p-4 ${col.className || ''}`}
                      >
                        {col.render ? col.render(row[col.key], row, rIdx) : row[col.key]}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 text-small text-text-muted">
          <div>
            Showing <span className="font-semibold text-text-primary">{((pagination.currentPage - 1) * pagination.pageSize) + 1}</span> to{' '}
            <span className="font-semibold text-text-primary">
              {Math.min(pagination.currentPage * pagination.pageSize, pagination.totalItems || 0)}
            </span>{' '}
            of <span className="font-semibold text-text-primary">{pagination.totalItems || 0}</span> entries
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.currentPage <= 1}
              onClick={() => pagination.onPageChange(pagination.currentPage - 1)}
              leftIcon={ChevronLeftIcon}
            >
              Previous
            </Button>
            <span className="px-2 font-medium text-text-primary">
              Page {pagination.currentPage} of {pagination.totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.currentPage >= (pagination.totalPages || 1)}
              onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
              rightIcon={ChevronRightIcon}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
