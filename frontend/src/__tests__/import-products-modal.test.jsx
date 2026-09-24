import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ImportProductsModal from '../components/ImportProductsModal';
import api from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

describe('ImportProductsModal handleUpload endpoint & error handling', () => {
  beforeEach(() => {
    jest.setTimeout(30000);
    jest.clearAllMocks();
  });

  it('posts to /api/products/import with multipart Content-Type header on handleUpload', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        message: 'Import completed. 1 products imported successfully.',
        summary: { successful: 1, skipped: 0, errors: 0 },
        successfulProducts: [{ name: 'Sample Product 1', sku: 'SKU001' }],
        errors: [],
      },
    });

    const onImportComplete = jest.fn();
    render(<ImportProductsModal onClose={jest.fn()} onImportComplete={onImportComplete} />);

    const file = new File(['name,price\nItem 1,100'], 'products.csv', { type: 'text/csv' });
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [file] } });

    const importButton = screen.getByRole('button', { name: /import products/i });
    expect(importButton).not.toBeDisabled();

    fireEvent.click(importButton);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledTimes(1);
    });

    expect(api.post).toHaveBeenCalledWith(
      '/api/products/import',
      expect.any(FormData),
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    await waitFor(() => {
      expect(screen.getByText('Import Completed')).toBeInTheDocument();
      expect(screen.getByText(/Sample Product 1/)).toBeInTheDocument();
    });

    expect(onImportComplete).toHaveBeenCalledTimes(1);
    expect(onImportComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        summary: { successful: 1, skipped: 0, errors: 0 }
      })
    );
  });

  it('displays err.response.data.error when import fails with an error property', async () => {
    api.post.mockRejectedValueOnce({
      response: {
        status: 400,
        data: { error: 'Invalid product format or corrupted file' },
      },
    });

    render(<ImportProductsModal onClose={jest.fn()} />);
    const file = new File(['bad data'], 'products.csv', { type: 'text/csv' });
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: /import products/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid product format or corrupted file')).toBeInTheDocument();
    });
  });

  it('displays err.response.data.message when error property is absent', async () => {
    api.post.mockRejectedValueOnce({
      response: {
        status: 422,
        data: { message: 'Unprocessable spreadsheet entity' },
      },
    });

    render(<ImportProductsModal onClose={jest.fn()} />);
    const file = new File(['data'], 'products.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: /import products/i }));

    await waitFor(() => {
      expect(screen.getByText('Unprocessable spreadsheet entity')).toBeInTheDocument();
    });
  });

  it('falls back to status code when data.error and data.message are missing', async () => {
    api.post.mockRejectedValueOnce({
      response: {
        status: 404,
        data: {},
      },
    });

    render(<ImportProductsModal onClose={jest.fn()} />);
    const file = new File(['data'], 'products.csv', { type: 'text/csv' });
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: /import products/i }));

    await waitFor(() => {
      expect(screen.getByText(/HTTP 404/)).toBeInTheDocument();
    });
  });

  it('renders result.warnings with summary line when warnings are present in import response', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        message: 'Import completed. 2 products imported successfully.',
        summary: { successful: 2, skipped: 0, errors: 0, warnings: 2 },
        successfulProducts: [
          { name: 'Prod 1', sku: 'SKU001' },
          { name: 'Prod 2', sku: 'SKU002' },
        ],
        errors: [],
        warnings: [
          { row: 2, field: 'cost', message: 'Row 2: cost is missing; defaulted to 0' },
          { row: 3, field: 'cost', message: 'Row 3: cost is missing; defaulted to 0' },
        ],
      },
    });

    render(<ImportProductsModal onClose={jest.fn()} />);
    const file = new File(['name,price\nProd 1,100\nProd 2,200'], 'products.csv', { type: 'text/csv' });
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: /import products/i }));

    await waitFor(() => {
      expect(screen.getByText(/2 products imported with cost 0 because no cost column was found/)).toBeInTheDocument();
      expect(screen.getByText('Row 2: cost is missing; defaulted to 0')).toBeInTheDocument();
      expect(screen.getByText('Row 3: cost is missing; defaulted to 0')).toBeInTheDocument();
    });
  });

  it('renders created categories line when createdCategories are returned in response', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        message: 'Import completed. 2 products imported successfully.',
        summary: { successful: 2, skipped: 0, errors: 0 },
        successfulProducts: [
          { name: 'Prod 1', sku: 'SKU001' },
          { name: 'Prod 2', sku: 'SKU002' },
        ],
        errors: [],
        warnings: [],
        createdCategories: ['Electronics', 'Home Appliances'],
      },
    });

    render(<ImportProductsModal onClose={jest.fn()} />);
    const file = new File(['name,price,category\nProd 1,100,Electronics\nProd 2,200,Home Appliances'], 'products.csv', { type: 'text/csv' });
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: /import products/i }));

    await waitFor(() => {
      expect(screen.getByText('2 categories created: Electronics, Home Appliances')).toBeInTheDocument();
    });
  });

  it('calls onImportError with error message when api.post rejects', async () => {
    api.post.mockRejectedValueOnce({
      response: {
        status: 400,
        data: { error: 'Invalid product format or corrupted file' },
      },
    });

    const onImportError = jest.fn();
    render(<ImportProductsModal onClose={jest.fn()} onImportError={onImportError} />);
    const file = new File(['bad data'], 'products.csv', { type: 'text/csv' });
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: /import products/i }));

    await waitFor(() => {
      expect(onImportError).toHaveBeenCalledTimes(1);
      expect(onImportError).toHaveBeenCalledWith('Invalid product format or corrupted file');
    });
  });
});


