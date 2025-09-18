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
  type: 'SALES' | 'INVENTORY' | 'CUSTOMER';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  details: AlertDetail;
}

export interface Insight {
  trends: TrendData[];
  recommendations: Recommendation[];
  alerts: Alert[];
}