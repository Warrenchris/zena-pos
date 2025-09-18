export interface SalesTrend {
  date: string;
  totalSales: number;
}

export interface ProductStock {
  id: number;
  name: string;
  currentStock: number;
  reorderPoint?: number;
}

export interface ExpenseCategory {
  category: string;
  amount: number;
}

export interface BusinessRecommendation {
  type: 'INVENTORY' | 'FINANCIAL' | 'SALES';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  message: string;
  details: ProductStock[] | ExpenseCategory[] | any;
}

export interface BusinessAlert {
  type: 'INVENTORY' | 'FINANCIAL' | 'SALES';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  message: string;
  details: ProductStock | {
    date: string;
    amount: number;
    average: number;
  } | any;
}

export interface BusinessInsights {
  trends: SalesTrend[];
  recommendations: BusinessRecommendation[];
  alerts: BusinessAlert[];
}
