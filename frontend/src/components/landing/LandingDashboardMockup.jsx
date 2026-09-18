import React from 'react';
import ProductScreenshot from './shared/ProductScreenshot';
import {
  ArrowTrendingUpIcon,
  ShoppingBagIcon,
  ExclamationCircleIcon,
  DevicePhoneMobileIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

export default function LandingDashboardMockup({ variant = 'light' }) {
  const isDark = variant === 'dark';

  const floatingMetrics = [
    { label: "Today's Gross Sales", value: 'KES 148,250', top: '12%', right: '-6%' },
    { label: 'Low Stock Alert', value: '4 items need reorder', bottom: '16%', left: '-5%' }
  ];

  const recentTransactions = [
    { id: '#2942', title: 'Brookside Fresh Milk 500ml (x6)', amount: 'KES 3,600', method: 'M-Pesa STK', time: '2m ago' },
    { id: '#2941', title: 'Dawaat Basmati Rice 5kg', amount: 'KES 1,850', method: 'Cash', time: '7m ago' },
    { id: '#2940', title: 'Top Fry Cooking Oil 3L', amount: 'KES 2,450', method: 'M-Pesa STK', time: '14m ago' },
    { id: '#2939', title: 'Pwani White Sugar 2kg (x2)', amount: 'KES 980', method: 'Card', time: '22m ago' },
  ];

  return (
    <ProductScreenshot variant={variant} floatingMetrics={floatingMetrics}>
      <div className={`flex h-[420px] md:h-[520px] w-full overflow-hidden text-sm ${
        isDark ? 'bg-[#1C1917] text-white' : 'bg-surface text-text-primary'
      }`}>
        {/* Sidebar Mock */}
        <div className={`hidden sm:flex flex-col w-48 md:w-52 border-r shrink-0 p-4 space-y-4 ${
          isDark ? 'bg-[#181513] border-white/10' : 'bg-surface-2 border-border-default'
        }`}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-white text-xs font-bold">
              Z
            </div>
            <span className="font-bold text-small tracking-tight">Main Branch</span>
          </div>

          <div className="space-y-1 text-small">
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-primary/10 text-primary font-semibold">
              <span className="w-2 h-2 rounded-full bg-primary" />
              <span>Dashboard</span>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-text-secondary hover:bg-surface-3 transition-colors">
              <ShoppingBagIcon className="w-4 h-4" />
              <span>POS Terminal</span>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-text-secondary hover:bg-surface-3 transition-colors">
              <span>Inventory</span>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-text-secondary hover:bg-surface-3 transition-colors">
              <span>Purchases</span>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-text-secondary hover:bg-surface-3 transition-colors">
              <span>AI Forecast</span>
            </div>
          </div>

          <div className="mt-auto pt-4 border-t border-border-default/60">
            <div className="flex items-center justify-between text-[11px] text-text-muted">
              <span>Status</span>
              <span className="flex items-center gap-1 text-emerald-500 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Cloud Sync
              </span>
            </div>
          </div>
        </div>

        {/* Main Dashboard Area */}
        <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-5">
            {/* KPI 1 */}
            <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
              isDark ? 'bg-[#231F1C] border-white/10' : 'bg-surface border-border-default shadow-2xs'
            }`}>
              <div className="flex items-center justify-between text-caption text-text-muted">
                <span>Today's Sales</span>
                <ArrowTrendingUpIcon className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="mt-2">
                <div className="text-h3 font-extrabold tracking-tight">KES 148,250</div>
                <div className="text-[11px] text-emerald-600 font-medium mt-0.5">+18.4% vs yesterday</div>
              </div>
            </div>

            {/* KPI 2 */}
            <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
              isDark ? 'bg-[#231F1C] border-white/10' : 'bg-surface border-border-default shadow-2xs'
            }`}>
              <div className="flex items-center justify-between text-caption text-text-muted">
                <span>Receipts Issued</span>
                <CheckCircleIcon className="w-4 h-4 text-primary" />
              </div>
              <div className="mt-2">
                <div className="text-h3 font-extrabold tracking-tight">142 Orders</div>
                <div className="text-[11px] text-text-muted font-medium mt-0.5">Avg KES 1,044 / sale</div>
              </div>
            </div>

            {/* KPI 3 */}
            <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
              isDark ? 'bg-[#231F1C] border-white/10' : 'bg-surface border-border-default shadow-2xs'
            }`}>
              <div className="flex items-center justify-between text-caption text-text-muted">
                <span>M-Pesa STK Share</span>
                <DevicePhoneMobileIcon className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="mt-2">
                <div className="text-h3 font-extrabold tracking-tight">KES 96,400</div>
                <div className="text-[11px] text-emerald-600 font-medium mt-0.5">65% of total turnover</div>
              </div>
            </div>

            {/* KPI 4 */}
            <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
              isDark ? 'bg-[#231F1C] border-white/10' : 'bg-surface border-border-default shadow-2xs'
            }`}>
              <div className="flex items-center justify-between text-caption text-text-muted">
                <span>Stock Restock</span>
                <ExclamationCircleIcon className="w-4 h-4 text-amber-500" />
              </div>
              <div className="mt-2">
                <div className="text-h3 font-extrabold tracking-tight">4 Low Stock</div>
                <div className="text-[11px] text-amber-600 font-medium mt-0.5">Automated PO ready</div>
              </div>
            </div>
          </div>

          {/* Lower Grid: Chart & Real Transactions */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 overflow-hidden">
            {/* Sales Chart Panel */}
            <div className={`md:col-span-2 rounded-xl border p-4 flex flex-col justify-between ${
              isDark ? 'bg-[#231F1C] border-white/10' : 'bg-surface border-border-default shadow-2xs'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="font-bold text-small">Hourly Revenue Trajectory</h4>
                  <p className="text-[11px] text-text-muted">Peak rush hour between 12:00 PM and 6:00 PM</p>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600">
                  +24% Target
                </span>
              </div>

              {/* Bar Chart Visual */}
              <div className="flex-1 flex items-end justify-between gap-2 pt-6 border-b border-border-default/60 pb-2">
                {[
                  { hour: '8 AM', height: '35%', val: '12k' },
                  { hour: '10 AM', height: '55%', val: '24k' },
                  { hour: '12 PM', height: '80%', val: '38k' },
                  { hour: '2 PM', height: '65%', val: '28k' },
                  { hour: '4 PM', height: '90%', val: '42k' },
                  { hour: '6 PM', height: '75%', val: '34k' },
                  { hour: '8 PM', height: '40%', val: '18k' },
                ].map((col) => (
                  <div key={col.hour} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                    <div
                      className="w-full rounded-t-md transition-all duration-300 bg-primary/80 group-hover:bg-primary"
                      style={{ height: col.height }}
                    />
                    <span className="text-[10px] text-text-muted whitespace-nowrap">{col.hour}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Orders Panel */}
            <div className={`rounded-xl border p-4 flex flex-col overflow-hidden ${
              isDark ? 'bg-[#231F1C] border-white/10' : 'bg-surface border-border-default shadow-2xs'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-small">Recent Checkouts</h4>
                <span className="text-[11px] text-primary font-semibold">Live stream</span>
              </div>

              <div className="flex-1 space-y-2.5 overflow-hidden">
                {recentTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className={`p-2.5 rounded-lg border flex items-center justify-between text-[12px] ${
                      isDark ? 'bg-[#1C1917] border-white/5' : 'bg-surface-2/60 border-border-default/60'
                    }`}
                  >
                    <div className="overflow-hidden pr-2">
                      <div className="font-semibold truncate">{tx.title}</div>
                      <div className="text-[10px] text-text-muted flex items-center gap-1.5 mt-0.5">
                        <span>{tx.id}</span>
                        <span>•</span>
                        <span className="text-emerald-600 font-medium">{tx.method}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold">{tx.amount}</div>
                      <div className="text-[10px] text-text-muted">{tx.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProductScreenshot>
  );
}
