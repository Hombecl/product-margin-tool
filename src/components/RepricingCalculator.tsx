'use client';

import React, { useState, useEffect } from 'react';
import {
  Calculator, AlertCircle, TrendingDown, DollarSign,
  CheckCircle, XCircle, AlertTriangle, ArrowRight, Settings,
  Save, Loader, RotateCcw, Tag, ChevronDown, ChevronUp,
  Target, TrendingUp
} from 'lucide-react';

interface Metrics {
  competitivePrice: number;
  platformFee: number;
  platformFeeRate: number;
  totalFees: number;
  netProfit: number;
  marginPercent: number;
  proposedPrice: number;
  priceSource: 'competitive' | 'minimum';
  minPrice10: number;
  minPrice15: number;
  minPrice19: number;
}

const RepricingCalculator = () => {
  // --- STATE: Settings ---
  const [showSettings, setShowSettings] = useState(false);
  const [store, setStore] = useState('WM24');
  const [minimumMargin, setMinimumMargin] = useState(10);
  const [showBreakdown, setShowBreakdown] = useState(false);

  // --- STATE: Inputs ---
  const [sku, setSku] = useState('');
  const [compPrice, setCompPrice] = useState('');
  const [compShipping, setCompShipping] = useState('');
  const [undercut, setUndercut] = useState('2.5');
  const [productCost, setProductCost] = useState('');

  // --- STATE: Save ---
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [hasEnvConfig, setHasEnvConfig] = useState(false);

  // Constants (same as original calculator)
  const SHIPPING_FEE = 2.50;
  const SERVICE_CHARGE = 1.50;

  // --- STATE: Metrics ---
  const [metrics, setMetrics] = useState<Metrics>({
    competitivePrice: 0,
    platformFee: 0,
    platformFeeRate: 0,
    totalFees: 0,
    netProfit: 0,
    marginPercent: 0,
    proposedPrice: 0,
    priceSource: 'competitive',
    minPrice10: 0,
    minPrice15: 0,
    minPrice19: 0
  });

  // --- EFFECT: Check env config ---
  useEffect(() => {
    fetch('/api/airtable')
      .then(res => res.json())
      .then(data => setHasEnvConfig(data.configured))
      .catch(() => setHasEnvConfig(false));
  }, []);

  // --- EFFECT: Calculation Logic ---
  useEffect(() => {
    const cPrice = parseFloat(compPrice) || 0;
    const cShip = parseFloat(compShipping) || 0;
    const cut = parseFloat(undercut) || 0;
    const pCost = parseFloat(productCost) || 0;

    // Calculate competitive price (competitor total - undercut%)
    const totalCompPrice = cPrice + cShip;
    const competitivePrice = totalCompPrice * (1 - (cut / 100));

    // Fee logic (Grocery category, price-based)
    let feeRate = 0.15; // Default 15%
    if (competitivePrice > 0 && competitivePrice < 15) {
      feeRate = 0.08; // 8% for items under $15
    }

    // Calculate minimum prices for different margins
    // Formula: sellingPrice = (productCost + fixedFees) / (1 - feeRate - marginRate)
    const fixedFees = SHIPPING_FEE + SERVICE_CHARGE;

    const calcMinPrice = (marginRate: number): number => {
      const denominator = 1 - feeRate - marginRate;
      if (denominator <= 0) return 999; // Invalid
      return (pCost + fixedFees) / denominator;
    };

    const minPrice10 = calcMinPrice(0.10);
    const minPrice15 = calcMinPrice(0.15);
    const minPrice19 = calcMinPrice(0.19);

    // Determine which minimum to use based on setting
    let activeMinPrice = minPrice10;
    if (minimumMargin === 15) activeMinPrice = minPrice15;
    if (minimumMargin === 19) activeMinPrice = minPrice19;

    // Determine proposed price
    let proposedPrice = competitivePrice;
    let priceSource: 'competitive' | 'minimum' = 'competitive';

    if (pCost > 0 && competitivePrice > 0) {
      if (competitivePrice < activeMinPrice) {
        proposedPrice = activeMinPrice;
        priceSource = 'minimum';
      }
    }

    // Calculate fees and profit based on proposed price
    const platformFee = proposedPrice * feeRate;
    const totalFees = platformFee + fixedFees;
    const netProfit = proposedPrice - pCost - totalFees;
    const marginPercent = proposedPrice > 0 ? (netProfit / proposedPrice) * 100 : 0;

    setMetrics({
      competitivePrice,
      platformFee,
      platformFeeRate: feeRate * 100,
      totalFees,
      netProfit,
      marginPercent,
      proposedPrice,
      priceSource,
      minPrice10,
      minPrice15,
      minPrice19
    });

    if (saveStatus !== 'idle') setSaveStatus('idle');

  }, [compPrice, compShipping, undercut, productCost, minimumMargin]);

  // --- FUNCTION: Clear Form ---
  const handleClear = () => {
    setSku('');
    setCompPrice('');
    setCompShipping('');
    setProductCost('');
    setSaveStatus('idle');
  };

  // --- FUNCTION: Save to Airtable (Price Schedule) ---
  const handleSaveToAirtable = async () => {
    if (!sku.trim()) {
      alert('Please enter a SKU');
      return;
    }

    if (!hasEnvConfig) {
      alert('Airtable not configured. Please set environment variables.');
      return;
    }

    setSaveStatus('saving');

    try {
      const response = await fetch('/api/repricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: sku.trim(),
          store,
          targetPrice: parseFloat(metrics.proposedPrice.toFixed(2)),
          currentPrice: parseFloat(productCost) || 0, // We'll update this logic later
          competitorPrice: (parseFloat(compPrice) || 0) + (parseFloat(compShipping) || 0),
          undercut: parseFloat(undercut) || 0,
          productCost: parseFloat(productCost) || 0,
          marginPercent: parseFloat(metrics.marginPercent.toFixed(1)),
          priceSource: metrics.priceSource
        })
      });

      const result = await response.json();

      if (response.ok) {
        setSaveStatus('success');
        setTimeout(() => {
          handleClear();
          setSaveStatus('idle');
        }, 2000);
      } else {
        console.error('Save error:', result);
        setSaveStatus('error');
        alert(`Failed to save: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Network error:', error);
      setSaveStatus('error');
    }
  };

  const formatMoney = (amount: number): string => {
    if (!isFinite(amount) || amount > 900) return '--.--';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const hasValidInputs = parseFloat(productCost) > 0 && metrics.competitivePrice > 0;
  const isProposedBelowCompetitive = metrics.priceSource === 'minimum';

  return (
    <div className="flex justify-center items-start min-h-screen bg-slate-50 p-2 font-sans text-slate-800">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl overflow-hidden border border-slate-200">

        {/* Header */}
        <div className="bg-emerald-700 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <Target size={18} />
            <h1 className="font-bold text-base tracking-wide">Repricing Calculator</h1>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleClear} className="text-emerald-200 hover:text-white transition-colors" title="Reset">
              <RotateCcw size={16} />
            </button>
            <button onClick={() => setShowSettings(!showSettings)} className={`transition-colors ${showSettings ? 'text-white' : 'text-emerald-200 hover:text-white'}`}>
              <Settings size={18} />
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="bg-slate-100 p-4 border-b border-slate-200">
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-3">Settings</h3>

            <div className="space-y-3">
              {/* Store Selection */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Store</label>
                <select
                  value={store}
                  onChange={(e) => setStore(e.target.value)}
                  className="w-full text-sm p-2 border border-slate-300 rounded-lg"
                >
                  <option value="WM19">WM19</option>
                  <option value="WM24">WM24</option>
                  <option value="WM33">WM33</option>
                </select>
              </div>

              {/* Minimum Margin Selection */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Minimum Margin</label>
                <div className="flex bg-white p-1 rounded-lg border border-slate-200">
                  {[10, 15, 19].map((m) => (
                    <button
                      key={m}
                      onClick={() => setMinimumMargin(m)}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                        minimumMargin === m
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      {m}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Config Status */}
              {hasEnvConfig ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-2 flex items-center gap-2 text-green-700 text-xs">
                  <CheckCircle size={14} />
                  <span>Airtable configured</span>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-center gap-2 text-amber-700 text-xs">
                  <AlertTriangle size={14} />
                  <span>Airtable not configured</span>
                </div>
              )}
            </div>

            <button onClick={() => setShowSettings(false)} className="w-full bg-slate-800 text-white text-xs py-2 rounded mt-3 hover:bg-slate-700 font-bold uppercase">
              Close Settings
            </button>
          </div>
        )}

        <div className="p-4 space-y-3">

          {/* SKU Input */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">SKU</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Tag size={16} />
              </div>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Enter SKU"
                className="block w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm font-mono bg-slate-50 shadow-sm"
              />
            </div>
          </div>

          {/* Competitor Benchmark */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Item Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                  <input
                    type="number"
                    value={compPrice}
                    onChange={(e) => setCompPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-6 pr-2 py-1.5 text-sm font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Shipping</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                  <input
                    type="number"
                    value={compShipping}
                    onChange={(e) => setCompShipping(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-6 pr-2 py-1.5 text-sm font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
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
                    type="number"
                    value={undercut}
                    onChange={(e) => setUndercut(e.target.value)}
                    placeholder="0"
                    className="w-full pl-6 pr-2 py-1.5 text-sm font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-red-500"
                  />
                </div>
              </div>
              <div className="pt-5 text-slate-300">
                <ArrowRight size={18} />
              </div>
              <div className="flex-grow">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Target Price</label>
                <div className="bg-white border-2 border-emerald-100 rounded-lg px-3 py-1.5 text-right font-bold text-emerald-600 text-lg shadow-sm">
                  {formatMoney(metrics.competitivePrice)}
                </div>
              </div>
            </div>

            {/* Fee Indicator */}
            {metrics.competitivePrice > 0 && (
              <div className={`mt-2 text-xs flex justify-center items-center gap-1.5 px-3 py-1 rounded-md border w-full font-medium ${
                metrics.platformFeeRate === 8
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-orange-50 text-orange-700 border-orange-200'
              }`}>
                {metrics.platformFeeRate === 8 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                <span>Platform Fee: <b>{metrics.platformFeeRate}%</b></span>
              </div>
            )}
          </div>

          {/* Product Cost */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Product Cost</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <DollarSign size={16} />
              </div>
              <input
                type="number"
                value={productCost}
                onChange={(e) => setProductCost(e.target.value)}
                placeholder="0.00"
                className="block w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm font-semibold shadow-sm"
              />
            </div>
          </div>

          {/* Margin Reference */}
          {hasValidInputs && (
            <div className="bg-slate-100 p-3 rounded-xl border border-slate-200">
              <div className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1">
                <Calculator size={12} />
                Margin Reference
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '10%', value: metrics.minPrice10, active: minimumMargin === 10 },
                  { label: '15%', value: metrics.minPrice15, active: minimumMargin === 15 },
                  { label: '19%', value: metrics.minPrice19, active: minimumMargin === 19 }
                ].map((item) => (
                  <div
                    key={item.label}
                    className={`text-center p-2 rounded-lg border ${
                      item.active
                        ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-200'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className={`text-xs font-bold ${item.active ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {item.label} min
                    </div>
                    <div className={`text-sm font-bold ${item.active ? 'text-emerald-800' : 'text-slate-600'}`}>
                      {formatMoney(item.value)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Cost Breakdown (Collapsible) */}
        <div className="bg-slate-50 border-t border-slate-100">
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="w-full px-5 py-2 flex items-center justify-between text-xs font-bold text-slate-500 uppercase hover:bg-slate-100 transition-colors"
          >
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
          {!hasValidInputs ? (
            <div className="bg-slate-100 text-slate-500 p-3 rounded-xl text-center text-sm font-medium flex items-center justify-center gap-2 border border-slate-200 border-dashed">
              <AlertCircle size={16} />
              <span>Enter competitor price & product cost</span>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Proposed Price Card */}
              <div className={`p-4 rounded-xl border-2 ${
                isProposedBelowCompetitive
                  ? 'bg-amber-50 border-amber-300'
                  : 'bg-emerald-50 border-emerald-300'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-bold text-slate-500 uppercase">Proposed Price</div>
                  <div className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    isProposedBelowCompetitive
                      ? 'bg-amber-200 text-amber-800'
                      : 'bg-emerald-200 text-emerald-800'
                  }`}>
                    {isProposedBelowCompetitive ? `${minimumMargin}% Minimum` : 'Competitive'}
                  </div>
                </div>
                <div className={`text-3xl font-bold ${
                  isProposedBelowCompetitive ? 'text-amber-700' : 'text-emerald-700'
                }`}>
                  {formatMoney(metrics.proposedPrice)}
                </div>
                {isProposedBelowCompetitive && (
                  <div className="mt-2 text-xs text-amber-700 flex items-center gap-1">
                    <AlertTriangle size={12} />
                    <span>Competitive price ({formatMoney(metrics.competitivePrice)}) below {minimumMargin}% margin</span>
                  </div>
                )}
              </div>

              {/* Margin & Profit Summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl border bg-white border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 font-medium mb-1 uppercase">Net Profit</div>
                  <div className={`text-xl font-bold ${metrics.netProfit < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                    {formatMoney(metrics.netProfit)}
                  </div>
                </div>
                <div className="p-3 rounded-xl border bg-white border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 font-medium mb-1 uppercase">Margin</div>
                  <div className={`text-xl font-bold ${
                    metrics.marginPercent < 10 ? 'text-red-600' :
                    metrics.marginPercent < 15 ? 'text-amber-600' : 'text-emerald-600'
                  }`}>
                    {metrics.marginPercent.toFixed(1)}%
                  </div>
                </div>
              </div>

              {/* Save Button */}
              {metrics.netProfit >= 0 && (
                <button
                  onClick={handleSaveToAirtable}
                  disabled={saveStatus === 'saving' || saveStatus === 'success' || !sku.trim()}
                  className={`w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg disabled:opacity-50 ${
                    saveStatus === 'success' ? 'bg-green-600' :
                    saveStatus === 'error' ? 'bg-red-600' :
                    'bg-gradient-to-r from-emerald-600 to-emerald-700'
                  }`}
                >
                  {saveStatus === 'saving' ? (
                    <><Loader className="animate-spin" size={18} /><span>Saving...</span></>
                  ) : saveStatus === 'success' ? (
                    <><CheckCircle size={18} /><span>Saved!</span></>
                  ) : (
                    <><Save size={18} /><span>Push to Price Schedule</span></>
                  )}
                </button>
              )}

              {metrics.netProfit < 0 && (
                <div className="bg-red-100 text-red-800 p-2.5 rounded-lg text-center text-sm font-bold flex items-center justify-center gap-2 border border-red-200">
                  <XCircle size={16} /> <span>LOSS - Cannot reprice</span>
                </div>
              )}

              {/* Store indicator */}
              {metrics.netProfit >= 0 && (
                <div className="text-xs text-slate-400 text-center">
                  Saving to <span className="font-bold text-emerald-600">{store}</span> Price Schedule
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RepricingCalculator;
