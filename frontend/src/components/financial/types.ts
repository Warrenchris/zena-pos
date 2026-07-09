export interface TrendData {
  date: string;
  totalSales: number;
}

export interface RecommendationDetail {
  name: string;
  currentStock: number;
  reorderPoint: number;
}

export interface Recommendation {
  type: 'INVENTORY' | 'SALES' | 'CUSTOMER';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  details: RecommendationDetail[];
}

export interface AlertDetail {
  date: string;
  amount: number;
  average: number;
}

export interface Alert {
  type: 'SALES' | 'INVENTORY' | 'CUSTOMER' | 'sales_anomaly' | string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | string;
  message?: string;
  title?: string;
  description?: string;
  recommendation?: string;
  details?: any;
}

export interface Insight {
  trends: TrendData[];
  recommendations: Recommendation[];
  alerts: Alert[];
}