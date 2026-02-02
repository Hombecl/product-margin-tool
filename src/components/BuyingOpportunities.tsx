'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  ShoppingCart,
  Check,
  X,
  AlertTriangle,
  AlertCircle,
  Info,
  Loader
} from 'lucide-react';

interface Opportunity {
  id: string;
  sku: string;
  title: string;
  store: string;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  recommendedQty: number;
  shipperStatus: string;
  shipperEstQty: number;
  oosRegions: string;
  lowStockRegions: string;
  totalRegions: number;
  reason: string;
  status: string;
  actionedBy: string | null;
  actionedAt: string | null;
  qtyPurchased: number | null;
  walmartLink: string;
  lastCheck: string;
  notes: string;
}

const URGENCY_CONFIG = {
  HIGH: {
    label: 'HIGH',
    color: 'bg-red-100 text-red-700 border-red-200',
    icon: AlertTriangle,
    description: 'Buy Now'
  },
  MEDIUM: {
    label: 'MEDIUM',
    color: 'bg-orange-100 text-orange-700 border-orange-200',
    icon: AlertCircle,
    description: 'Buy Soon'
  },
  LOW: {
    label: 'LOW',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: Info,
    description: 'Consider'
  }
};

export default function BuyingOpportunities() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'HIGH' | 'MEDIUM' | 'LOW'>('all');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchOpportunities = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      params.set('status', 'Active');
      if (filter !== 'all') {
        params.set('urgency', filter);
      }

      const res = await fetch(`/api/buying-opportunities?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch opportunities');
      }

      setOpportunities(data.opportunities);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchOpportunities();
  }, [fetchOpportunities]);

  const handleAction = async (id: string, action: 'actioned' | 'skipped', qtyPurchased?: number) => {
    setActioningId(id);
    try {
      const res = await fetch('/api/buying-opportunities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordId: id,
          status: action === 'actioned' ? 'Actioned' : 'Skipped',
          actionedBy: 'Dashboard User',
          qtyPurchased: qtyPurchased || null
        })
      });

      if (res.ok) {
        // Remove from list
        setOpportunities(prev => prev.filter(o => o.id !== id));
      }
    } catch {
      // Silently fail, user can retry
    } finally {
      setActioningId(null);
    }
  };

  const formatTimeAgo = (isoString: string) => {
    if (!isoString) return 'Unknown';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const urgencyCounts = {
    HIGH: opportunities.filter(o => o.urgency === 'HIGH').length,
    MEDIUM: opportunities.filter(o => o.urgency === 'MEDIUM').length,
    LOW: opportunities.filter(o => o.urgency === 'LOW').length
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 font-sans">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
              <ArrowLeft size={20} className="text-slate-600" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Buying Opportunities</h1>
              <p className="text-sm text-slate-500">
                {lastRefresh ? `Last updated: ${formatTimeAgo(lastRefresh.toISOString())}` : 'Loading...'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchOpportunities}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <Link href="/product-discovery" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors">
              Discovery <ArrowRight size={16} />
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {(['HIGH', 'MEDIUM', 'LOW'] as const).map((level) => {
            const config = URGENCY_CONFIG[level];
            const Icon = config.icon;
            return (
              <button
                key={level}
                onClick={() => setFilter(filter === level ? 'all' : level)}
                className={`p-4 rounded-xl border-2 transition-all ${
                  filter === level
                    ? config.color + ' ring-2 ring-offset-2 ring-slate-400'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon size={18} />
                  <span className="font-bold">{level}</span>
                </div>
                <div className="text-2xl font-bold">{urgencyCounts[level]}</div>
                <div className="text-xs opacity-70">{config.description}</div>
              </button>
            );
          })}
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="text-red-500" size={20} />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        {/* Loading State */}
        {loading && opportunities.length === 0 && (
          <div className="flex justify-center items-center py-20">
            <Loader className="animate-spin text-slate-400" size={32} />
          </div>
        )}

        {/* Empty State */}
        {!loading && opportunities.length === 0 && (
          <div className="text-center py-20 bg-white rounded-xl border border-slate-200">
            <ShoppingCart className="mx-auto text-slate-300 mb-4" size={48} />
            <h3 className="text-lg font-bold text-slate-600 mb-2">No Active Opportunities</h3>
            <p className="text-slate-500">
              {filter !== 'all'
                ? `No ${filter} urgency opportunities found. Try changing the filter.`
                : 'All opportunities have been actioned or no scarcity detected.'}
            </p>
          </div>
        )}

        {/* Opportunities List */}
        <div className="space-y-4">
          {opportunities.map((opp) => {
            const config = URGENCY_CONFIG[opp.urgency];
            const Icon = config.icon;
            const isActioning = actioningId === opp.id;

            return (
              <div
                key={opp.id}
                className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: Product Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold border ${config.color}`}>
                        <Icon size={12} />
                        {config.label}
                      </span>
                      <span className="text-xs text-slate-400">{opp.store}</span>
                      <span className="text-xs text-slate-400">{formatTimeAgo(opp.lastCheck)}</span>
                    </div>
                    <h3 className="font-bold text-slate-800 truncate mb-1">{opp.title || opp.sku}</h3>
                    <p className="text-sm text-slate-500 mb-2">SKU: {opp.sku}</p>
                    <p className="text-sm text-slate-600 bg-slate-50 px-3 py-2 rounded-lg">
                      {opp.reason}
                    </p>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-col items-end gap-3">
                    {/* Recommended Qty */}
                    <div className="text-right">
                      <div className="text-xs text-slate-500 mb-1">Recommended</div>
                      <div className="text-2xl font-bold text-emerald-600">{opp.recommendedQty}</div>
                      <div className="text-xs text-slate-400">units</div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <a
                        href={opp.walmartLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium"
                      >
                        <ExternalLink size={14} />
                        Buy
                      </a>
                      <button
                        onClick={() => handleAction(opp.id, 'actioned', opp.recommendedQty)}
                        disabled={isActioning}
                        className="flex items-center gap-1 px-3 py-2 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors text-sm font-medium disabled:opacity-50"
                      >
                        {isActioning ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
                        Done
                      </button>
                      <button
                        onClick={() => handleAction(opp.id, 'skipped')}
                        disabled={isActioning}
                        className="flex items-center gap-1 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium disabled:opacity-50"
                      >
                        <X size={14} />
                        Skip
                      </button>
                    </div>
                  </div>
                </div>

                {/* Region Details */}
                <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-slate-400">Shipper (77057)</span>
                    <div className="font-medium text-slate-700">
                      {opp.shipperStatus} ({opp.shipperEstQty} est.)
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400">OOS Regions</span>
                    <div className="font-medium text-red-600">{opp.oosRegions || 'None'}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Low Stock Regions</span>
                    <div className="font-medium text-orange-600">{opp.lowStockRegions || 'None'}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Total Checked</span>
                    <div className="font-medium text-slate-700">{opp.totalRegions} regions</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
