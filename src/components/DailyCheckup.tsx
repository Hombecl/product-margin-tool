'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  RefreshCw,
  ExternalLink,
  Trophy,
  TrendingDown,
  AlertCircle,
  Clock,
  DollarSign,
  Users,
  CheckCircle,
  XCircle,
  Loader,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface Seller {
  name: string;
  price: number;
  shipping: number;
  freeShipping: boolean;
  total: number;
  isOurs: boolean;
  rank: number;
}

interface Product {
  id: string;
  sku: string;
  productId: string;
  title: string;
  store: string;
  status: string;
  sales7Day: number;
  ourRank: number | null;
  ourPrice: number | null;
  ourShipping: number | null;
  ourTotal: number | null;
  isWinning: boolean;
  lowest3PPrice: number | null;
  priceDiff: number | null;
  totalSellers: number;
  lastCheck: string | null;
  sellers: Seller[];
  walmartUrl: string;
}

interface Summary {
  totalProducts: number;
  winning: number;
  losing: number;
  notFound: number;
  lastCheck: string | null;
}

const STORE_NAMES: Record<string, string> = {
  WM19: 'VitalNest Goods',
  WM24: 'zhangbinhai'
};

export default function DailyCheckup() {
  const [products, setProducts] = useState<Product[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [triggering, setTriggering] = useState(false);
  const [storeFilter, setStoreFilter] = useState<'all' | 'WM19' | 'WM24'>('all');
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      params.set('limit', '10');
      if (storeFilter !== 'all') {
        params.set('store', storeFilter);
      }

      const res = await fetch(`/api/daily-checkup?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch data');
      }

      setProducts(data.products);
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [storeFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const triggerCheck = async () => {
    setTriggering(true);
    try {
      const res = await fetch('/api/daily-checkup', { method: 'POST' });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to trigger check');
      }

      // Refresh data after a short delay
      setTimeout(() => {
        fetchData();
        setTriggering(false);
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger check');
      setTriggering(false);
    }
  };

  const formatTimeAgo = (isoString: string | null) => {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getStatusBadge = (product: Product) => {
    if (product.ourRank === null) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          <AlertCircle size={12} />
          Not Found
        </span>
      );
    }
    if (product.isWinning) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <Trophy size={12} />
          Winning
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <TrendingDown size={12} />
        Losing
      </span>
    );
  };

  const getRankDisplay = (product: Product) => {
    if (product.ourRank === null) return '-';
    const total3P = product.totalSellers - (product.sellers.some(s => s.name.toLowerCase().includes('walmart')) ? 1 : 0);
    return `#${product.ourRank} of ${product.totalSellers}`;
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
              <h1 className="text-xl font-bold text-slate-800">Daily Check-up</h1>
              <p className="text-sm text-slate-500">Top 10 products competitor analysis</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={triggerCheck}
              disabled={triggering}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {triggering ? (
                <Loader size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              {triggering ? 'Running...' : 'Run Check'}
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Users size={16} />
                <span className="text-xs font-medium">Total Products</span>
              </div>
              <p className="text-2xl font-bold text-slate-800">{summary.totalProducts}</p>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-green-200 bg-green-50">
              <div className="flex items-center gap-2 text-green-600 mb-1">
                <CheckCircle size={16} />
                <span className="text-xs font-medium">Winning</span>
              </div>
              <p className="text-2xl font-bold text-green-700">{summary.winning}</p>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-red-200 bg-red-50">
              <div className="flex items-center gap-2 text-red-600 mb-1">
                <XCircle size={16} />
                <span className="text-xs font-medium">Losing</span>
              </div>
              <p className="text-2xl font-bold text-red-700">{summary.losing}</p>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Clock size={16} />
                <span className="text-xs font-medium">Last Check</span>
              </div>
              <p className="text-lg font-bold text-slate-800">{formatTimeAgo(summary.lastCheck)}</p>
            </div>
          </div>
        )}

        {/* Store Filter */}
        <div className="flex gap-2 mb-4">
          {(['all', 'WM19', 'WM24'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStoreFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                storeFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {s === 'all' ? 'All Stores' : `${s} (${STORE_NAMES[s]})`}
            </button>
          ))}
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader size={32} className="animate-spin text-blue-600" />
          </div>
        ) : (
          /* Product List */
          <div className="space-y-3">
            {products.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center border border-slate-200">
                <p className="text-slate-500">No products found. Run a check to get started.</p>
              </div>
            ) : (
              products.map((product, index) => (
                <div
                  key={product.id}
                  className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
                >
                  {/* Main Row */}
                  <div
                    className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => setExpandedProduct(expandedProduct === product.id ? null : product.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-sm font-bold text-slate-500">
                          {index + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800">{product.sku}</span>
                            <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                              {product.store}
                            </span>
                            {getStatusBadge(product)}
                          </div>
                          <p className="text-sm text-slate-500 mt-0.5 truncate max-w-md">
                            {product.title}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        {/* 7-Day Sales */}
                        <div className="text-right">
                          <p className="text-xs text-slate-500">7D Sales</p>
                          <p className="font-semibold text-slate-800">{product.sales7Day}</p>
                        </div>

                        {/* Our Price */}
                        <div className="text-right">
                          <p className="text-xs text-slate-500">Our Price</p>
                          <p className="font-semibold text-slate-800">
                            {product.ourTotal !== null ? `$${product.ourTotal.toFixed(2)}` : '-'}
                          </p>
                        </div>

                        {/* Rank */}
                        <div className="text-right">
                          <p className="text-xs text-slate-500">Rank</p>
                          <p className={`font-semibold ${product.isWinning ? 'text-green-600' : product.ourRank !== null ? 'text-red-600' : 'text-slate-400'}`}>
                            {getRankDisplay(product)}
                          </p>
                        </div>

                        {/* Price Diff */}
                        <div className="text-right w-20">
                          <p className="text-xs text-slate-500">vs Lowest</p>
                          <p className={`font-semibold ${
                            product.priceDiff === null ? 'text-slate-400' :
                            product.priceDiff <= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {product.priceDiff !== null
                              ? `${product.priceDiff > 0 ? '+' : ''}$${product.priceDiff.toFixed(2)}`
                              : '-'}
                          </p>
                        </div>

                        {/* Expand Icon */}
                        <div className="text-slate-400">
                          {expandedProduct === product.id ? (
                            <ChevronUp size={20} />
                          ) : (
                            <ChevronDown size={20} />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedProduct === product.id && (
                    <div className="border-t border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-slate-700">All Sellers ({product.totalSellers})</h4>
                        <a
                          href={product.walmartUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm"
                        >
                          View on Walmart <ExternalLink size={14} />
                        </a>
                      </div>

                      {product.sellers.length > 0 ? (
                        <div className="space-y-2">
                          {product.sellers.map((seller, i) => (
                            <div
                              key={i}
                              className={`flex items-center justify-between p-3 rounded-lg ${
                                seller.isOurs
                                  ? 'bg-blue-100 border border-blue-200'
                                  : 'bg-white border border-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                  seller.rank === 1 ? 'bg-yellow-400 text-yellow-900' :
                                  seller.rank === 2 ? 'bg-gray-300 text-gray-700' :
                                  seller.rank === 3 ? 'bg-amber-600 text-white' :
                                  'bg-slate-200 text-slate-600'
                                }`}>
                                  {seller.rank}
                                </span>
                                <div>
                                  <span className={`font-medium ${seller.isOurs ? 'text-blue-800' : 'text-slate-800'}`}>
                                    {seller.name}
                                  </span>
                                  {seller.isOurs && (
                                    <span className="ml-2 text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded">
                                      YOUR STORE
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-4 text-sm">
                                <div className="text-right">
                                  <span className="text-slate-500">Price:</span>
                                  <span className="ml-1 font-medium">${seller.price.toFixed(2)}</span>
                                </div>
                                <div className="text-right">
                                  <span className="text-slate-500">Ship:</span>
                                  <span className={`ml-1 font-medium ${seller.freeShipping ? 'text-green-600' : ''}`}>
                                    {seller.freeShipping ? 'FREE' : `$${seller.shipping.toFixed(2)}`}
                                  </span>
                                </div>
                                <div className="text-right font-bold text-slate-800">
                                  ${seller.total.toFixed(2)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-500 text-sm">No seller data available. Run a check to fetch data.</p>
                      )}

                      <div className="mt-3 text-xs text-slate-500">
                        Last checked: {formatTimeAgo(product.lastCheck)}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
