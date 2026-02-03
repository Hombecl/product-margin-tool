'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  Trophy,
  TrendingDown,
  AlertCircle,
  Clock,
  DollarSign,
  Package,
  Users,
  CheckCircle,
  XCircle,
  Loader,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ShoppingCart,
  Star,
  Link as LinkIcon,
  Trash2,
  Calendar,
  Square,
  CheckSquare,
  X
} from 'lucide-react';

interface Seller {
  name: string;
  price: number;
  shipping?: number;
  freeShipping?: boolean;
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
  sales3Day: number;
  sales7Day: number;
  sales14Day: number;
  // Pricing
  productCost: number | null;
  ourSellingPrice: number | null;
  declaredPrice: number | null;
  walmartPrice: number | null;
  // Inventory
  totalInventory: number;
  fcInventory: number;
  defaultInventory: number;
  inventoryWarning: boolean;
  publishedStatus: string;
  // Margin
  marginDollar: number | null;
  marginPercent: number | null;
  // Competition
  ourRank: number | null;
  ourPrice: number | null;
  ourShipping: number | null;
  ourTotal: number | null;
  isWinning: boolean;
  lowest3PPrice: number | null;
  priceDiff: number | null;
  totalSellers: number;
  thirdPartySellers: number;
  buyBoxSeller: string;
  // Product info
  brand: string | null;
  rating: number | null;
  reviewCount: number;
  lowStockWarning: string | null;
  // Links
  supplierLink: string | null;
  lastCheck: string | null;
  sellers: Seller[];
  walmartUrl: string;
  // Retire info
  isRetired: boolean;
  retireReason: string | null;
  retireDate: string | null;
  pendingRetire: boolean;
}

interface Summary {
  totalGroups?: number;
  totalProducts: number;
  winning: number;
  losing: number;
  notFound: number;
  published: number;
  unpublished: number;
  retired: number;
  pendingRetire: number;
  zeroInventory: number;
  totalSales3Day: number;
  totalSales7Day: number;
  totalSales14Day: number;
  lastCheck: string | null;
}

// Grouped product by Product ID
interface ProductGroup {
  productId: string;
  title: string;
  walmartUrl: string;
  totalSales3Day: number;
  totalSales7Day: number;
  totalSales14Day: number;
  totalSellers: number;
  thirdPartySellers: number;
  buyBoxSeller: string;
  lowest3PPrice: number | null;
  sellers: Seller[];
  brand: string | null;
  rating: number | null;
  reviewCount: number;
  hasInventoryWarning: boolean;
  hasWinningStore: boolean;
  storeProducts: Product[];
  lastCheck: string | null;
}

const STORE_NAMES: Record<string, string> = {
  WM19: 'VitalNest Goods',
  WM24: 'zhangbinhai'
};

const RETIRE_REASONS = [
  'Manual - No Sales',
  'Manual - Bad Category',
  'Manual - Low Margin',
  'Manual - Too Much Competition',
  'Manual - Other'
] as const;

export default function DailyCheckup() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
  const [isGrouped, setIsGrouped] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [triggering, setTriggering] = useState(false);
  const [storeFilter, setStoreFilter] = useState<'all' | 'WM19' | 'WM24'>('all');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  // Retire selection state
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [showRetireModal, setShowRetireModal] = useState(false);
  const [selectedRetireReason, setSelectedRetireReason] = useState<string>(RETIRE_REASONS[0]);
  const [retireLoading, setRetireLoading] = useState(false);
  const [retireResult, setRetireResult] = useState<{ success: number; failed: number } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      params.set('limit', '15');
      if (storeFilter !== 'all') {
        params.set('store', storeFilter);
      }
      // When filtering by store, disable grouping
      if (storeFilter !== 'all') {
        params.set('grouped', 'false');
      }

      const res = await fetch(`/api/daily-checkup?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch data');
      }

      if (data.grouped) {
        setProductGroups(data.productGroups);
        setProducts([]);
        setIsGrouped(true);
      } else {
        setProducts(data.products);
        setProductGroups([]);
        setIsGrouped(false);
      }
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

  const formatCurrency = (value: number | null) => {
    if (value === null) return '-';
    return `$${value.toFixed(2)}`;
  };

  const formatPercent = (value: number | null) => {
    if (value === null) return '-';
    return `${(value * 100).toFixed(1)}%`;
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

  const getInventoryBadge = (product: Product) => {
    if (product.inventoryWarning) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
          <AlertTriangle size={12} />
          No Stock
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <Package size={12} />
        {product.totalInventory}
      </span>
    );
  };

  const getRetireBadge = (product: Product) => {
    if (product.isRetired) {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700 cursor-pointer hover:bg-purple-200"
          title={`Retired: ${product.retireReason || 'Unknown reason'}\n${product.retireDate ? formatTimeAgo(product.retireDate) : ''}`}
        >
          <Trash2 size={12} />
          Retired
        </span>
      );
    }
    if (product.pendingRetire) {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700 animate-pulse cursor-pointer"
          title={`Pending retire: ${product.retireReason || 'Unknown reason'}`}
        >
          <AlertCircle size={12} />
          Pending Retire
        </span>
      );
    }
    return null;
  };

  const getPublishBadge = (product: Product) => {
    // Don't show publish badge if already showing retire badge
    if (product.isRetired || product.pendingRetire) {
      return null;
    }
    if (product.publishedStatus === 'PUBLISHED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
          <CheckCircle size={12} />
          Live
        </span>
      );
    }
    if (product.publishedStatus === 'UNPUBLISHED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
          <XCircle size={12} />
          Unpub
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
        <AlertCircle size={12} />
        {product.publishedStatus || '?'}
      </span>
    );
  };

  const getMarginColor = (marginPercent: number | null) => {
    if (marginPercent === null) return 'text-slate-400';
    if (marginPercent >= 0.15) return 'text-green-600';
    if (marginPercent >= 0.10) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getRankDisplay = (product: Product) => {
    if (product.ourRank === null) return '-';
    return `#${product.ourRank} of ${product.totalSellers}`;
  };

  // Retire selection functions
  const toggleSkuSelection = (sku: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedSkus(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sku)) {
        newSet.delete(sku);
      } else {
        newSet.add(sku);
      }
      return newSet;
    });
  };

  const selectAllVisible = () => {
    let allSkus: string[];
    if (isGrouped) {
      allSkus = productGroups
        .flatMap(g => g.storeProducts)
        .filter(p => !p.isRetired && !p.pendingRetire)
        .map(p => p.sku);
    } else {
      allSkus = products
        .filter(p => !p.isRetired && !p.pendingRetire)
        .map(p => p.sku);
    }
    setSelectedSkus(new Set(allSkus));
  };

  const clearSelection = () => {
    setSelectedSkus(new Set());
  };

  const handleRetireSubmit = async () => {
    if (selectedSkus.size === 0) return;

    setRetireLoading(true);
    setRetireResult(null);

    try {
      const response = await fetch('/api/retire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skus: Array.from(selectedSkus),
          retireReason: selectedRetireReason
        })
      });

      const data = await response.json();

      if (response.ok) {
        setRetireResult({
          success: data.summary.success,
          failed: data.summary.failed
        });

        // Update local state to show pending retire
        if (isGrouped) {
          setProductGroups(prev => prev.map(g => ({
            ...g,
            storeProducts: g.storeProducts.map(p => {
              if (selectedSkus.has(p.sku)) {
                return { ...p, pendingRetire: true, retireReason: selectedRetireReason };
              }
              return p;
            })
          })));
        } else {
          setProducts(prev => prev.map(p => {
            if (selectedSkus.has(p.sku)) {
              return { ...p, pendingRetire: true, retireReason: selectedRetireReason };
            }
            return p;
          }));
        }

        // Clear selection after success
        setTimeout(() => {
          setSelectedSkus(new Set());
          setShowRetireModal(false);
          setRetireResult(null);
        }, 2000);
      } else {
        alert(data.error || 'Failed to mark products for retire');
      }
    } catch (err) {
      alert('Network error: ' + String(err));
    } finally {
      setRetireLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 font-sans">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
              <ArrowLeft size={20} className="text-slate-600" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Daily Check-up</h1>
              <p className="text-sm text-slate-500">
                {isGrouped
                  ? `Top 15 listings by 14-Day Sales (grouped by Product ID)`
                  : `Top 15 products by 14-Day Sales`}
              </p>
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
            <Link href="/profit-scout" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors">
              Scout <ArrowRight size={16} />
            </Link>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
            <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-200">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Users size={14} />
                <span className="text-xs font-medium">{isGrouped ? 'Listings' : 'Products'}</span>
              </div>
              <p className="text-xl font-bold text-slate-800">
                {isGrouped ? summary.totalGroups : summary.totalProducts}
              </p>
              {isGrouped && (
                <p className="text-xs text-slate-400">{summary.totalProducts} SKUs</p>
              )}
            </div>

            <div className="bg-green-50 rounded-xl p-3 shadow-sm border border-green-200">
              <div className="flex items-center gap-2 text-green-600 mb-1">
                <CheckCircle size={14} />
                <span className="text-xs font-medium">Winning</span>
              </div>
              <p className="text-xl font-bold text-green-700">{summary.winning}</p>
            </div>

            <div className="bg-red-50 rounded-xl p-3 shadow-sm border border-red-200">
              <div className="flex items-center gap-2 text-red-600 mb-1">
                <XCircle size={14} />
                <span className="text-xs font-medium">Losing</span>
              </div>
              <p className="text-xl font-bold text-red-700">{summary.losing}</p>
            </div>

            <div className="bg-amber-50 rounded-xl p-3 shadow-sm border border-amber-200">
              <div className="flex items-center gap-2 text-amber-600 mb-1">
                <AlertTriangle size={14} />
                <span className="text-xs font-medium">No Stock</span>
              </div>
              <p className="text-xl font-bold text-amber-700">{summary.zeroInventory}</p>
            </div>

            <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-200">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <ShoppingCart size={14} />
                <span className="text-xs font-medium">14D Sales</span>
              </div>
              <p className="text-xl font-bold text-slate-800">{summary.totalSales14Day}</p>
            </div>

            <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-200">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Clock size={14} />
                <span className="text-xs font-medium">Last Check</span>
              </div>
              <p className="text-sm font-bold text-slate-800">{formatTimeAgo(summary.lastCheck)}</p>
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

        {/* Selection Bar */}
        {(products.length > 0 || productGroups.length > 0) && (
          <div className="flex items-center justify-between bg-white rounded-xl p-3 mb-4 shadow-sm border border-slate-200">
            <div className="flex items-center gap-3">
              {(() => {
                const allSelectableSkus = isGrouped
                  ? productGroups.flatMap(g => g.storeProducts).filter(p => !p.isRetired && !p.pendingRetire)
                  : products.filter(p => !p.isRetired && !p.pendingRetire);
                const allSelected = selectedSkus.size === allSelectableSkus.length && allSelectableSkus.length > 0;
                return (
                  <button
                    onClick={allSelected ? clearSelection : selectAllVisible}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    {allSelected ? (
                      <><CheckSquare size={16} className="text-blue-600" /> Deselect All</>
                    ) : (
                      <><Square size={16} /> Select All</>
                    )}
                  </button>
                );
              })()}
              {selectedSkus.size > 0 && (
                <span className="text-sm text-slate-500">
                  {selectedSkus.size} selected
                </span>
              )}
            </div>

            {selectedSkus.size > 0 && (
              <button
                onClick={() => setShowRetireModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
              >
                <Trash2 size={16} />
                Send to Retire ({selectedSkus.size})
              </button>
            )}
          </div>
        )}

        {/* Retire Modal */}
        {showRetireModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-red-600 text-white">
                <h3 className="font-bold">Send to Retire</h3>
                <button onClick={() => setShowRetireModal(false)} className="hover:bg-red-700 p-1 rounded">
                  <X size={20} />
                </button>
              </div>

              <div className="p-4">
                <p className="text-sm text-slate-600 mb-4">
                  You are about to mark <strong>{selectedSkus.size}</strong> product(s) for retirement.
                  The retire workflow will process them automatically.
                </p>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Select Retire Reason
                  </label>
                  <select
                    value={selectedRetireReason}
                    onChange={(e) => setSelectedRetireReason(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  >
                    {RETIRE_REASONS.map((reason) => (
                      <option key={reason} value={reason}>{reason}</option>
                    ))}
                  </select>
                </div>

                <div className="bg-slate-50 rounded-lg p-3 mb-4 max-h-40 overflow-y-auto">
                  <p className="text-xs text-slate-500 mb-2">SKUs to retire:</p>
                  <div className="flex flex-wrap gap-1">
                    {Array.from(selectedSkus).map((sku) => (
                      <span key={sku} className="text-xs bg-slate-200 text-slate-700 px-2 py-1 rounded">
                        {sku}
                      </span>
                    ))}
                  </div>
                </div>

                {retireResult && (
                  <div className={`p-3 rounded-lg mb-4 ${retireResult.failed > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
                    <p className={`text-sm font-medium ${retireResult.failed > 0 ? 'text-yellow-700' : 'text-green-700'}`}>
                      {retireResult.success} marked for retire
                      {retireResult.failed > 0 && `, ${retireResult.failed} failed`}
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowRetireModal(false)}
                    disabled={retireLoading}
                    className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRetireSubmit}
                    disabled={retireLoading || retireResult !== null}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {retireLoading ? (
                      <><Loader size={16} className="animate-spin" /> Processing...</>
                    ) : retireResult ? (
                      <><CheckCircle size={16} /> Done</>
                    ) : (
                      <>Confirm Retire</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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
        ) : isGrouped ? (
          /* Grouped Product List */
          <div className="space-y-3">
            {productGroups.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center border border-slate-200">
                <p className="text-slate-500">No products found. Run a check to get started.</p>
              </div>
            ) : (
              productGroups.map((group, index) => (
                <div
                  key={group.productId}
                  className={`bg-white rounded-xl shadow-sm border overflow-hidden ${
                    group.hasInventoryWarning ? 'border-amber-300' : 'border-slate-200'
                  }`}
                >
                  {/* Group Header Row */}
                  <div
                    className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => setExpandedGroup(expandedGroup === group.productId ? null : group.productId)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm font-bold text-blue-600">
                          {index + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-800">{group.productId}</span>
                            <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">
                              {group.storeProducts.length} store{group.storeProducts.length > 1 ? 's' : ''}
                            </span>
                            {group.hasWinningStore ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                <Trophy size={12} />
                                Winning
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                <TrendingDown size={12} />
                                Losing
                              </span>
                            )}
                            {group.hasInventoryWarning && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                                <AlertTriangle size={12} />
                                Low Stock
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-500 mt-0.5 truncate max-w-lg">
                            {group.title}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {/* Combined Sales */}
                        <div className="text-right hidden md:block">
                          <p className="text-xs text-slate-500">3D / 7D / 14D</p>
                          <p className="font-semibold text-slate-800">
                            {group.totalSales3Day} / {group.totalSales7Day} / {group.totalSales14Day}
                          </p>
                        </div>

                        {/* Lowest 3P Price */}
                        <div className="text-right hidden lg:block">
                          <p className="text-xs text-slate-500">Lowest 3P</p>
                          <p className="font-semibold text-slate-800">
                            {formatCurrency(group.lowest3PPrice)}
                          </p>
                        </div>

                        {/* Sellers Count */}
                        <div className="text-right">
                          <p className="text-xs text-slate-500">Sellers</p>
                          <p className="font-semibold text-slate-800">
                            {group.totalSellers} ({group.thirdPartySellers} 3P)
                          </p>
                        </div>

                        {/* Walmart Link */}
                        {group.walmartUrl && (
                          <a
                            href={group.walmartUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                            title="View on Walmart"
                          >
                            <ExternalLink size={18} />
                          </a>
                        )}

                        {/* Expand Icon */}
                        <div className="text-slate-400">
                          {expandedGroup === group.productId ? (
                            <ChevronUp size={20} />
                          ) : (
                            <ChevronDown size={20} />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Group Details */}
                  {expandedGroup === group.productId && (
                    <div className="border-t border-slate-200 bg-slate-50">
                      {/* Shared Product Info */}
                      <div className="p-4 border-b border-slate-200">
                        <div className="flex items-center gap-4 text-sm flex-wrap">
                          {group.brand && (
                            <span className="text-slate-600">Brand: <strong>{group.brand}</strong></span>
                          )}
                          {group.rating !== null && (
                            <span className="flex items-center gap-1 text-slate-600">
                              <Star size={14} className="text-yellow-500 fill-yellow-500" />
                              {group.rating.toFixed(1)} ({group.reviewCount} reviews)
                            </span>
                          )}
                          {group.buyBoxSeller && (
                            <span className="text-slate-600">Buy Box: <strong>{group.buyBoxSeller}</strong></span>
                          )}
                          <a
                            href={group.walmartUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                          >
                            <ExternalLink size={14} />
                            View on Walmart
                          </a>
                        </div>
                      </div>

                      {/* Store Products */}
                      <div className="divide-y divide-slate-200">
                        {group.storeProducts.map((product) => (
                          <div key={product.id} className="bg-white">
                            {/* Store Row */}
                            <div
                              className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedProduct(expandedProduct === product.id ? null : product.id);
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  {/* Checkbox for selection */}
                                  {!product.isRetired && !product.pendingRetire && (
                                    <button
                                      onClick={(e) => toggleSkuSelection(product.sku, e)}
                                      className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                                        selectedSkus.has(product.sku)
                                          ? 'bg-blue-600 border-blue-600 text-white'
                                          : 'border-slate-300 hover:border-blue-400'
                                      }`}
                                    >
                                      {selectedSkus.has(product.sku) && <CheckCircle size={14} />}
                                    </button>
                                  )}
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium text-slate-800">{product.sku}</span>
                                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                                        product.store === 'WM19' ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'
                                      }`}>
                                        {product.store}
                                      </span>
                                      {getStatusBadge(product)}
                                      {getInventoryBadge(product)}
                                      {getRetireBadge(product)}
                                      {getPublishBadge(product)}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-4">
                                  {/* Store Sales */}
                                  <div className="text-right hidden md:block">
                                    <p className="text-xs text-slate-500">3D / 7D / 14D</p>
                                    <p className="font-medium text-slate-700">
                                      {product.sales3Day} / {product.sales7Day} / {product.sales14Day}
                                    </p>
                                  </div>

                                  {/* Our Price */}
                                  <div className="text-right">
                                    <p className="text-xs text-slate-500">Our Price</p>
                                    <p className="font-medium text-slate-700">
                                      {formatCurrency(product.ourSellingPrice)}
                                    </p>
                                  </div>

                                  {/* Margin */}
                                  <div className="text-right">
                                    <p className="text-xs text-slate-500">Margin</p>
                                    <p className={`font-medium ${getMarginColor(product.marginPercent)}`}>
                                      {formatPercent(product.marginPercent)}
                                    </p>
                                  </div>

                                  {/* Rank */}
                                  <div className="text-right hidden md:block">
                                    <p className="text-xs text-slate-500">Rank</p>
                                    <p className={`font-medium ${product.isWinning ? 'text-green-600' : product.ourRank !== null ? 'text-red-600' : 'text-slate-400'}`}>
                                      {getRankDisplay(product)}
                                    </p>
                                  </div>

                                  {/* Expand Icon */}
                                  <div className="text-slate-400">
                                    {expandedProduct === product.id ? (
                                      <ChevronUp size={16} />
                                    ) : (
                                      <ChevronDown size={16} />
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Expanded Store Details */}
                            {expandedProduct === product.id && (
                              <div className="border-t border-slate-100 bg-slate-50 p-4">
                                {/* Info Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
                                  <div className="bg-white rounded-lg p-3 border border-slate-200">
                                    <p className="text-xs text-slate-500 mb-1">Product Cost</p>
                                    <p className="font-semibold text-slate-800">{formatCurrency(product.productCost)}</p>
                                  </div>
                                  <div className="bg-white rounded-lg p-3 border border-slate-200">
                                    <p className="text-xs text-slate-500 mb-1">Our Selling Price</p>
                                    <p className="font-semibold text-slate-800">{formatCurrency(product.ourSellingPrice)}</p>
                                  </div>
                                  <div className="bg-white rounded-lg p-3 border border-slate-200">
                                    <p className="text-xs text-slate-500 mb-1">Walmart Price</p>
                                    <p className="font-semibold text-slate-800">{formatCurrency(product.walmartPrice)}</p>
                                  </div>
                                  <div className={`rounded-lg p-3 border ${product.marginPercent && product.marginPercent >= 0.10 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                    <p className="text-xs text-slate-500 mb-1">Margin ($)</p>
                                    <p className={`font-semibold ${getMarginColor(product.marginPercent)}`}>
                                      {formatCurrency(product.marginDollar)} ({formatPercent(product.marginPercent)})
                                    </p>
                                  </div>
                                  <div className={`rounded-lg p-3 border ${product.inventoryWarning ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                                    <p className="text-xs text-slate-500 mb-1">Inventory</p>
                                    <p className={`font-semibold ${product.inventoryWarning ? 'text-red-700' : 'text-green-700'}`}>
                                      {product.totalInventory} total
                                    </p>
                                    <p className="text-xs text-slate-500 mt-1">
                                      FC: {product.fcInventory} | Default: {product.defaultInventory}
                                    </p>
                                  </div>
                                  <div className={`rounded-lg p-3 border ${product.isRetired ? 'bg-purple-50 border-purple-200' : product.pendingRetire ? 'bg-orange-50 border-orange-200' : product.publishedStatus === 'PUBLISHED' ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'}`}>
                                    <p className="text-xs text-slate-500 mb-1">Status</p>
                                    <p className={`font-semibold ${product.isRetired ? 'text-purple-700' : product.pendingRetire ? 'text-orange-700' : product.publishedStatus === 'PUBLISHED' ? 'text-green-700' : 'text-red-700'}`}>
                                      {product.isRetired ? 'RETIRED' : product.pendingRetire ? 'PENDING RETIRE' : product.publishedStatus}
                                    </p>
                                  </div>
                                </div>

                                {/* Retire Info Block */}
                                {(product.isRetired || product.pendingRetire) && (
                                  <div className={`rounded-lg p-4 mb-4 ${product.isRetired ? 'bg-purple-50 border border-purple-200' : 'bg-orange-50 border border-orange-200'}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Trash2 size={16} className={product.isRetired ? 'text-purple-600' : 'text-orange-600'} />
                                      <span className={`font-semibold ${product.isRetired ? 'text-purple-700' : 'text-orange-700'}`}>
                                        {product.isRetired ? 'Product Retired' : 'Pending Retirement'}
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                      <div>
                                        <span className="text-slate-500">Reason:</span>
                                        <span className={`ml-2 font-medium ${product.isRetired ? 'text-purple-700' : 'text-orange-700'}`}>
                                          {product.retireReason || 'Unknown'}
                                        </span>
                                      </div>
                                      {product.retireDate && (
                                        <div className="flex items-center gap-1">
                                          <Calendar size={14} className="text-slate-400" />
                                          <span className="text-slate-500">Retired:</span>
                                          <span className="ml-1 font-medium text-slate-700">
                                            {new Date(product.retireDate).toLocaleDateString()} {new Date(product.retireDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Links */}
                                <div className="flex items-center gap-4">
                                  {product.supplierLink && (
                                    <a
                                      href={product.supplierLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm"
                                    >
                                      <LinkIcon size={14} />
                                      Supplier Link
                                    </a>
                                  )}
                                  <span className="text-xs text-slate-500">
                                    Last checked: {formatTimeAgo(product.lastCheck)}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Sellers Section (shared for all stores) */}
                      <div className="p-4 border-t border-slate-200">
                        <h4 className="font-medium text-slate-700 mb-3">
                          All Sellers ({group.totalSellers}) - {group.thirdPartySellers} 3P Sellers
                        </h4>

                        {group.sellers.length > 0 ? (
                          <div className="space-y-2">
                            {group.sellers.map((seller, i) => (
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
                                      {seller.freeShipping ? 'FREE' : seller.shipping != null ? `$${seller.shipping.toFixed(2)}` : '-'}
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
                          Last checked: {formatTimeAgo(group.lastCheck)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          /* Non-grouped Product List (when filtering by store) */
          <div className="space-y-3">
            {products.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center border border-slate-200">
                <p className="text-slate-500">No products found. Run a check to get started.</p>
              </div>
            ) : (
              products.map((product, index) => (
                <div
                  key={product.id}
                  className={`bg-white rounded-xl shadow-sm border overflow-hidden ${
                    product.inventoryWarning ? 'border-red-300' : 'border-slate-200'
                  }`}
                >
                  {/* Main Row */}
                  <div
                    className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => setExpandedProduct(expandedProduct === product.id ? null : product.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {/* Checkbox for selection */}
                        {!product.isRetired && !product.pendingRetire && (
                          <button
                            onClick={(e) => toggleSkuSelection(product.sku, e)}
                            className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                              selectedSkus.has(product.sku)
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'border-slate-300 hover:border-blue-400'
                            }`}
                          >
                            {selectedSkus.has(product.sku) && <CheckCircle size={14} />}
                          </button>
                        )}
                        <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-sm font-bold text-slate-500">
                          {index + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-800">{product.sku}</span>
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                              product.store === 'WM19' ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'
                            }`}>
                              {product.store}
                            </span>
                            {getStatusBadge(product)}
                            {getInventoryBadge(product)}
                            {getRetireBadge(product)}
                            {getPublishBadge(product)}
                          </div>
                          <p className="text-sm text-slate-500 mt-0.5 truncate max-w-lg">
                            {product.title}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {/* Sales */}
                        <div className="text-right hidden md:block">
                          <p className="text-xs text-slate-500">3D / 7D / 14D</p>
                          <p className="font-semibold text-slate-800">
                            {product.sales3Day} / {product.sales7Day} / {product.sales14Day}
                          </p>
                        </div>

                        {/* Our Price */}
                        <div className="text-right">
                          <p className="text-xs text-slate-500">Our Price</p>
                          <p className="font-semibold text-slate-800">
                            {formatCurrency(product.ourSellingPrice)}
                          </p>
                        </div>

                        {/* Walmart Price */}
                        <div className="text-right hidden lg:block">
                          <p className="text-xs text-slate-500">WM Price</p>
                          <p className="font-semibold text-slate-800">
                            {formatCurrency(product.walmartPrice)}
                          </p>
                        </div>

                        {/* Margin */}
                        <div className="text-right">
                          <p className="text-xs text-slate-500">Margin</p>
                          <p className={`font-semibold ${getMarginColor(product.marginPercent)}`}>
                            {formatPercent(product.marginPercent)}
                          </p>
                        </div>

                        {/* Rank */}
                        <div className="text-right hidden md:block">
                          <p className="text-xs text-slate-500">Rank</p>
                          <p className={`font-semibold ${product.isWinning ? 'text-green-600' : product.ourRank !== null ? 'text-red-600' : 'text-slate-400'}`}>
                            {getRankDisplay(product)}
                          </p>
                        </div>

                        {/* Walmart Link */}
                        {product.walmartUrl && (
                          <a
                            href={product.walmartUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                            title="View on Walmart"
                          >
                            <ExternalLink size={18} />
                          </a>
                        )}

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
                      {/* Info Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-4">
                        <div className="bg-white rounded-lg p-3 border border-slate-200">
                          <p className="text-xs text-slate-500 mb-1">Product Cost</p>
                          <p className="font-semibold text-slate-800">{formatCurrency(product.productCost)}</p>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-slate-200">
                          <p className="text-xs text-slate-500 mb-1">Our Selling Price</p>
                          <p className="font-semibold text-slate-800">{formatCurrency(product.ourSellingPrice)}</p>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-slate-200">
                          <p className="text-xs text-slate-500 mb-1">Walmart Price</p>
                          <p className="font-semibold text-slate-800">{formatCurrency(product.walmartPrice)}</p>
                        </div>
                        <div className={`rounded-lg p-3 border ${product.marginPercent && product.marginPercent >= 0.10 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                          <p className="text-xs text-slate-500 mb-1">Margin ($)</p>
                          <p className={`font-semibold ${getMarginColor(product.marginPercent)}`}>
                            {formatCurrency(product.marginDollar)} ({formatPercent(product.marginPercent)})
                          </p>
                        </div>
                        <div className={`rounded-lg p-3 border ${product.inventoryWarning ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                          <p className="text-xs text-slate-500 mb-1">Inventory</p>
                          <p className={`font-semibold ${product.inventoryWarning ? 'text-red-700' : 'text-green-700'}`}>
                            {product.totalInventory} total
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            FC: {product.fcInventory} | Default: {product.defaultInventory}
                          </p>
                        </div>
                        <div className={`rounded-lg p-3 border ${product.isRetired ? 'bg-purple-50 border-purple-200' : product.pendingRetire ? 'bg-orange-50 border-orange-200' : product.publishedStatus === 'PUBLISHED' ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'}`}>
                          <p className="text-xs text-slate-500 mb-1">Status</p>
                          <p className={`font-semibold ${product.isRetired ? 'text-purple-700' : product.pendingRetire ? 'text-orange-700' : product.publishedStatus === 'PUBLISHED' ? 'text-green-700' : 'text-red-700'}`}>
                            {product.isRetired ? 'RETIRED' : product.pendingRetire ? 'PENDING RETIRE' : product.publishedStatus}
                          </p>
                        </div>
                      </div>

                      {/* Retire Info Block */}
                      {(product.isRetired || product.pendingRetire) && (
                        <div className={`rounded-lg p-4 mb-4 ${product.isRetired ? 'bg-purple-50 border border-purple-200' : 'bg-orange-50 border border-orange-200'}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <Trash2 size={16} className={product.isRetired ? 'text-purple-600' : 'text-orange-600'} />
                            <span className={`font-semibold ${product.isRetired ? 'text-purple-700' : 'text-orange-700'}`}>
                              {product.isRetired ? 'Product Retired' : 'Pending Retirement'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-slate-500">Reason:</span>
                              <span className={`ml-2 font-medium ${product.isRetired ? 'text-purple-700' : 'text-orange-700'}`}>
                                {product.retireReason || 'Unknown'}
                              </span>
                            </div>
                            {product.retireDate && (
                              <div className="flex items-center gap-1">
                                <Calendar size={14} className="text-slate-400" />
                                <span className="text-slate-500">Retired:</span>
                                <span className="ml-1 font-medium text-slate-700">
                                  {new Date(product.retireDate).toLocaleDateString()} {new Date(product.retireDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </span>
                              </div>
                            )}
                          </div>
                          {product.sales14Day > 0 && (
                            <div className="mt-2 p-2 bg-red-100 rounded border border-red-200">
                              <span className="text-red-700 text-sm font-medium">
                                This product had {product.sales14Day} sales in the last 14 days before retirement
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Product Info */}
                      {(product.brand || product.rating !== null) && (
                        <div className="flex items-center gap-4 mb-4 text-sm">
                          {product.brand && (
                            <span className="text-slate-600">Brand: <strong>{product.brand}</strong></span>
                          )}
                          {product.rating !== null && (
                            <span className="flex items-center gap-1 text-slate-600">
                              <Star size={14} className="text-yellow-500 fill-yellow-500" />
                              {product.rating.toFixed(1)} ({product.reviewCount} reviews)
                            </span>
                          )}
                          {product.buyBoxSeller && (
                            <span className="text-slate-600">Buy Box: <strong>{product.buyBoxSeller}</strong></span>
                          )}
                        </div>
                      )}

                      {/* Links */}
                      <div className="flex items-center gap-4 mb-4">
                        <a
                          href={product.walmartUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm"
                        >
                          <ExternalLink size={14} />
                          View on Walmart
                        </a>
                        {product.supplierLink && (
                          <a
                            href={product.supplierLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm"
                          >
                            <LinkIcon size={14} />
                            Supplier Link
                          </a>
                        )}
                      </div>

                      {/* Sellers Section */}
                      <div className="mb-3">
                        <h4 className="font-medium text-slate-700 mb-2">
                          All Sellers ({product.totalSellers}) - {product.thirdPartySellers} 3P Sellers
                        </h4>
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
                                    {seller.freeShipping ? 'FREE' : seller.shipping != null ? `$${seller.shipping.toFixed(2)}` : '-'}
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
