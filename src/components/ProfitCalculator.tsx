'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Calculator, AlertCircle, TrendingUp, TrendingDown, DollarSign,
  CheckCircle, XCircle, AlertTriangle, ArrowLeft, ArrowRight, Settings,
  Save, Link as LinkIcon, Loader, RotateCcw,
  Tag, ChevronDown, ChevronUp, ShoppingBasket, Package, Globe, List
} from 'lucide-react';

interface AirtableConfig {
  apiKey: string;
  baseId: string;
  tableName: string;
}

interface Metrics {
  finalSellingPrice: number;
  platformFee: number;
  platformFeeRate: number;
  totalFees: number;
  netProfit: number;
  marginPercent: number;
  roiPercent: number;
  verdict: 'neutral' | 'good' | 'warning' | 'bad';
}

const ProfitCalculator = () => {
  // --- STATE: Platform & Logic ---
  const [platform, setPlatform] = useState<'Walmart' | 'Amazon'>('Walmart');
  const [category, setCategory] = useState('Grocery');
  const [showBreakdown, setShowBreakdown] = useState(false);

  // --- STATE: Product Data ---
  const [compPrice, setCompPrice] = useState('');
  const [compShipping, setCompShipping] = useState('');
  const [undercut, setUndercut] = useState('2.5');
  const [productCost, setProductCost] = useState('');
  const [supplierLink, setSupplierLink] = useState('');
  const [sku, setSku] = useState('STEF-WM33-S0062');

  // Amazon Specifics
  const [marketplaceLink, setMarketplaceLink] = useState('');
  const [amzBrandApproval, setAmzBrandApproval] = useState(false);
  const [amzCategoryApproval, setAmzCategoryApproval] = useState('Grocery');
  const [isCustomCategory, setIsCustomCategory] = useState(false);

  // --- STATE: Configuration ---
  const [showSettings, setShowSettings] = useState(false);
  const [lister, setLister] = useState('Steff');
  const [store, setStore] = useState('WM33');
  const [airtableConfig, setAirtableConfig] = useState<AirtableConfig>({
    apiKey: '',
    baseId: '',
    tableName: 'Product Research'
  });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error' | 'duplicate'>('idle');
  const [hasEnvConfig, setHasEnvConfig] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{ message: string; productId: string } | null>(null);

  // Constants
  const SHIPPING_FEE = 2.50;
  const SERVICE_CHARGE = 1.50;

  // --- STATE: Metrics ---
  const [metrics, setMetrics] = useState<Metrics>({
    finalSellingPrice: 0,
    platformFee: 0,
    platformFeeRate: 0,
    totalFees: 0,
    netProfit: 0,
    marginPercent: 0,
    roiPercent: 0,
    verdict: 'neutral'
  });

  // --- EFFECT: Check if env vars are configured ---
  useEffect(() => {
    fetch('/api/airtable')
      .then(res => res.json())
      .then(data => {
        setHasEnvConfig(data.configured);
        if (data.tableName) {
          setAirtableConfig(prev => ({ ...prev, tableName: data.tableName }));
        }
      })
      .catch(() => setHasEnvConfig(false));
  }, []);

  // --- EFFECT: Calculation Logic ---
  useEffect(() => {
    const cPrice = parseFloat(compPrice) || 0;
    const cShip = parseFloat(compShipping) || 0;
    const cut = parseFloat(undercut) || 0;
    const pCost = parseFloat(productCost) || 0;

    const totalCompPrice = cPrice + cShip;
    const sPrice = totalCompPrice * (1 - (cut / 100));

    // Fee Logic
    let feeRate = 0.15; // Default (Amazon uses this flat rate)

    // Walmart Specific Logic
    if (platform === 'Walmart' && category === 'Grocery') {
      if (sPrice > 0 && sPrice < 15) {
        feeRate = 0.08;
      }
    }

    const pFee = sPrice * feeRate;
    const totalFees = pFee + SHIPPING_FEE + SERVICE_CHARGE;
    const profit = sPrice - (pCost + totalFees);
    const margin = sPrice > 0 ? (profit / sPrice) * 100 : 0;
    const roi = pCost > 0 ? (profit / pCost) * 100 : 0;

    let status: 'neutral' | 'good' | 'warning' | 'bad' = 'neutral';
    if (sPrice > 0 && pCost > 0) {
      if (profit < 0) status = 'bad';
      else if (margin < 15) status = 'warning';
      else status = 'good';
    }

    setMetrics({
      finalSellingPrice: sPrice,
      platformFee: pFee,
      platformFeeRate: feeRate * 100,
      totalFees,
      netProfit: profit,
      marginPercent: margin,
      roiPercent: roi,
      verdict: status
    });

    if (saveStatus !== 'idle') setSaveStatus('idle');

  }, [compPrice, compShipping, undercut, productCost, supplierLink, sku, category, platform]);

  // --- FUNCTION: Increment SKU ---
  const incrementSku = (currentSku: string): string => {
    return currentSku.replace(/(\d+)$/, (match) => {
      const number = parseInt(match, 10) + 1;
      return String(number).padStart(match.length, '0');
    });
  };

  // --- FUNCTION: Clear Form ---
  const handleClear = () => {
    setCompPrice('');
    setCompShipping('');
    setProductCost('');
    setSupplierLink('');
    setMarketplaceLink('');
    setAmzBrandApproval(false);
    setAmzCategoryApproval('Grocery');
    setIsCustomCategory(false);
    setSaveStatus('idle');
    setDuplicateInfo(null);
  };

  // --- FUNCTION: Save to Airtable ---
  const handleSaveToAirtable = async () => {
    // Check if we have config (either env or manual)
    const needsManualConfig = !hasEnvConfig && (!airtableConfig.apiKey || !airtableConfig.baseId);

    if (needsManualConfig) {
      alert("Please configure your Airtable API Key and Base ID in the settings (gear icon).");
      setShowSettings(true);
      return;
    }

    setSaveStatus('saving');
    setDuplicateInfo(null);

    const payload: Record<string, unknown> = {
      "Lister": lister,
      "Primary Supplier Link": supplierLink,
      "Product Cost": parseFloat(productCost) || 0,
      "Approved Base Price": parseFloat(metrics.finalSellingPrice.toFixed(2)),
      "Date": new Date().toISOString().split('T')[0],
      "Store": store,
      "SKU": sku,
    };

    // Amazon Specific Fields
    if (platform === 'Amazon') {
      payload["Marketplace Link"] = marketplaceLink;
      payload["Amz Brand Approval"] = amzBrandApproval;
      payload["Amz Category Approval"] = amzCategoryApproval;
    }

    try {
      const response = await fetch('/api/airtable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: payload,
          supplierLink: supplierLink,
          platform: platform,
          // Only send custom config if env vars aren't configured
          customConfig: !hasEnvConfig ? airtableConfig : undefined
        })
      });

      const result = await response.json();

      if (response.ok) {
        setSaveStatus('success');
        const nextSku = incrementSku(sku);
        setSku(nextSku);
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else if (result.isDuplicate) {
        // Handle duplicate product
        setSaveStatus('duplicate');
        setDuplicateInfo({
          message: result.message,
          productId: result.productId
        });
      } else {
        console.error("Airtable Error:", result);
        setSaveStatus('error');

        if (result.needsConfig) {
          setShowSettings(true);
        }
        alert(`Failed to save: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error("Network Error:", error);
      setSaveStatus('error');
    }
  };

  const formatMoney = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 font-sans text-slate-800">
      <div className="max-w-md mx-auto">
        {/* Navigation Header */}
        <div className="flex items-center justify-between mb-4">
          <Link href="/" className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
            <ArrowLeft size={20} className="text-slate-600" />
          </Link>
          <Link href="/repricing" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            Repricing <ArrowRight size={16} />
          </Link>
        </div>

        <div className="w-full bg-white rounded-xl shadow-xl overflow-hidden border border-slate-200">

          {/* Header */}
          <div className="bg-slate-800 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <Calculator size={18} />
              <h1 className="font-bold text-base tracking-wide">Profit Scout</h1>
            </div>

          <div className="flex items-center gap-3">
            {/* Platform Toggle */}
            <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-600">
              <button
                onClick={() => setPlatform('Walmart')}
                className={`px-2 py-0.5 text-xs font-bold rounded-md transition-all ${platform === 'Walmart' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
              >
                WM
              </button>
              <button
                onClick={() => setPlatform('Amazon')}
                className={`px-2 py-0.5 text-xs font-bold rounded-md transition-all ${platform === 'Amazon' ? 'bg-orange-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
              >
                AMZ
              </button>
            </div>

            <button onClick={handleClear} className="text-slate-400 hover:text-white transition-colors" title="Reset">
              <RotateCcw size={16} />
            </button>
            <button onClick={() => setShowSettings(!showSettings)} className={`transition-colors ${showSettings ? 'text-white' : 'text-slate-400 hover:text-white'}`}>
              <Settings size={18} />
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="bg-slate-100 p-4 border-b border-slate-200">
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-3">Settings & API</h3>

            {hasEnvConfig ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
                <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
                  <CheckCircle size={16} />
                  <span>Airtable configured via environment variables</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3 mb-4">
                <input
                  type="text" placeholder="API Key (pat...)"
                  value={airtableConfig.apiKey} onChange={(e) => setAirtableConfig({...airtableConfig, apiKey: e.target.value})}
                  className="w-full text-xs p-2 border border-slate-300 rounded"
                />
                <input
                  type="text" placeholder="Base ID (app...)"
                  value={airtableConfig.baseId} onChange={(e) => setAirtableConfig({...airtableConfig, baseId: e.target.value})}
                  className="w-full text-xs p-2 border border-slate-300 rounded"
                />
                <input
                  type="text" placeholder="Table Name"
                  value={airtableConfig.tableName} onChange={(e) => setAirtableConfig({...airtableConfig, tableName: e.target.value})}
                  className="w-full text-xs p-2 border border-slate-300 rounded"
                />
              </div>
            )}

            <div className="space-y-2 mb-2">
              <div className="flex items-center gap-3">
                <input type="text" placeholder="Lister" value={lister} onChange={(e) => setLister(e.target.value)} className="w-1/2 text-xs p-2 border border-slate-300 rounded"/>
                <input type="text" placeholder="Store" value={store} onChange={(e) => setStore(e.target.value)} className="w-1/2 text-xs p-2 border border-slate-300 rounded"/>
              </div>
            </div>
            <button onClick={() => setShowSettings(false)} className="w-full bg-slate-800 text-white text-xs py-2 rounded mt-2 hover:bg-slate-700 font-bold uppercase">Close Settings</button>
          </div>
        )}

        <div className="p-4 space-y-3">

          {/* Logic Bar: Category (WM) OR Approvals (AMZ) */}
          {platform === 'Walmart' ? (
            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button onClick={() => setCategory('Grocery')} className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded-md transition-all ${category === 'Grocery' ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>
                <ShoppingBasket size={14} /> Grocery
              </button>
              <button onClick={() => setCategory('Other')} className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded-md transition-all ${category === 'Other' ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>
                <Package size={14} /> Other
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
               {/* Brand Checkbox */}
               <label className={`flex items-center justify-center gap-2 p-1.5 rounded-lg border cursor-pointer transition-all ${amzBrandApproval ? 'bg-orange-50 border-orange-200 text-orange-800' : 'bg-white border-slate-200 text-slate-500'}`}>
                 <input
                  type="checkbox"
                  checked={amzBrandApproval}
                  onChange={(e) => setAmzBrandApproval(e.target.checked)}
                  className="w-4 h-4 text-orange-600 rounded focus:ring-orange-500 border-gray-300"
                 />
                 <span className="text-xs font-bold">Brand Approved</span>
               </label>

               {/* Category Selection Logic */}
               <div className="relative">
                 <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-orange-500">
                    <List size={14} />
                 </div>

                 {!isCustomCategory ? (
                   <>
                     <select
                       value={amzCategoryApproval}
                       onChange={(e) => {
                         if (e.target.value === 'OTHER') {
                           setIsCustomCategory(true);
                           setAmzCategoryApproval('');
                         } else {
                           setAmzCategoryApproval(e.target.value);
                         }
                       }}
                       className="w-full pl-8 pr-8 py-1.5 text-xs font-bold text-orange-800 border border-orange-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-orange-50 appearance-none cursor-pointer"
                     >
                       <option value="Grocery">Grocery</option>
                       <option value="No Need Category">No Need Category</option>
                       <option value="Beauty">Beauty</option>
                       <option value="Health">Health</option>
                       <option value="Home">Home</option>
                       <option value="Toys">Toys</option>
                       <option value="Automotive">Automotive</option>
                       <option value="OTHER">Other...</option>
                     </select>
                     <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none text-orange-400">
                       <ChevronDown size={12} />
                     </div>
                   </>
                 ) : (
                   <>
                     <input
                       type="text"
                       autoFocus
                       value={amzCategoryApproval}
                       onChange={(e) => setAmzCategoryApproval(e.target.value)}
                       placeholder="Type Category..."
                       className="w-full pl-8 pr-8 py-1.5 text-xs font-bold text-orange-800 border border-orange-200 rounded-lg focus:ring-2 focus:ring-orange-500 bg-white"
                     />
                     <button
                       onClick={() => {
                         setIsCustomCategory(false);
                         setAmzCategoryApproval('Grocery');
                       }}
                       className="absolute inset-y-0 right-0 pr-2 flex items-center text-orange-400 hover:text-orange-600"
                       title="Back to list"
                     >
                       <XCircle size={14} />
                     </button>
                   </>
                 )}
               </div>
            </div>
          )}

          {/* Competitor Benchmark */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Item Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                  <input
                    type="number" value={compPrice} onChange={(e) => setCompPrice(e.target.value)} placeholder="0.00"
                    className="w-full pl-6 pr-2 py-1.5 text-sm font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Shipping</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                  <input
                    type="number" value={compShipping} onChange={(e) => setCompShipping(e.target.value)} placeholder="0.00"
                    className="w-full pl-6 pr-2 py-1.5 text-sm font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-[35%]">
                 <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Undercut</label>
                 <div className="relative">
                    <span className="absolute left-2 top-2 text-slate-400 text-xs">%</span>
                    <input
                      type="number" value={undercut} onChange={(e) => setUndercut(e.target.value)} placeholder="0"
                      className="w-full pl-6 pr-2 py-1.5 text-sm font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-red-500"
                    />
                 </div>
              </div>
              <div className="pt-5 text-slate-300">
                <ArrowRight size={18} />
              </div>
              <div className="flex-grow">
                 <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Your Price</label>
                 <div className="bg-white border-2 border-blue-100 rounded-lg px-3 py-1.5 text-right font-bold text-blue-600 text-lg shadow-sm">
                   {formatMoney(metrics.finalSellingPrice)}
                 </div>
              </div>
            </div>

            {/* Conditional Fee Pill - Only show for Walmart (dynamic) */}
            {metrics.finalSellingPrice > 0 && platform === 'Walmart' && (
              <div className={`mt-2 text-xs flex justify-center items-center gap-1.5 px-3 py-1 rounded-md border w-full font-medium ${metrics.platformFeeRate === 8 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                {metrics.platformFeeRate === 8 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                <span>Platform Fee: <b>{metrics.platformFeeRate}%</b> ({category})</span>
              </div>
            )}
          </div>

          {/* Main Inputs */}
          <div className="space-y-2">
            <div className="flex gap-3">
              <div className="w-1/2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Product Cost</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <DollarSign size={16} />
                  </div>
                  <input
                    type="number" value={productCost} onChange={(e) => setProductCost(e.target.value)} placeholder="0.00"
                    className="block w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-semibold shadow-sm"
                  />
                </div>
              </div>
              <div className="w-1/2">
                 <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Proposed SKU</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Tag size={16} />
                  </div>
                  <input
                    type="text" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU"
                    className="block w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-xs font-mono bg-slate-50 shadow-sm text-slate-600"
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <LinkIcon size={16} />
                </div>
                <input
                  type="text" value={supplierLink} onChange={(e) => setSupplierLink(e.target.value)} placeholder="Supplier Link"
                  className="block w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm shadow-sm"
                />
              </div>
            </div>

            {/* Amazon Specific Input */}
            {platform === 'Amazon' && (
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-orange-400">
                  <Globe size={16} />
                </div>
                <input
                  type="text" value={marketplaceLink} onChange={(e) => setMarketplaceLink(e.target.value)} placeholder="Amazon Marketplace Link"
                  className="block w-full pl-9 pr-3 py-2 border border-orange-200 rounded-lg focus:ring-2 focus:ring-orange-500 text-sm shadow-sm"
                />
              </div>
            )}
          </div>

        </div>

        {/* Collapsible Breakdown */}
        <div className="bg-slate-50 border-t border-slate-100">
          <button onClick={() => setShowBreakdown(!showBreakdown)} className="w-full px-5 py-2 flex items-center justify-between text-xs font-bold text-slate-500 uppercase hover:bg-slate-100 transition-colors">
            <span>Cost Breakdown</span>
            {showBreakdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showBreakdown && (
            <div className="px-5 pb-3 space-y-2 text-sm">
               <div className="flex justify-between text-slate-600">
                <span>Platform Fee ({metrics.platformFeeRate}%)</span>
                <span>{formatMoney(metrics.platformFee)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Shipping Label</span>
                <span>{formatMoney(SHIPPING_FEE)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Service Charge</span>
                <span>{formatMoney(SERVICE_CHARGE)}</span>
              </div>
              <div className="border-t border-slate-200 my-1"></div>
              <div className="flex justify-between font-bold text-slate-700">
                <span>Total Deductions</span>
                <span>{formatMoney(metrics.totalFees)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Results Area */}
        <div className="p-4">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className={`p-3 rounded-xl border ${metrics.verdict === 'bad' ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200 shadow-sm'}`}>
              <div className="text-xs text-slate-500 font-medium mb-1 uppercase tracking-wide">Net Margin</div>
              <div className={`text-2xl font-bold ${metrics.netProfit < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                {formatMoney(metrics.netProfit)}
              </div>
              <div className={`text-sm font-bold mt-1 ${metrics.netProfit < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                {metrics.marginPercent.toFixed(1)}%
              </div>
            </div>

            <div className="p-3 rounded-xl border bg-white border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium mb-1 uppercase tracking-wide">ROI</div>
              <div className={`text-2xl font-bold ${metrics.roiPercent < 0 ? 'text-red-600' : 'text-blue-600'}`}>
                {metrics.roiPercent.toFixed(0)}%
              </div>
              <div className="text-xs text-slate-400 mt-1">Return on Cost</div>
            </div>
          </div>

          {metrics.verdict === 'neutral' ? (
             <div className="bg-slate-100 text-slate-500 p-3 rounded-xl text-center text-sm font-medium flex items-center justify-center gap-2 border border-slate-200 border-dashed">
              <AlertCircle size={16} />
              <span>Enter price & cost to analyze</span>
            </div>
          ) : (
            <div className="space-y-3">
              {metrics.verdict === 'good' && (
                <div className="bg-green-100 text-green-800 p-2.5 rounded-lg text-center text-sm font-bold flex items-center justify-center gap-2 border border-green-200">
                  <CheckCircle size={16} /> <span>GREAT LISTING</span>
                </div>
              )}
              {metrics.verdict === 'warning' && (
                <div className="bg-yellow-100 text-yellow-800 p-2.5 rounded-lg text-center text-sm font-bold flex items-center justify-center gap-2 border border-yellow-200">
                  <AlertTriangle size={16} /> <span>MARGIN THIN (&lt;15%)</span>
                </div>
              )}
              {metrics.verdict === 'bad' && (
                <div className="bg-red-100 text-red-800 p-2.5 rounded-lg text-center text-sm font-bold flex items-center justify-center gap-2 border border-red-200">
                  <XCircle size={16} /> <span>LOSS - DO NOT LIST</span>
                </div>
              )}

              {/* Duplicate Warning */}
              {saveStatus === 'duplicate' && duplicateInfo && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 space-y-2">
                  <div className="flex items-start gap-2 text-amber-800">
                    <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-sm">Duplicate Product</div>
                      <div className="text-xs mt-1">{duplicateInfo.message}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSaveStatus('idle');
                      setDuplicateInfo(null);
                    }}
                    className="w-full py-2 bg-amber-200 text-amber-800 rounded-lg text-xs font-bold hover:bg-amber-300 transition-colors"
                  >
                    Got it, I&apos;ll check another product
                  </button>
                </div>
              )}

              {metrics.verdict !== 'bad' && saveStatus !== 'duplicate' && (
                <button
                  onClick={handleSaveToAirtable}
                  disabled={saveStatus === 'saving' || saveStatus === 'success'}
                  className={`w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg ${
                    saveStatus === 'success' ? 'bg-green-600' :
                    saveStatus === 'error' ? 'bg-red-600' :
                    platform === 'Amazon' ? 'bg-gradient-to-r from-orange-500 to-orange-600' : 'bg-gradient-to-r from-blue-600 to-blue-700'
                  }`}
                >
                  {saveStatus === 'saving' ? (
                    <> <Loader className="animate-spin" size={18} /> <span>Saving...</span> </>
                  ) : saveStatus === 'success' ? (
                    <> <CheckCircle size={18} /> <span>Saved Successfully!</span> </>
                  ) : (
                    <> <Save size={18} /> <span>Push to Airtable</span> </>
                  )}
                </button>
              )}

              {metrics.verdict !== 'bad' && saveStatus !== 'duplicate' && (
                <div className="text-xs text-slate-400 text-center flex items-center justify-center gap-1">
                  <span>Saving to</span>
                  <span className={`font-bold ${platform === 'Amazon' ? 'text-orange-500' : 'text-blue-500'}`}>{platform}</span>
                  <span>as <b>{lister}</b></span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default ProfitCalculator;
