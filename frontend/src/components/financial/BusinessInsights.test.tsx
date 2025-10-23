import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import BusinessInsights from './BusinessInsights';
import { type Insight } from './types';

describe('BusinessInsights', () => {
  const mockInsights: Insight = {
    trends: [
      { date: '2023-09-17', totalSales: 1500, currencyCode: 'KES' }
    ],
    recommendations: [
      {
        type: 'INVENTORY',
        priority: 'HIGH',
        message: 'Low stock alert',
        details: [
          { name: 'Product 1', currentStock: 5, reorderPoint: 10 }
        ]
      }
    ],
    alerts: [
      {
        type: 'SALES',
        severity: 'MEDIUM',
        message: 'Sales decline detected',
        details: {
          date: '2023-09-17',
          amount: 1000,
          currencyCode: 'KES',
          average: 2000
        }
      }
    ]
  };

  it('renders all sections when data is provided', () => {
    render(<BusinessInsights insights={mockInsights} />);

    // Check for section headings
    expect(screen.getByText('Trends')).toBeInTheDocument();
    expect(screen.getByText('Recommendations')).toBeInTheDocument();
    expect(screen.getByText('Alerts')).toBeInTheDocument();

    // Check for specific content
    expect(screen.getByText('Low stock alert')).toBeInTheDocument();
    expect(screen.getByText('Sales decline detected')).toBeInTheDocument();
    expect(screen.getByText(/Product 1: 5 units/)).toBeInTheDocument();
  });

  it('renders nothing when insights is null', () => {
    const { container } = render(<BusinessInsights insights={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders correctly with empty arrays', () => {
    const emptyInsights = {
      trends: [],
      recommendations: [],
      alerts: []
    };

    const { container } = render(<BusinessInsights insights={emptyInsights} />);
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.queryByText('Trends')).not.toBeInTheDocument();
    expect(screen.queryByText('Recommendations')).not.toBeInTheDocument();
    expect(screen.queryByText('Alerts')).not.toBeInTheDocument();
  });
});