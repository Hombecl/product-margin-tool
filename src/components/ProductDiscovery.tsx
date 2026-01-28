'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  Plus,
  Check,
  Loader,
  ExternalLink,
  Star,
  DollarSign,
  Package,
  BarChart3,
  AlertCircle,
  CheckCircle,
  Filter,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Sparkles,
  Truck,
  Store,
  PackageCheck
} from 'lucide-react';

interface Product {
  id: string;
  title: string;
  price: number;
  productCost: number;
  calculatedSellingPrice: number;
  calculatedMargin: number;
  calculatedMarginPercent: number;
  seller_name?: string;
  rating?: number;
  rating_count?: number;
  image?: string;
  url?: string;
  out_of_stock?: boolean;
  fulfillment?: {
    delivery: boolean;
    pickup: boolean;
    shipping: boolean;
    free_shipping: boolean;
  };
}

interface Category {
  id: string;
  name: string;
  path: string;
}

interface UsageStats {
  thisMonth: {
    totalSearches: number;
    totalCreditsUsed: number;
    totalProductsAdded: number;
    creditsLimit: number;
    creditsRemaining: number;
    usagePercent: number;
  };
}

type SearchMode = 'keyword' | 'category' | 'custom';
type SortOption = 'best_seller' | 'best_match' | 'price_low' | 'price_high';

const STORES = ['WM19', 'WM24', 'WM33'];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'best_seller', label: 'Best Seller' },
  { value: 'best_match', label: 'Best Match' },
  { value: 'price_low', label: 'Price: Low to High' },
  { value: 'price_high', label: 'Price: High to Low' },
];

export default function ProductDiscovery() {
  // Search state
  const [searchMode, setSearchMode] = useState<SearchMode>('keyword');
  const [query, setQuery] = useState('');
  const [store, setStore] = useState('WM19');
  const [maxPrice, setMaxPrice] = useState(40);
  const [minRating, setMinRating] = useState(0);
  const [operator, setOperator] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('best_seller');

  // Category state
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [customCategoryUrl, setCustomCategoryUrl] = useState('');

  // Results state
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [totalResults, setTotalResults] = useState(0);
  const [lastSearchSource, setLastSearchSource] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showStats, setShowStats] = useState(false);

  // Stats state
  const [stats, setStats] = useState<UsageStats | null>(null);

  // Session ID for tracking
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

  // Fetch categories on mount
  useEffect(() => {
    fetch('/api/discovery/category')
      .then(res => res.json())
      .then(data => {
        if (data.categories) {
          setCategories(data.categories);
        }
      })
      .catch(err => console.error('Failed to fetch categories:', err));
  }, []);

  // Fetch stats on mount
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/discovery/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Keyword search handler
  const handleKeywordSearch = async () => {
    if (!query.trim()) {
      setError('Please enter a search query');
      return;
    }

    if (!operator.trim()) {
      setError('Please enter your name');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    setProducts([]);
    setSelectedProducts(new Set());

    try {
      const res = await fetch('/api/discovery/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          maxPrice,
          minRating,
          store,
          operator: operator.trim(),
          sessionId,
          sortBy
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Search failed');
      }

      setProducts(data.products || []);
      setTotalResults(data.totalResults || 0);
      setLastSearchSource(`Keyword: ${query}`);

      if (data.products?.length === 0) {
        setError('No products found matching your criteria');
      }

      fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  // Category browse handler
  const handleCategoryBrowse = async () => {
    if (searchMode === 'category' && !selectedCategory) {
      setError('Please select a category');
      return;
    }

    if (searchMode === 'custom' && !customCategoryUrl.trim()) {
      setError('Please enter a category URL');
      return;
    }

    if (!operator.trim()) {
      setError('Please enter your name');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    setProducts([]);
    setSelectedProducts(new Set());

    try {
      const requestBody: {
        categoryId?: string;
        categoryUrl?: string;
        maxPrice: number;
        minRating: number;
        store: string;
        operator: string;
        sessionId: string;
      } = {
        maxPrice,
        minRating,
        store,
        operator: operator.trim(),
        sessionId
      };

      if (searchMode === 'category') {
        requestBody.categoryId = selectedCategory;
      } else {
        requestBody.categoryUrl = customCategoryUrl.trim();
      }

      const res = await fetch('/api/discovery/category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Category browse failed');
      }

      setProducts(data.products || []);
      setTotalResults(data.totalResults || 0);
      setLastSearchSource(`Category: ${data.category || selectedCategory}`);

      if (data.products?.length === 0) {
        setError('No products found in this category matching your criteria');
      }

      if (data.fallback) {
        setSuccess('Used search fallback for this category');
      }

      fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Category browse failed');
    } finally {
      setLoading(false);
    }
  };

  // Main search handler
  const handleSearch = () => {
    if (searchMode === 'keyword') {
      handleKeywordSearch();
    } else {
      handleCategoryBrowse();
    }
  };

  // Toggle product selection
  const toggleProduct = (productId: string) => {
    setSelectedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  // Select all products
  const selectAll = () => {
    if (selectedProducts.size === products.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(products.map(p => p.id)));
    }
  };

  // Add selected products
  const handleAddProducts = async () => {
    if (selectedProducts.size === 0) {
      setError('Please select at least one product');
      return;
    }

    setAdding(true);
    setError('');
    setSuccess('');

    try {
      const productsToAdd = products.filter(p => selectedProducts.has(p.id));

      const res = await fetch('/api/discovery/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: productsToAdd,
          store,
          discoverySource: lastSearchSource,
          discoveryTags: searchMode === 'category' ? ['Bestseller'] : [],
          operator: operator.trim(),
          sessionId
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to add products');
      }

      setSuccess(data.message);

      // Remove added products from the list
      const addedIds = new Set(productsToAdd.map(p => p.id));
      setProducts(prev => prev.filter(p => !addedIds.has(p.id) || data.skipped > 0));
      setSelectedProducts(new Set());

      fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add products');
    } finally {
      setAdding(false);
    }
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
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
              <h1 className="text-xl font-bold text-slate-800">Product Discovery</h1>
              <p className="text-sm text-slate-500">Search Walmart and add products to your store</p>
            </div>
          </div>
          <button
            onClick={() => setShowStats(!showStats)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <BarChart3 size={18} />
            Usage Stats
          </button>
        </div>

        {/* Stats Panel */}
        {showStats && stats && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
            <h2 className="font-bold text-slate-800 mb-4">This Month&apos;s Usage</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-sm text-blue-600 mb-1">Total Searches</div>
                <div className="text-2xl font-bold text-blue-700">{stats.thisMonth.totalSearches}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg p-4">
                <div className="text-sm text-emerald-600 mb-1">Products Added</div>
                <div className="text-2xl font-bold text-emerald-700">{stats.thisMonth.totalProductsAdded}</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <div className="text-sm text-purple-600 mb-1">Credits Used</div>
                <div className="text-2xl font-bold text-purple-700">{stats.thisMonth.totalCreditsUsed.toLocaleString()}</div>
              </div>
              <div className="bg-orange-50 rounded-lg p-4">
                <div className="text-sm text-orange-600 mb-1">Credits Remaining</div>
                <div className="text-2xl font-bold text-orange-700">{stats.thisMonth.creditsRemaining.toLocaleString()}</div>
                <div className="mt-2 bg-orange-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-orange-500 h-full transition-all"
                    style={{ width: `${stats.thisMonth.usagePercent}%` }}
                  />
                </div>
                <div className="text-xs text-orange-600 mt-1">{stats.thisMonth.usagePercent}% used</div>
              </div>
            </div>
          </div>
        )}

        {/* Search Section */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          {/* Operator Name */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Your Name</label>
            <input
              type="text"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              placeholder="Enter your name for tracking"
              className="w-full md:w-64 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Store Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Target Store</label>
            <div className="flex gap-2">
              {STORES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStore(s)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    store === s
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Search Mode Tabs */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Search Mode</label>
            <div className="flex gap-2">
              <button
                onClick={() => setSearchMode('keyword')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  searchMode === 'keyword'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Search size={16} />
                Keyword Search
              </button>
              <button
                onClick={() => setSearchMode('category')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  searchMode === 'category'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <FolderOpen size={16} />
                Category Browse
              </button>
              <button
                onClick={() => setSearchMode('custom')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  searchMode === 'custom'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Sparkles size={16} />
                Custom URL
              </button>
            </div>
          </div>

          {/* Keyword Search Input */}
          {searchMode === 'keyword' && (
            <div className="flex gap-3 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search Walmart products (e.g., trash bags, paper towels)"
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 font-medium"
              >
                {loading ? <Loader size={20} className="animate-spin" /> : <Search size={20} />}
                Search
              </button>
            </div>
          )}

          {/* Category Selection */}
          {searchMode === 'category' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">Select Category (Bestsellers)</label>
              <div className="flex gap-3">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Select a category --</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleSearch}
                  disabled={loading || !selectedCategory}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 font-medium"
                >
                  {loading ? <Loader size={20} className="animate-spin" /> : <FolderOpen size={20} />}
                  Browse
                </button>
              </div>
            </div>
          )}

          {/* Custom Category URL */}
          {searchMode === 'custom' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Custom Walmart Category URL
              </label>
              <p className="text-xs text-slate-500 mb-2">
                Paste a Walmart category or browse page URL (e.g., https://www.walmart.com/browse/food/snacks/976759_976787)
              </p>
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    type="text"
                    value={customCategoryUrl}
                    onChange={(e) => setCustomCategoryUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="https://www.walmart.com/browse/..."
                    className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={handleSearch}
                  disabled={loading || !customCategoryUrl.trim()}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 font-medium"
                >
                  {loading ? <Loader size={20} className="animate-spin" /> : <Sparkles size={20} />}
                  Browse
                </button>
              </div>
            </div>
          )}

          {/* Filters Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800"
          >
            <Filter size={16} />
            Filters
            {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {/* Filters Panel */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Sort By</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Max Price ($)</label>
                <input
                  type="number"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Min Rating</label>
                <input
                  type="number"
                  min="0"
                  max="5"
                  step="0.5"
                  value={minRating}
                  onChange={(e) => setMinRating(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="text-red-500 flex-shrink-0" size={20} />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        {success && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <CheckCircle className="text-emerald-500 flex-shrink-0" size={20} />
            <span className="text-emerald-700">{success}</span>
          </div>
        )}

        {/* Results Section */}
        {products.length > 0 && (
          <>
            {/* Results Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <h2 className="font-bold text-slate-800">
                  Results ({products.length} of {totalResults} products)
                </h2>
                <span className="text-sm text-slate-500 bg-slate-100 px-2 py-1 rounded">
                  {lastSearchSource}
                </span>
                <button
                  onClick={selectAll}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  {selectedProducts.size === products.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <button
                onClick={handleAddProducts}
                disabled={adding || selectedProducts.size === 0}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 font-medium"
              >
                {adding ? <Loader size={18} className="animate-spin" /> : <Plus size={18} />}
                Add Selected ({selectedProducts.size})
              </button>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map((product) => (
                <div
                  key={product.id}
                  onClick={() => toggleProduct(product.id)}
                  className={`bg-white rounded-xl border-2 p-4 cursor-pointer transition-all hover:shadow-lg ${
                    selectedProducts.has(product.id)
                      ? 'border-blue-500 ring-2 ring-blue-200'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Selection Indicator */}
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        selectedProducts.has(product.id)
                          ? 'bg-blue-500 border-blue-500'
                          : 'border-slate-300'
                      }`}
                    >
                      {selectedProducts.has(product.id) && <Check size={14} className="text-white" />}
                    </div>
                    <a
                      href={product.url || `https://www.walmart.com/ip/${product.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 text-slate-400 hover:text-blue-600"
                    >
                      <ExternalLink size={16} />
                    </a>
                  </div>

                  {/* Product Image */}
                  {product.image && (
                    <div className="mb-3 flex justify-center">
                      <img
                        src={product.image}
                        alt={product.title}
                        className="h-24 object-contain"
                      />
                    </div>
                  )}

                  {/* Product Title */}
                  <h3 className="font-medium text-slate-800 text-sm line-clamp-2 mb-3">
                    {product.title}
                  </h3>

                  {/* Rating */}
                  {product.rating && (
                    <div className="flex items-center gap-1 text-sm text-slate-500 mb-2">
                      <Star size={14} className="text-yellow-500 fill-yellow-500" />
                      <span>{product.rating}</span>
                      {product.rating_count && (
                        <span className="text-slate-400">({product.rating_count.toLocaleString()})</span>
                      )}
                    </div>
                  )}

                  {/* Fulfillment Badges */}
                  {product.fulfillment && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {product.fulfillment.shipping && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
                          <PackageCheck size={12} />
                          Ship
                        </span>
                      )}
                      {product.fulfillment.delivery && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full">
                          <Truck size={12} />
                          Delivery
                        </span>
                      )}
                      {product.fulfillment.pickup && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 text-xs font-medium rounded-full">
                          <Store size={12} />
                          Pickup
                        </span>
                      )}
                      {product.fulfillment.free_shipping && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-700 text-xs font-medium rounded-full">
                          Free Ship
                        </span>
                      )}
                    </div>
                  )}

                  {/* Pricing */}
                  <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 flex items-center gap-1">
                        <Package size={14} />
                        Cost
                      </span>
                      <span className="font-medium text-slate-700">{formatMoney(product.productCost)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 flex items-center gap-1">
                        <DollarSign size={14} />
                        Sell Price
                      </span>
                      <span className="font-bold text-emerald-600">{formatMoney(product.calculatedSellingPrice)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-200">
                      <span className="text-slate-500">Margin</span>
                      <span className="font-bold text-blue-600">
                        {formatMoney(product.calculatedMargin)} ({product.calculatedMarginPercent}%)
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Empty State */}
        {!loading && products.length === 0 && (query || selectedCategory || customCategoryUrl) && (
          <div className="text-center py-20 bg-white rounded-xl border border-slate-200">
            <Search className="mx-auto text-slate-300 mb-4" size={48} />
            <h3 className="text-lg font-bold text-slate-600 mb-2">No Products Found</h3>
            <p className="text-slate-500">Try a different search term, category, or adjust your filters</p>
          </div>
        )}

        {/* Initial State */}
        {!loading && products.length === 0 && !query && !selectedCategory && !customCategoryUrl && (
          <div className="text-center py-20 bg-white rounded-xl border border-slate-200">
            <Package className="mx-auto text-slate-300 mb-4" size={48} />
            <h3 className="text-lg font-bold text-slate-600 mb-2">Search Walmart Products</h3>
            <p className="text-slate-500">
              Enter a keyword, select a category, or paste a custom URL to discover products
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
