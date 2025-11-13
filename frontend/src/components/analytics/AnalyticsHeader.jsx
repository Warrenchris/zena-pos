import React, { useState } from 'react';
import { HiSearch, HiBell } from 'react-icons/hi';

const AnalyticsHeader = () => {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <header className="rounded-[20px] border border-yellow-400/25 bg-gradient-to-r from-[#101321] via-[#0c0f1c] to-[#090b14] p-6 shadow-[0_0_32px_rgba(250,204,21,0.12)]">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-2xl">
          <HiSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-yellow-200/70" />
          <input
            type="text"
            placeholder="Search analytics, orders, or insights"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-full border border-yellow-400/20 bg-black/40 py-3 pl-12 pr-4 text-sm text-white placeholder:text-white/40 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/40"
          />
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-4">
          <select className="rounded-full border border-yellow-400/30 bg-black/40 px-4 py-2 text-sm font-medium text-yellow-100 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/40">
            <option className="bg-[#0b0f1b] text-white">Last 7 days</option>
            <option className="bg-[#0b0f1b] text-white">Last 30 days</option>
            <option className="bg-[#0b0f1b] text-white">Last 90 days</option>
            <option className="bg-[#0b0f1b] text-white">This year</option>
          </select>

          <button
            type="button"
            className="rounded-full border border-yellow-400/40 bg-yellow-400 text-black px-4 py-2 text-sm font-semibold shadow-[0_0_24px_rgba(250,204,21,0.32)] transition hover:border-yellow-200 hover:bg-yellow-300"
          >
            Export Data
          </button>

          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-yellow-400/30 bg-black/40 text-yellow-200 transition hover:border-yellow-300 hover:text-yellow-100"
            aria-label="Notifications"
          >
            <HiBell className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default AnalyticsHeader;