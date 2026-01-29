// ═══════════════════════════════════════════════════════════════════
// WALMART SELLER SCRAPER - Content Script
// Extracts seller data from Walmart product pages
// ═══════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  // EXTRACT DATA FROM __NEXT_DATA__
  // ═══════════════════════════════════════════════════════════════════

  function extractProductData() {
    try {
      const scriptEl = document.getElementById('__NEXT_DATA__');
      if (!scriptEl) {
        console.log('[WM Scraper] __NEXT_DATA__ not found');
        return null;
      }

      const data = JSON.parse(scriptEl.textContent);
      const product = data?.props?.pageProps?.initialData?.data?.product;

      if (!product) {
        console.log('[WM Scraper] Product data not found in __NEXT_DATA__');
        return null;
      }

      // Extract product ID from URL
      const urlMatch = window.location.pathname.match(/\/ip\/[^/]+\/(\d+)/);
      const productId = urlMatch ? urlMatch[1] : product.usItemId || '';

      // Basic product info
      const result = {
        productId: productId,
        title: product.name || '',
        brand: product.brand || '',
        upc: product.upc || product.gtin13 || '',

        // Current buy box price
        currentPrice: product.priceInfo?.currentPrice?.price || null,

        // Seller info
        sellerName: product.sellerName || '',
        sellerType: product.sellerType || '', // INTERNAL = Walmart, EXTERNAL = 3P

        // Competition counts
        transactableOfferCount: product.transactableOfferCount || 0,
        additionalOfferCount: product.additionalOfferCount || 0,

        // 3P seller price (second offer)
        secondaryOfferPrice: product.secondaryOfferPrice?.currentPrice?.price || null,

        // All sellers (if available)
        sellers: [],

        // Fulfillment
        fulfillmentOptions: [],

        // Ratings
        averageRating: product.averageRating || null,
        numberOfReviews: product.numberOfReviews || 0,

        // Flags
        buyBoxSuppression: product.buyBoxSuppression || false,
        orderLimit: product.orderLimit || null,

        // Extracted timestamp
        extractedAt: new Date().toISOString()
      };

      // Extract fulfillment options with shipping prices
      if (product.fulfillmentOptions) {
        result.fulfillmentOptions = product.fulfillmentOptions.map(opt => ({
          type: opt.type,
          available: opt.available,
          price: opt.speedDetails?.fulfillmentPrice?.price || 0,
          arrivalDate: opt.speedDetails?.arrivalDate || ''
        }));
      }

      // Try to extract all seller offers from different data paths
      // Path 1: allOffers array (sometimes available)
      if (product.allOffers && Array.isArray(product.allOffers)) {
        result.sellers = product.allOffers.map(offer => ({
          sellerName: offer.sellerName || 'Unknown',
          sellerType: offer.sellerType || '',
          price: offer.priceInfo?.currentPrice?.price || offer.price || null,
          shippingPrice: offer.shippingPrice || null,
          totalPrice: null, // Will calculate
          fulfillmentType: offer.fulfillmentType || '',
          available: offer.available !== false
        }));
      }

      // Path 2: If allOffers not available, construct from primary + secondary
      if (result.sellers.length === 0) {
        // Primary seller (buy box winner)
        if (result.currentPrice) {
          const shippingOpt = result.fulfillmentOptions.find(o => o.type === 'SHIPPING');
          result.sellers.push({
            sellerName: result.sellerName || 'Walmart',
            sellerType: result.sellerType,
            price: result.currentPrice,
            shippingPrice: shippingOpt?.price || 0,
            totalPrice: result.currentPrice + (shippingOpt?.price || 0),
            fulfillmentType: 'BUY_BOX',
            available: true,
            isBuyBox: true
          });
        }

        // Secondary seller (if exists)
        if (result.secondaryOfferPrice) {
          result.sellers.push({
            sellerName: '3P Seller',
            sellerType: 'EXTERNAL',
            price: result.secondaryOfferPrice,
            shippingPrice: null, // Not available in light request
            totalPrice: result.secondaryOfferPrice, // Estimate
            fulfillmentType: 'SECONDARY',
            available: true,
            isBuyBox: false
          });
        }
      }

      // Calculate total prices if not set
      result.sellers = result.sellers.map(s => ({
        ...s,
        totalPrice: s.totalPrice || (s.price + (s.shippingPrice || 0))
      }));

      // Sort sellers by total price
      result.sellers.sort((a, b) => (a.totalPrice || 999) - (b.totalPrice || 999));

      console.log('[WM Scraper] Extracted product data:', result);
      return result;

    } catch (error) {
      console.error('[WM Scraper] Error extracting data:', error);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // PARSE "COMPARE ALL SELLERS" PAGE (if user clicks through)
  // ═══════════════════════════════════════════════════════════════════

  function extractSellersFromDOM() {
    const sellers = [];

    // Try to find seller cards in the DOM
    // Walmart uses various class names, so we try multiple selectors
    const sellerSelectors = [
      '[data-testid="seller-card"]',
      '.seller-card',
      '[class*="SellerCard"]',
      '[class*="seller-offer"]'
    ];

    for (const selector of sellerSelectors) {
      const cards = document.querySelectorAll(selector);
      if (cards.length > 0) {
        cards.forEach(card => {
          // Try to extract price
          const priceEl = card.querySelector('[class*="price"], [data-testid="price"]');
          const priceText = priceEl?.textContent || '';
          const priceMatch = priceText.match(/\$?([\d,]+\.?\d*)/);
          const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '')) : null;

          // Try to extract seller name
          const sellerEl = card.querySelector('[class*="seller-name"], [data-testid="seller-name"]');
          const sellerName = sellerEl?.textContent?.trim() || 'Unknown Seller';

          // Try to extract shipping
          const shippingEl = card.querySelector('[class*="shipping"], [class*="delivery"]');
          const shippingText = shippingEl?.textContent || '';
          const shippingMatch = shippingText.match(/\$?([\d,]+\.?\d*)/);
          const shippingPrice = shippingMatch ? parseFloat(shippingMatch[1].replace(',', '')) : 0;

          if (price) {
            sellers.push({
              sellerName,
              price,
              shippingPrice,
              totalPrice: price + shippingPrice,
              source: 'DOM'
            });
          }
        });
        break;
      }
    }

    return sellers;
  }

  // ═══════════════════════════════════════════════════════════════════
  // MESSAGE HANDLER - Respond to popup requests
  // ═══════════════════════════════════════════════════════════════════

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractData') {
      const productData = extractProductData();

      // Also try DOM extraction as supplement
      const domSellers = extractSellersFromDOM();
      if (domSellers.length > 0 && productData) {
        // Merge DOM sellers if they provide new info
        productData.domSellers = domSellers;
      }

      sendResponse({ success: !!productData, data: productData });
    }

    return true; // Keep message channel open for async response
  });

  // ═══════════════════════════════════════════════════════════════════
  // AUTO-EXTRACT ON PAGE LOAD
  // ═══════════════════════════════════════════════════════════════════

  // Store data in window for quick access
  const productData = extractProductData();
  if (productData) {
    window.__wmSellerData = productData;

    // Dispatch custom event for any listeners
    window.dispatchEvent(new CustomEvent('wmSellerDataReady', {
      detail: productData
    }));
  }

  console.log('[WM Scraper] Content script loaded');

})();
