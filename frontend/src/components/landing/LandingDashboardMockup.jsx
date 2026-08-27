import React from 'react';
import ProductScreenshot from './shared/ProductScreenshot';

export default function LandingDashboardMockup({ variant = 'light' }) {
  const floatingMetrics = [
    { label: "Today's Sales", value: '●●●●●', top: '15%', right: '-8%' },
    { label: 'Low Stock', value: '●● items', bottom: '20%', left: '-6%' }
  ];

  return (
    <ProductScreenshot variant={variant} floatingMetrics={floatingMetrics}>
      <div className="flex h-[400px] md:h-[500px] w-full bg-surface overflow-hidden text-sm">
        {/* Sidebar Mock */}
        <div className="hidden sm:flex flex-col w-48 md:w-56 bg-surface-2 dark:bg-[#1C1917] border-r border-border-default shrink-0 p-4 space-y-6">
          <div className="h-6 w-24 bg-surface-3 rounded-md mb-4"></div>
          <div className="space-y-4">
            <div className="h-4 w-3/4 bg-border-default rounded-full"></div>
            <div className="h-4 w-1/2 bg-border-default rounded-full"></div>
            <div className="h-4 w-2/3 bg-border-default rounded-full"></div>
            <div className="h-4 w-3/5 bg-border-default rounded-full"></div>
            <div className="h-4 w-4/5 bg-border-default rounded-full"></div>
            <div className="h-4 w-1/2 bg-border-default rounded-full"></div>
          </div>
          <div className="mt-auto">
            <div className="h-10 w-full bg-border-default rounded-md"></div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
          {/* Top Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {/* Stat 1 */}
            <div className="p-4 rounded-xl border border-border-default bg-surface flex flex-col justify-center space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                <div className="h-3 w-16 bg-border-default rounded-full"></div>
              </div>
              <div className="h-6 w-24 bg-surface-3 rounded-md"></div>
            </div>
            {/* Stat 2 */}
            <div className="p-4 rounded-xl border border-border-default bg-surface flex flex-col justify-center space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                <div className="h-3 w-16 bg-border-default rounded-full"></div>
              </div>
              <div className="h-6 w-20 bg-surface-3 rounded-md"></div>
            </div>
            {/* Stat 3 */}
            <div className="p-4 rounded-xl border border-border-default bg-surface flex flex-col justify-center space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                <div className="h-3 w-16 bg-border-default rounded-full"></div>
              </div>
              <div className="h-6 w-12 bg-surface-3 rounded-md"></div>
            </div>
            {/* Stat 4 */}
            <div className="p-4 rounded-xl border border-border-default bg-surface flex flex-col justify-center space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-primary"></div>
                <div className="h-3 w-16 bg-border-default rounded-full"></div>
              </div>
              <div className="h-6 w-16 bg-surface-3 rounded-md"></div>
            </div>
          </div>

          {/* Panels */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 overflow-hidden">
            {/* Chart Panel */}
            <div className="md:col-span-2 rounded-xl border border-border-default bg-surface p-4 flex flex-col">
              <div className="h-4 w-32 bg-surface-3 rounded-full mb-6"></div>
              <div className="flex-1 flex items-end justify-between space-x-2 md:space-x-4 pt-4 border-b border-border-default pb-2">
                <div className="w-full bg-border-default/50 rounded-t-md h-[40%]"></div>
                <div className="w-full bg-border-default/70 rounded-t-md h-[60%]"></div>
                <div className="w-full bg-border-default/40 rounded-t-md h-[30%]"></div>
                <div className="w-full bg-border-default/90 rounded-t-md h-[80%]"></div>
                <div className="w-full bg-border-default/60 rounded-t-md h-[50%]"></div>
                <div className="w-full bg-primary/40 rounded-t-md h-[70%]"></div>
                <div className="w-full bg-primary/80 rounded-t-md h-[95%]"></div>
              </div>
            </div>

            {/* Recent List Panel */}
            <div className="rounded-xl border border-border-default bg-surface p-4 flex flex-col overflow-hidden">
              <div className="h-4 w-24 bg-surface-3 rounded-full mb-6 shrink-0"></div>
              <div className="flex-1 flex flex-col space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-surface-3 shrink-0"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-2.5 w-full bg-border-default rounded-full"></div>
                      <div className="h-2.5 w-2/3 bg-border-default/60 rounded-full"></div>
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
