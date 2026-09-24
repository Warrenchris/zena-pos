/**
 * Pure function to build a toast payload for product import results.
 *
 * @param {object} result - Import response object from /api/products/import
 * @returns {{ type: 'success' | 'warning' | 'error', title: string, message: string, duration: number }}
 */
export function buildImportToast(result) {
  const imported = result?.summary?.successful ?? 0;
  const skipped = result?.summary?.skipped ?? 0;
  const warnings = result?.warnings?.length ?? 0;
  const created = result?.createdCategories?.length ?? 0;

  if (result?.success === false) {
    return {
      type: 'error',
      title: 'Import Failed',
      message: result?.message || '0 products imported',
      duration: 7000
    };
  }

  if (skipped > 0 || warnings > 0) {
    let message = `${imported} imported, ${skipped} skipped`;
    if (warnings > 0) {
      message += `, ${warnings} with cost 0`;
    }
    message += ' See details in the import window.';

    return {
      type: 'warning',
      title: 'Import Completed With Issues',
      message,
      duration: 7000
    };
  }

  const productLabel = imported === 1 ? '1 product' : `${imported} products`;
  let message = `${productLabel} imported`;

  if (created > 0) {
    const categoryLabel = created === 1 ? '1 category' : `${created} categories`;
    message += ` and ${categoryLabel} created`;
  }

  return {
    type: 'success',
    title: 'Products Imported',
    message,
    duration: 5000
  };
}
