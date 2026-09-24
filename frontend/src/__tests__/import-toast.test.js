import { buildImportToast } from '../utils/importToast';

describe('buildImportToast', () => {
  describe('All-success cases', () => {
    it('returns success toast without created categories', () => {
      const result = {
        success: true,
        summary: { successful: 5, skipped: 0 }
      };
      const toast = buildImportToast(result);
      expect(toast).toEqual({
        type: 'success',
        title: 'Products Imported',
        message: '5 products imported',
        duration: 5000
      });
    });

    it('returns success toast with created categories', () => {
      const result = {
        success: true,
        summary: { successful: 10, skipped: 0 },
        createdCategories: ['Beverages', 'Snacks']
      };
      const toast = buildImportToast(result);
      expect(toast).toEqual({
        type: 'success',
        title: 'Products Imported',
        message: '10 products imported and 2 categories created',
        duration: 5000
      });
    });
  });

  describe('Partial success (skipped > 0)', () => {
    it('returns warning toast when some rows are skipped', () => {
      const result = {
        success: true,
        summary: { successful: 8, skipped: 3 }
      };
      const toast = buildImportToast(result);
      expect(toast).toEqual({
        type: 'warning',
        title: 'Import Completed With Issues',
        message: '8 imported, 3 skipped See details in the import window.',
        duration: 7000
      });
    });
  });

  describe('Warnings only (cost 0)', () => {
    it('returns warning toast when cost 0 warnings exist with 0 skipped', () => {
      const result = {
        success: true,
        summary: { successful: 10, skipped: 0 },
        warnings: ['Row 1: Missing cost defaulted to 0', 'Row 2: Missing cost defaulted to 0']
      };
      const toast = buildImportToast(result);
      expect(toast).toEqual({
        type: 'warning',
        title: 'Import Completed With Issues',
        message: '10 imported, 0 skipped, 2 with cost 0 See details in the import window.',
        duration: 7000
      });
    });

    it('returns warning toast with both skipped and warnings', () => {
      const result = {
        success: true,
        summary: { successful: 7, skipped: 2 },
        warnings: ['Row 1: Missing cost defaulted to 0']
      };
      const toast = buildImportToast(result);
      expect(toast).toEqual({
        type: 'warning',
        title: 'Import Completed With Issues',
        message: '7 imported, 2 skipped, 1 with cost 0 See details in the import window.',
        duration: 7000
      });
    });
  });

  describe('Zero-imported (success: false)', () => {
    it('returns error toast with result.message when present', () => {
      const result = {
        success: false,
        message: '0 products imported, 3 rows skipped. See errors below.',
        summary: { successful: 0, skipped: 3 }
      };
      const toast = buildImportToast(result);
      expect(toast).toEqual({
        type: 'error',
        title: 'Import Failed',
        message: '0 products imported, 3 rows skipped. See errors below.',
        duration: 7000
      });
    });

    it('returns error toast with fallback message when result.message is missing', () => {
      const result = {
        success: false
      };
      const toast = buildImportToast(result);
      expect(toast).toEqual({
        type: 'error',
        title: 'Import Failed',
        message: '0 products imported',
        duration: 7000
      });
    });
  });

  describe('Singular vs plural wording', () => {
    it('handles singular product (1 product)', () => {
      const result = {
        success: true,
        summary: { successful: 1, skipped: 0 }
      };
      const toast = buildImportToast(result);
      expect(toast.message).toBe('1 product imported');
    });

    it('handles singular category (1 category)', () => {
      const result = {
        success: true,
        summary: { successful: 1, skipped: 0 },
        createdCategories: ['Electronics']
      };
      const toast = buildImportToast(result);
      expect(toast.message).toBe('1 product imported and 1 category created');
    });

    it('handles plural products and singular category', () => {
      const result = {
        success: true,
        summary: { successful: 2, skipped: 0 },
        createdCategories: ['Electronics']
      };
      const toast = buildImportToast(result);
      expect(toast.message).toBe('2 products imported and 1 category created');
    });

    it('handles plural products and plural categories', () => {
      const result = {
        success: true,
        summary: { successful: 4, skipped: 0 },
        createdCategories: ['Electronics', 'Home']
      };
      const toast = buildImportToast(result);
      expect(toast.message).toBe('4 products imported and 2 categories created');
    });
  });
});
