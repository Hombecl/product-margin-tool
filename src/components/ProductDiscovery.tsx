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
  PackageCheck,
  Info,
  X,
  Users,
  Barcode,
  ShoppingCart,
  Settings,
  Target
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
  isExisting?: boolean; // Already in Airtable
  // Extended details (from details API)
  upc?: string;
  gtin?: string;
  inStock?: boolean;
  stockQuantity?: number;
  thirdPartySellers?: number;
  hasCompetition?: boolean;
  brand?: string;
  detailsLoaded?: boolean;
  detailsError?: string;
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

// Default excluded brands (Walmart private labels)
const DEFAULT_EXCLUDED_BRANDS = [
  'Great Value',
  'Equate',
  'Mainstays',
  'Parent\'s Choice',
  'Sam\'s Choice',
  'ol\' roy',
  'Special Kitty',
];

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

  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [additionalCost, setAdditionalCost] = useState(4.50);
  const [targetProductCount, setTargetProductCount] = useState(100);
  const [autoFetchPages, setAutoFetchPages] = useState(false);

  // Category state
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [customCategoryUrl, setCustomCategoryUrl] = useState('');

  // Results state
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [totalResults, setTotalResults] = useState(0);
  const [lastSearchSource, setLastSearchSource] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Brand exclusion state
  const [excludedBrands, setExcludedBrands] = useState<string[]>(DEFAULT_EXCLUDED_BRANDS);
  const [newExcludedBrand, setNewExcludedBrand] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showStats, setShowStats] = useState(false);

  // Review step state
  const [showReview, setShowReview] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [reviewProducts, setReviewProducts] = useState<Product[]>([]);

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
  const handleKeywordSearch = async (pageNum = 1, append = false) => {
    if (!query.trim()) {
      setError('Please enter a search query');
      return;
    }

    if (!operator.trim()) {
      setError('Please enter your name');
      return;
    }

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setProducts([]);
      setSelectedProducts(new Set());
    }
    setError('');
    setSuccess('');

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
          sortBy,
          page: pageNum,
          checkDuplicates: true,
          additionalCost  // Pass custom cost setting
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Search failed');
      }

      if (append) {
        // Deduplicate when appending - only add products not already in list
        const existingIds = new Set(products.map(p => p.id));
        const newProducts = (data.products || []).filter((p: Product) => !existingIds.has(p.id));
        setProducts(prev => [...prev, ...newProducts]);
      } else {
        setProducts(data.products || []);
      }

      setTotalResults(data.totalResults || 0);
      setCurrentPage(data.currentPage || 1);
      setTotalPages(data.totalPages || 1);
      setHasMore(data.hasMore || false);
      setLastSearchSource(`Keyword: ${query}`);

      if (!append && data.products?.length === 0) {
        setError('No products found matching your criteria');
      }

      fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Load more results
  const handleLoadMore = () => {
    if (hasMore && !loadingMore) {
      handleKeywordSearch(currentPage + 1, true);
    }
  };

  // Auto-fetch multiple pages to reach target count
  const handleAutoFetchPages = async () => {
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

    let allProducts: Product[] = [];
    let page = 1;
    const maxPages = Math.ceil(targetProductCount / 40); // ~40 products per page

    try {
      while (allProducts.length < targetProductCount && page <= maxPages) {
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
            sortBy,
            page,
            checkDuplicates: true,
            additionalCost
          })
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Search failed');
        }

        if (!data.products || data.products.length === 0) {
          break; // No more products
        }

        // Deduplicate
        const existingIds = new Set(allProducts.map(p => p.id));
        const newProducts = data.products.filter((p: Product) => !existingIds.has(p.id));
        allProducts = [...allProducts, ...newProducts];

        setProducts([...allProducts]);
        setTotalResults(data.totalResults || allProducts.length);
        setCurrentPage(page);
        setTotalPages(data.totalPages || page);

        if (!data.hasMore) {
          break; // No more pages
        }

        page++;

        // Small delay between requests
        if (page <= maxPages && allProducts.length < targetProductCount) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      setHasMore(false);
      setLastSearchSource(`Keyword: ${query}`);
      setSuccess(`Loaded ${allProducts.length} products from ${page} page(s)`);

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
    // Reset pagination when starting new search
    setCurrentPage(1);
    setTotalPages(1);
    setHasMore(false);

    if (searchMode === 'keyword') {
      handleKeywordSearch(1, false);
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

  // Select all filtered products (excluding brands already filtered out)
  const selectAll = () => {
    if (selectedProducts.size === filteredProducts.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(filteredProducts.map(p => p.id)));
    }
  };

  // Select only new products (not in Airtable, from filtered list)
  const selectNewOnly = () => {
    const newProductIds = filteredProducts
      .filter(p => !p.isExisting)
      .map(p => p.id);
    setSelectedProducts(new Set(newProductIds));
  };

  // Deselect products from excluded brands (for when user wants to clean up selection)
  const deselectExcludedBrands = () => {
    const excludedIds = new Set(
      products.filter(p => isExcludedBrand(p.title)).map(p => p.id)
    );
    setSelectedProducts(prev => {
      const next = new Set(prev);
      excludedIds.forEach(id => next.delete(id));
      return next;
    });
  };

  // Check if product title contains excluded brand
  const isExcludedBrand = (title: string): boolean => {
    const lowerTitle = title.toLowerCase();
    return excludedBrands.some(brand => lowerTitle.includes(brand.toLowerCase()));
  };

  // Get filtered products (excluding brands)
  const filteredProducts = products.filter(p => !isExcludedBrand(p.title));

  // Add new brand to exclusion list
  const addExcludedBrand = () => {
    if (newExcludedBrand.trim() && !excludedBrands.includes(newExcludedBrand.trim())) {
      setExcludedBrands(prev => [...prev, newExcludedBrand.trim()]);
      setNewExcludedBrand('');
    }
  };

  // Remove brand from exclusion list
  const removeExcludedBrand = (brand: string) => {
    setExcludedBrands(prev => prev.filter(b => b !== brand));
  };

  // Get product details for selected products (UPC, stock, 3P sellers)
  const handleGetDetails = async () => {
    if (selectedProducts.size === 0) {
      setError('Please select at least one product');
      return;
    }

    setLoadingDetails(true);
    setError('');

    try {
      const selectedProductsList = filteredProducts.filter(p => selectedProducts.has(p.id));
      const productIds = selectedProductsList.map(p => p.id);

      const res = await fetch('/api/discovery/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productIds,
          operator: operator.trim(),
          store,
          sessionId
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch details');
      }

      // Merge details into products
      const detailsMap = new Map(data.products.map((p: Product) => [p.id, p]));
      const productsWithDetails = selectedProductsList.map(product => {
        const details = detailsMap.get(product.id) as Product | undefined;
        if (details) {
          return {
            ...product,
            upc: details.upc,
            gtin: details.gtin,
            inStock: details.inStock,
            stockQuantity: details.stockQuantity,
            thirdPartySellers: details.thirdPartySellers,
            hasCompetition: details.hasCompetition,
            brand: details.brand,
            detailsLoaded: true,
            detailsError: details.detailsError
          };
        }
        return { ...product, detailsLoaded: true };
      });

      setReviewProducts(productsWithDetails);
      setShowReview(true);

      if (data.truncated) {
        setSuccess(`Loaded details for ${data.products.length} products (max 20 per request)`);
      }

      fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch details');
    } finally {
      setLoadingDetails(false);
    }
  };

  // Add products from review (final step)
  const handleAddFromReview = async () => {
    if (reviewProducts.length === 0) {
      setError('No products to add');
      return;
    }

    setAdding(true);
    setError('');
    setSuccess('');

    try {
      // Filter out products with competition (optional - can be toggled)
      const productsToAdd = reviewProducts;

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

      // Remove added products from the main list
      const addedIds = new Set(productsToAdd.map(p => p.id));
      setProducts(prev => prev.filter(p => !addedIds.has(p.id)));
      setSelectedProducts(new Set());
      setShowReview(false);
      setReviewProducts([]);

      fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add products');
    } finally {
      setAdding(false);
    }
  };

  // Remove product from review list
  const removeFromReview = (productId: string) => {
    setReviewProducts(prev => prev.filter(p => p.id !== productId));
  };

  // Close review panel
  const closeReview = () => {
    setShowReview(false);
    setReviewProducts([]);
  };

  // Add selected products (direct add without details - legacy)
  const handleAddProducts = async () => {
    if (selectedProducts.size === 0) {
      setError('Please select at least one product');
      return;
    }

    setAdding(true);
    setError('');
    setSuccess('');

    try {
      const productsToAdd = filteredProducts.filter(p => selectedProducts.has(p.id));

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <Settings size={18} />
              Settings
            </button>
            <button
              onClick={() => setShowStats(!showStats)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <BarChart3 size={18} />
              Stats
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
            <h2 className="font-bold text-slate-800 mb-4">Settings</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Additional Cost ($)
                </label>
                <input
                  type="number"
                  step="0.50"
                  min="0"
                  value={additionalCost}
                  onChange={(e) => setAdditionalCost(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1">Added to cost for margin calc</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Target Product Count
                </label>
                <input
                  type="number"
                  step="50"
                  min="40"
                  max="500"
                  value={targetProductCount}
                  onChange={(e) => setTargetProductCount(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1">For auto multi-page search</p>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Margin Formula
                </label>
                <div className="bg-slate-100 rounded-lg p-3 text-sm font-mono">
                  <div>Selling Price = (Cost + ${additionalCost.toFixed(2)}) / 0.745</div>
                  <div className="text-slate-500 mt-1">Platform fee: 10.5% | Target margin: 15%</div>
                </div>
              </div>
            </div>
          </div>
        )}

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
              <button
                onClick={handleAutoFetchPages}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 font-medium"
                title={`Auto-fetch up to ${targetProductCount} products`}
              >
                {loading ? <Loader size={20} className="animate-spin" /> : <Target size={20} />}
                Auto ({targetProductCount})
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
            <div className="mt-4 pt-4 border-t border-slate-200 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

              {/* Brand Exclusion */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Exclude Brands</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {excludedBrands.map((brand) => (
                    <span
                      key={brand}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 text-xs rounded-full border border-red-200"
                    >
                      {brand}
                      <button
                        onClick={() => removeExcludedBrand(brand)}
                        className="hover:text-red-900 font-bold"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newExcludedBrand}
                    onChange={(e) => setNewExcludedBrand(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addExcludedBrand()}
                    placeholder="Add brand to exclude..."
                    className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={addExcludedBrand}
                    className="px-3 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                  >
                    Add
                  </button>
                </div>
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
        {filteredProducts.length > 0 && (
          <>
            {/* Results Header */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-4 flex-wrap">
                <h2 className="font-bold text-slate-800">
                  Results ({filteredProducts.length} of {totalResults} products)
                </h2>
                <span className="text-sm text-slate-500 bg-slate-100 px-2 py-1 rounded">
                  {lastSearchSource}
                </span>
                {/* Show excluded count */}
                {products.length > filteredProducts.length && (
                  <span className="text-sm text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200">
                    {products.length - filteredProducts.length} excluded (brand)
                  </span>
                )}
                {/* Show existing products count */}
                {filteredProducts.filter(p => p.isExisting).length > 0 && (
                  <span className="text-sm text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                    {filteredProducts.filter(p => p.isExisting).length} already in Airtable
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={selectAll}
                  className="text-sm text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50"
                >
                  {selectedProducts.size === filteredProducts.length ? 'Deselect All' : 'Select All'}
                </button>
                {filteredProducts.some(p => !p.isExisting) && (
                  <button
                    onClick={selectNewOnly}
                    className="text-sm text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded hover:bg-emerald-50 font-medium"
                  >
                    Select New Only ({filteredProducts.filter(p => !p.isExisting).length})
                  </button>
                )}
                {/* Button to remove excluded brands from selection */}
                {selectedProducts.size > 0 && products.some(p => isExcludedBrand(p.title) && selectedProducts.has(p.id)) && (
                  <button
                    onClick={deselectExcludedBrands}
                    className="text-sm text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 font-medium"
                  >
                    Remove Excluded Brands ({products.filter(p => isExcludedBrand(p.title) && selectedProducts.has(p.id)).length})
                  </button>
                )}
                <button
                  onClick={handleGetDetails}
                  disabled={loadingDetails || selectedProducts.size === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 font-medium"
                >
                  {loadingDetails ? <Loader size={18} className="animate-spin" /> : <Info size={18} />}
                  Get Details ({selectedProducts.size})
                </button>
              </div>
            </div>

            {/* Products Grid - Max 5 columns */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  onClick={() => toggleProduct(product.id)}
                  className={`bg-white rounded-lg border-2 p-2.5 cursor-pointer transition-all hover:shadow-md ${
                    selectedProducts.has(product.id)
                      ? 'border-blue-500 ring-2 ring-blue-200'
                      : product.isExisting
                      ? 'border-amber-300 bg-amber-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Header: Checkbox + Walmart Badge + Link */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                          selectedProducts.has(product.id)
                            ? 'bg-blue-500 border-blue-500'
                            : product.isExisting
                            ? 'border-amber-400 bg-amber-100'
                            : 'border-slate-300'
                        }`}
                      >
                        {selectedProducts.has(product.id) && <Check size={12} className="text-white" />}
                        {product.isExisting && !selectedProducts.has(product.id) && (
                          <span className="text-amber-600 text-xs font-bold">!</span>
                        )}
                      </div>
                      {/* Walmart.com Badge */}
                      {product.seller_name?.toLowerCase().includes('walmart') && (
                        <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded">
                          WM
                        </span>
                      )}
                    </div>
                    <a
                      href={`https://www.walmart.com/ip/${product.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-0.5 text-slate-400 hover:text-blue-600"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>

                  {/* Product Image - Smaller */}
                  {product.image && (
                    <div className="mb-2 flex justify-center">
                      <img
                        src={product.image}
                        alt={product.title}
                        className="h-16 object-contain"
                      />
                    </div>
                  )}

                  {/* Existing Product Warning */}
                  {product.isExisting && (
                    <div className="mb-1.5 px-1.5 py-0.5 bg-amber-100 border border-amber-300 rounded text-[10px] text-amber-700 text-center">
                      Already in Airtable
                    </div>
                  )}

                  {/* Product Title - More compact */}
                  <h3 className="font-medium text-slate-800 text-xs line-clamp-2 mb-1.5 leading-tight">
                    {product.title}
                  </h3>

                  {/* Rating - Inline compact */}
                  {product.rating && (
                    <div className="flex items-center gap-1 text-xs text-slate-500 mb-1.5">
                      <Star size={10} className="text-yellow-500 fill-yellow-500" />
                      <span>{product.rating}</span>
                      <span className="text-slate-400">({product.rating_count?.toLocaleString()})</span>
                    </div>
                  )}

                  {/* Fulfillment Status - Compact with ZIP */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {product.fulfillment?.shipping ? (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-medium rounded">
                        <PackageCheck size={10} />
                        77057
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-50 text-red-600 text-[10px] font-medium rounded">
                        No Ship
                      </span>
                    )}
                    {product.fulfillment?.delivery && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-medium rounded">
                        <Truck size={10} />
                      </span>
                    )}
                    {product.fulfillment?.pickup && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-medium rounded">
                        <Store size={10} />
                      </span>
                    )}
                  </div>

                  {/* Pricing - Compact */}
                  <div className="bg-slate-100 rounded p-1.5 space-y-0.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Cost</span>
                      <span className="font-medium text-slate-700">{formatMoney(product.productCost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Sell</span>
                      <span className="font-bold text-emerald-600">{formatMoney(product.calculatedSellingPrice)}</span>
                    </div>
                    <div className="flex justify-between pt-0.5 border-t border-slate-200">
                      <span className="text-slate-500">Margin</span>
                      <span className="font-bold text-blue-600">{product.calculatedMarginPercent}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Load More Button */}
            {hasMore && searchMode === 'keyword' && (
              <div className="mt-6 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50 font-medium"
                >
                  {loadingMore ? (
                    <>
                      <Loader size={18} className="animate-spin" />
                      Loading more...
                    </>
                  ) : (
                    <>
                      <Plus size={18} />
                      Load More Results (Page {currentPage + 1} of ~{totalPages})
                    </>
                  )}
                </button>
                <p className="text-xs text-slate-500 mt-2">
                  Each page costs 10 ScrapingBee credits
                </p>
              </div>
            )}

            {/* End of Results */}
            {!hasMore && filteredProducts.length > 40 && (
              <div className="mt-6 text-center text-sm text-slate-500">
                End of results ({filteredProducts.length} products loaded)
              </div>
            )}
          </>
        )}

        {/* Empty State */}
        {!loading && filteredProducts.length === 0 && (query || selectedCategory || customCategoryUrl) && (
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

        {/* Review Panel (Modal/Slide-over) */}
        {showReview && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            <div className="absolute inset-0 bg-black/50" onClick={closeReview} />
            <div className="absolute inset-y-0 right-0 w-full max-w-3xl bg-white shadow-xl flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-200">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Review Products</h2>
                  <p className="text-sm text-slate-500">
                    {reviewProducts.length} products with details loaded
                  </p>
                </div>
                <button
                  onClick={closeReview}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Summary Stats */}
              <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-4 gap-3">
                <div className="bg-white rounded-lg p-3 border border-slate-200">
                  <div className="text-xs text-slate-500">Total</div>
                  <div className="text-xl font-bold text-slate-700">{reviewProducts.length}</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-emerald-200">
                  <div className="text-xs text-emerald-600">In Stock</div>
                  <div className="text-xl font-bold text-emerald-700">
                    {reviewProducts.filter(p => p.inStock).length}
                  </div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-blue-200">
                  <div className="text-xs text-blue-600">Has UPC</div>
                  <div className="text-xl font-bold text-blue-700">
                    {reviewProducts.filter(p => p.upc || p.gtin).length}
                  </div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-orange-200">
                  <div className="text-xs text-orange-600">No Competition</div>
                  <div className="text-xl font-bold text-orange-700">
                    {reviewProducts.filter(p => !p.hasCompetition).length}
                  </div>
                </div>
              </div>

              {/* Products List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {reviewProducts.map((product) => (
                  <div
                    key={product.id}
                    className={`bg-white rounded-lg border p-4 ${
                      product.hasCompetition
                        ? 'border-orange-300 bg-orange-50'
                        : !product.inStock
                        ? 'border-red-200 bg-red-50'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="flex gap-4">
                      {/* Image */}
                      {product.image && (
                        <img
                          src={product.image}
                          alt={product.title}
                          className="w-16 h-16 object-contain flex-shrink-0"
                        />
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-medium text-sm text-slate-800 line-clamp-2">
                            {product.title}
                          </h3>
                          <button
                            onClick={() => removeFromReview(product.id)}
                            className="p-1 text-slate-400 hover:text-red-500 flex-shrink-0"
                          >
                            <X size={16} />
                          </button>
                        </div>

                        {/* Details Row */}
                        <div className="flex flex-wrap gap-2 mt-2">
                          {/* UPC */}
                          {(product.upc || product.gtin) && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded">
                              <Barcode size={12} />
                              {product.upc || product.gtin}
                            </span>
                          )}

                          {/* Stock Status */}
                          {product.inStock ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 text-xs rounded">
                              <CheckCircle size={12} />
                              In Stock {product.stockQuantity && `(${product.stockQuantity})`}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-600 text-xs rounded">
                              <AlertCircle size={12} />
                              Out of Stock
                            </span>
                          )}

                          {/* Third Party Sellers */}
                          {product.thirdPartySellers !== undefined && (
                            <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded ${
                              product.thirdPartySellers > 0
                                ? 'bg-orange-50 text-orange-700'
                                : 'bg-emerald-50 text-emerald-700'
                            }`}>
                              <Users size={12} />
                              {product.thirdPartySellers} 3P Seller{product.thirdPartySellers !== 1 ? 's' : ''}
                            </span>
                          )}

                          {/* Competition Warning */}
                          {product.hasCompetition && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded font-medium">
                              <AlertCircle size={12} />
                              Has Competition
                            </span>
                          )}

                          {/* Brand */}
                          {product.brand && (
                            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded">
                              {product.brand}
                            </span>
                          )}
                        </div>

                        {/* Pricing */}
                        <div className="flex items-center gap-4 mt-2 text-sm">
                          <span className="text-slate-500">
                            Cost: <span className="font-medium text-slate-700">{formatMoney(product.productCost)}</span>
                          </span>
                          <span className="text-slate-500">
                            Sell: <span className="font-bold text-emerald-600">{formatMoney(product.calculatedSellingPrice)}</span>
                          </span>
                          <span className="text-slate-500">
                            Margin: <span className="font-bold text-blue-600">{product.calculatedMarginPercent}%</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer Actions */}
              <div className="p-4 border-t border-slate-200 bg-white">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-500">
                    <span className="font-medium text-emerald-600">
                      {reviewProducts.filter(p => p.inStock && !p.hasCompetition).length}
                    </span>
                    {' '}products ready to add (in stock, no competition)
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={closeReview}
                      className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddFromReview}
                      disabled={adding || reviewProducts.length === 0}
                      className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 font-medium"
                    >
                      {adding ? <Loader size={18} className="animate-spin" /> : <ShoppingCart size={18} />}
                      Add {reviewProducts.length} to Airtable
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
