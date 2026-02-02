// ═══════════════════════════════════════════════════════════════════
// WALMART SELLER SCRAPER - Content Script
// Extracts seller data from Walmart product pages
// ═══════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // Store captured modal seller data
  let capturedModalSellers = [];
  let modalObserver = null;

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
        totalPrice: s.totalPrice != null ? s.totalPrice : (s.price != null ? s.price + (s.shippingPrice || 0) : null)
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
  // EXTRACT SELLERS FROM "COMPARE ALL SELLERS" MODAL
  // ═══════════════════════════════════════════════════════════════════

  function extractSellersFromModal(modalElement) {
    const sellers = [];

    // Multiple selector strategies for Walmart's modal
    // Strategy 1: Look for offer rows/cards in the modal
    const modalSelectors = [
      // Common modal container selectors
      '[data-testid="allSellersModal"] [data-testid*="offer"]',
      '[data-testid="compare-sellers-modal"] [data-testid*="offer"]',
      '[class*="AllSellers"] [class*="offer"]',
      '[class*="SellerList"] [class*="item"]',
      '[class*="seller-modal"] [class*="seller"]',
      // Generic offer containers
      '[data-testid*="seller-offer"]',
      '[class*="OfferCard"]',
      '[class*="offer-card"]',
      // Rows in seller comparison
      '[class*="seller-row"]',
      '[class*="SellerRow"]'
    ];

    let offerElements = [];

    // First try with modal context
    if (modalElement) {
      for (const selector of modalSelectors) {
        const elements = modalElement.querySelectorAll(selector);
        if (elements.length > 0) {
          offerElements = Array.from(elements);
          console.log(`[WM Scraper] Found ${elements.length} offers with selector: ${selector}`);
          break;
        }
      }
    }

    // Fallback: Search entire document for seller offer patterns
    if (offerElements.length === 0) {
      // Look for typical seller offer patterns in the whole document
      const fallbackSelectors = [
        '[data-testid*="seller"]',
        '[class*="seller"][class*="offer"]',
        '[class*="Seller"][class*="Card"]'
      ];

      for (const selector of fallbackSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 1) { // Need multiple sellers
          offerElements = Array.from(elements);
          console.log(`[WM Scraper] Fallback found ${elements.length} with: ${selector}`);
          break;
        }
      }
    }

    // Parse each offer element
    offerElements.forEach((el, index) => {
      const seller = parseSellerElement(el, index);
      if (seller && seller.price !== null) {
        sellers.push(seller);
      }
    });

    // Sort by total price
    sellers.sort((a, b) => (a.totalPrice || 999) - (b.totalPrice || 999));

    // Mark first as buy box
    if (sellers.length > 0) {
      sellers[0].isBuyBox = true;
    }

    console.log('[WM Scraper] Extracted modal sellers:', sellers);
    return sellers;
  }

  function parseSellerElement(el, index) {
    const seller = {
      sellerName: 'Unknown Seller',
      sellerType: 'EXTERNAL',
      price: null,
      shippingPrice: 0,
      totalPrice: null,
      source: 'MODAL',
      isBuyBox: false
    };

    // Extract seller name - multiple strategies
    const nameSelectors = [
      '[data-testid*="seller-name"]',
      '[data-testid*="sellerName"]',
      '[class*="seller-name"]',
      '[class*="sellerName"]',
      '[class*="SellerName"]',
      'a[href*="/seller/"]',
      '[class*="sold-by"] a',
      '[class*="SoldBy"]'
    ];

    for (const sel of nameSelectors) {
      const nameEl = el.querySelector(sel);
      if (nameEl && nameEl.textContent.trim()) {
        seller.sellerName = nameEl.textContent.trim();
        // Check if it's Walmart
        if (seller.sellerName.toLowerCase().includes('walmart')) {
          seller.sellerType = 'INTERNAL';
        }
        break;
      }
    }

    // Extract item price
    const priceSelectors = [
      '[data-testid*="price"]',
      '[class*="price-current"]',
      '[class*="Price"]',
      '[class*="price"]',
      'span[class*="Price"]'
    ];

    for (const sel of priceSelectors) {
      const priceEls = el.querySelectorAll(sel);
      for (const priceEl of priceEls) {
        const text = priceEl.textContent || '';
        // Match price pattern: $XX.XX or $X,XXX.XX
        const match = text.match(/\$\s*([\d,]+\.?\d*)/);
        if (match) {
          const price = parseFloat(match[1].replace(/,/g, ''));
          if (!isNaN(price) && price > 0) {
            // First valid price is usually item price
            if (seller.price === null) {
              seller.price = price;
            }
          }
        }
      }
      if (seller.price !== null) break;
    }

    // Extract shipping price
    const shippingSelectors = [
      '[class*="shipping"]',
      '[class*="Shipping"]',
      '[class*="delivery"]',
      '[class*="Delivery"]',
      '[data-testid*="shipping"]',
      '[data-testid*="delivery"]'
    ];

    for (const sel of shippingSelectors) {
      const shipEl = el.querySelector(sel);
      if (shipEl) {
        const text = shipEl.textContent || '';
        // Check for free shipping
        if (text.toLowerCase().includes('free')) {
          seller.shippingPrice = 0;
          break;
        }
        // Extract shipping cost
        const match = text.match(/\$\s*([\d,]+\.?\d*)/);
        if (match) {
          seller.shippingPrice = parseFloat(match[1].replace(/,/g, ''));
          break;
        }
      }
    }

    // Calculate total price
    if (seller.price !== null) {
      seller.totalPrice = seller.price + (seller.shippingPrice || 0);
    }

    return seller;
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
  // MODAL DETECTION - Watch for "Compare All Sellers" modal
  // ═══════════════════════════════════════════════════════════════════

  function setupModalObserver() {
    if (modalObserver) {
      modalObserver.disconnect();
    }

    modalObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Check added nodes for modal
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            checkForSellerModal(node);
          }
        }
      }
    });

    modalObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log('[WM Scraper] Modal observer started');
  }

  function checkForSellerModal(element) {
    // Selectors that indicate a seller comparison modal
    const modalIndicators = [
      '[data-testid="allSellersModal"]',
      '[data-testid="compare-sellers-modal"]',
      '[class*="AllSellers"]',
      '[class*="all-sellers"]',
      '[class*="SellerModal"]',
      '[class*="seller-modal"]',
      '[aria-label*="seller"]',
      '[aria-label*="Seller"]'
    ];

    let modal = null;

    // Check if element itself is a modal
    for (const selector of modalIndicators) {
      if (element.matches && element.matches(selector)) {
        modal = element;
        break;
      }
      // Check if element contains a modal
      const found = element.querySelector ? element.querySelector(selector) : null;
      if (found) {
        modal = found;
        break;
      }
    }

    // Also check for generic modal with seller-related content
    if (!modal) {
      const genericModalSelectors = [
        '[role="dialog"]',
        '[class*="Modal"]',
        '[class*="modal"]',
        '[class*="Drawer"]',
        '[class*="drawer"]'
      ];

      for (const selector of genericModalSelectors) {
        let candidate = null;
        if (element.matches && element.matches(selector)) {
          candidate = element;
        } else if (element.querySelector) {
          candidate = element.querySelector(selector);
        }

        if (candidate) {
          // Check if this modal contains seller-related text
          const text = candidate.textContent || '';
          if (text.includes('Compare all sellers') ||
              text.includes('All sellers') ||
              text.includes('More sellers') ||
              text.includes('seller') && text.includes('price')) {
            modal = candidate;
            break;
          }
        }
      }
    }

    if (modal) {
      console.log('[WM Scraper] Seller modal detected!');

      // Small delay to ensure modal content is loaded
      setTimeout(() => {
        const sellers = extractSellersFromModal(modal);
        if (sellers.length > 0) {
          capturedModalSellers = sellers;
          console.log('[WM Scraper] Captured', sellers.length, 'sellers from modal');

          // Store in window for popup access
          window.__wmModalSellers = sellers;

          // Notify popup via storage
          try {
            chrome.storage.local.set({
              modalSellers: sellers,
              modalCapturedAt: new Date().toISOString()
            });
          } catch (e) {
            console.log('[WM Scraper] Could not save to storage:', e);
          }
        }
      }, 500);
    }
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
        productData.domSellers = domSellers;
      }

      // Include captured modal sellers (most accurate)
      if (capturedModalSellers.length > 0 && productData) {
        // Modal sellers override default sellers
        productData.sellers = capturedModalSellers;
        productData.sellersSource = 'MODAL';
        console.log('[WM Scraper] Using', capturedModalSellers.length, 'modal sellers');
      }

      // Also check storage for any previously captured modal data
      chrome.storage.local.get(['modalSellers', 'modalCapturedAt'], (stored) => {
        if (stored.modalSellers && stored.modalSellers.length > 0 && productData) {
          // Use stored modal sellers if we don't have fresher data
          if (capturedModalSellers.length === 0) {
            productData.sellers = stored.modalSellers;
            productData.sellersSource = 'STORAGE';
            productData.sellersCapturedAt = stored.modalCapturedAt;
          }
        }
        sendResponse({ success: !!productData, data: productData });
      });

      return true; // Keep channel open for async response
    }

    if (request.action === 'clearModalData') {
      capturedModalSellers = [];
      chrome.storage.local.remove(['modalSellers', 'modalCapturedAt']);
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'getModalSellers') {
      sendResponse({
        success: capturedModalSellers.length > 0,
        sellers: capturedModalSellers
      });
      return true;
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

  // Start watching for seller modal
  setupModalObserver();

  // Clear old modal data on new page load
  capturedModalSellers = [];
  chrome.storage.local.remove(['modalSellers', 'modalCapturedAt']);

  console.log('[WM Scraper] Content script loaded with modal observer');

})();
