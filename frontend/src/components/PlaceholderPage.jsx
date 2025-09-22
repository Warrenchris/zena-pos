import React, { useMemo, useState } from 'react';
import { 
  MagnifyingGlassIcon,
  PlusIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';

const PlaceholderPage = () => {
  const title = useMemo(() => {
    const seg = window.location.pathname.split('/').filter(Boolean).pop() || 'Page';
    return seg.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  }, []);

  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((it) => it.name.toLowerCase().includes(q) || String(it.id).includes(q));
  }, [items, search]);

  const handleCreate = () => {
    setCreating(true);
    // Simulate creating a record locally
    const now = new Date();
    const newItem = {
      id: items.length + 1,
      name: `${title} ${items.length + 1}`,
      createdAt: now.toLocaleString(),
    };
    setItems((prev) => [newItem, ...prev]);
    setTimeout(() => setCreating(false), 300);
  };

  return (
    <div className="px-6 py-6">
      {/* Header / Toolbar */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-yellow">{title}</h1>
          <p className="text-sm text-gray-400">Manage your {title.toLowerCase()} here.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              type="search"
              placeholder={`Search ${title.toLowerCase()}...`}
              className="block w-64 pl-10 pr-3 py-2 border border-brand-yellow/20 rounded-lg bg-brand-black text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-transparent"
            />
          </div>
          <button className="inline-flex items-center gap-2 px-3 py-2 border border-brand-yellow/30 rounded-lg text-sm text-gray-100 hover:bg-black/40">
            <FunnelIcon className="h-5 w-5" />
            Filters
          </button>
          <button className="inline-flex items-center gap-2 px-3 py-2 border border-brand-yellow/40 rounded-lg text-sm font-medium text-brand-black bg-brand-yellow hover:bg-brand-yellowDark disabled:opacity-70" onClick={handleCreate} disabled={creating}>
            <PlusIcon className="h-5 w-5" />
            {creating ? 'Creating...' : `New ${title}`}
          </button>
        </div>
      </div>

      {/* Card */}
      <div className="bg-brand-gray border border-brand-yellow/20 rounded-xl overflow-hidden">
        {/* Table actions */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-brand-yellow/10">
          <div className="text-sm text-gray-300">
            {filtered.length} {filtered.length === 1 ? 'record' : 'records'}
          </div>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-black/40 rounded-lg">
              <ArrowDownTrayIcon className="h-5 w-5" />
              Export
            </button>
          </div>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
              <span className="text-brand-yellow">◎</span>
            </div>
            <p className="text-gray-300 mb-1">No {title.toLowerCase()} found</p>
            <p className="text-gray-500 text-sm">Try adjusting your search or create a new one.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-brand-yellow/10">
              <thead className="bg-black/40">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">Created At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-yellow/10">
                {filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-black/40">
                    <td className="px-6 py-3 text-sm text-gray-200">{row.id}</td>
                    <td className="px-6 py-3 text-sm text-gray-100">{row.name}</td>
                    <td className="px-6 py-3 text-sm text-gray-400">{row.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlaceholderPage;
