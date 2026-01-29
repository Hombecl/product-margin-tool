// ═══════════════════════════════════════════════════════════════════
// WALMART UPC SCRAPER v2.3 - Enhanced with Full __NEXT_DATA__ Parsing
// Uses ScrapingBee Walmart API with light_request=true + add_html=true
// Extracts: UPC, Availability, Low Stock, 3P Sellers, Popularity, Badges
// ═══════════════════════════════════════════════════════════════════
// v2.3 CHANGES (2026-01-29):
// - Added _3p suffix for 3P seller fields to avoid confusion
// - Added buyBoxSuppression, orderLimit, categoryPath
// - Removed isRollback (not needed)
// - Removed deliveryFee (not needed)
// - Simplified output fields
//
// v2.2 CHANGES (2026-01-28):
// - Enhanced shipping fee extraction (works for both Walmart and 3P sellers)
//
// v2.1 CHANGES (2026-01-28):
// - Enhanced __NEXT_DATA__ extraction with full badge parsing
// - Added secondaryOfferPrice (3P seller price)
// - Added transactableOfferCount (total sellers)
// ═══════════════════════════════════════════════════════════════════

const items = $input.all();

console.log('');
console.log('🛒═══════════════════════════════════════════════════════════════');
console.log('🛒 WALMART UPC SCRAPER v2.3 (Enhanced) - Starting...');
console.log('🛒═══════════════════════════════════════════════════════════════');
console.log(`🛒 Processing ${items.length} products`);
console.log('');

const API_KEY = 'B2WG302ZB85T4H1DF1HD11EUDDQIZY9ZFIUZK3JTEDB51F9KKYHPN6OCIHSXLMQV12XYELV1IQY7MJM7';

// ═══════════════════════════════════════════════════════════════════
// SHIPPING FEE PARSING HELPER
// ═══════════════════════════════════════════════════════════════════

// Parse shipping fee from API response shipping_information string
// Examples: ", Shipping, Arrives between Feb 6 - Feb 11, $3.99"
//           ", Shipping, Arrives tomorrow, Order within 4 hr 44 min" (free)
function parseShippingFeeFromInfo(shippingInfo) {
  if (!shippingInfo) return { shippingFee: null, isFreeShipping: false };

  // Look for price pattern like $X.XX
  const priceMatch = shippingInfo.match(/\$(\d+\.?\d*)/);
  if (priceMatch) {
    return {
      shippingFee: parseFloat(priceMatch[1]),
      isFreeShipping: false
    };
  }

  // Check for explicit "Free shipping" text
  if (shippingInfo.toLowerCase().includes('free shipping')) {
    return { shippingFee: 0, isFreeShipping: true };
  }

  // If shipping is available but no price mentioned, likely free
  if (shippingInfo.toLowerCase().includes('arrives')) {
    return { shippingFee: 0, isFreeShipping: true };
  }

  return { shippingFee: null, isFreeShipping: false };
}

// ═══════════════════════════════════════════════════════════════════
// HTML PARSING HELPERS
// ═══════════════════════════════════════════════════════════════════

// Extract __NEXT_DATA__ JSON from HTML - ENHANCED with full badge parsing
function extractNextData(html) {
  if (!html) return {};
  try {
    const match = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (match && match[1]) {
      const data = JSON.parse(match[1]);
      const product = data?.props?.pageProps?.initialData?.data?.product;
      if (product) {
        // Extract badges
        const badges = product.badges || {};
        const badgeFlags = badges.flags || [];
        const badgeGroups = badges.groups || [];

        // Find specific badge types (removed rollbackBadge - not needed)
        const socialProofBadge = badgeFlags.find(b => b.key === 'SOCIAL_PROOF_PURCHASES_FLAG');
        const customerPickBadge = badgeFlags.find(b => b.key === 'CUSTOMER_PICK');
        const bestSellerBadge = badgeFlags.find(b => b.key === 'BEST_SELLER');

        // Find LOW_INVENTORY badge group for exact stock level
        let lowInventoryText = '';
        let exactStockLevel = null;
        const urgencyGroup = badgeGroups.find(g => g.name === 'urgency');
        if (urgencyGroup) {
          const lowInventoryMember = urgencyGroup.members?.find(m => m.key === 'LOW_INVENTORY');
          if (lowInventoryMember && lowInventoryMember.badgeContent) {
            // Get most specific content (SHIPPING or DELIVERY usually has the number)
            for (const content of lowInventoryMember.badgeContent) {
              if (content.value) {
                const numMatch = content.value.match(/Only (\d+) left/i);
                if (numMatch) {
                  exactStockLevel = parseInt(numMatch[1]);
                  lowInventoryText = content.value;
                  break;
                }
                if (!lowInventoryText) {
                  lowInventoryText = content.value;
                }
              }
            }
          }
        }

        // Extract secondary offer price (3P seller price)
        const secondaryOfferPrice = product.secondaryOfferPrice?.currentPrice?.price ?? null;

        // Extract fulfillment shipping price (for current seller)
        let shippingPrice = null;
        const fulfillmentOptions = product.fulfillmentOptions || [];
        const shippingOption = fulfillmentOptions.find(o => o.type === 'SHIPPING');
        if (shippingOption?.speedDetails?.fulfillmentPrice?.price) {
          shippingPrice = shippingOption.speedDetails.fulfillmentPrice.price;
        }

        // Extract category path
        const categoryPath = product.category?.path?.map(c => c.name).join(' > ') || '';

        return {
          // Basic product info
          availabilityStatusFromNext: typeof product.availabilityStatus === 'string'
            ? product.availabilityStatus
            : product.availabilityStatus?.value || null,
          averageRating: product.averageRating ?? null,
          numberOfReviews: product.numberOfReviews ?? null,
          brand: product.brand || null,

          // New fields (v2.3)
          orderLimit: product.orderLimit ?? null,
          buyBoxSuppression: product.buyBoxSuppression ?? false,
          categoryPath: categoryPath,

          // 3P Competition (with _3p suffix for clarity)
          additionalOfferCount: product.additionalOfferCount ?? null,
          transactableOfferCount: product.transactableOfferCount ?? null,
          secondaryOfferPrice_3p: secondaryOfferPrice,  // renamed with _3p suffix
          sellerType: product.sellerType || null,  // 'INTERNAL' = Walmart, 'EXTERNAL' = 3P

          // Badges & Popularity (removed isRollback)
          purchaseBadge: socialProofBadge?.text || '',  // "1000+ bought since yesterday"
          customerPickBadge: customerPickBadge?.text || '',  // "Popular pick"
          isBestSeller: !!bestSellerBadge,

          // Low Stock from badge groups (more accurate than HTML regex)
          lowInventoryText: lowInventoryText,  // "Only 9 left" or "Low stock"
          exactStockLevel: exactStockLevel,  // 9 (parsed number)

          // Shipping (current seller's shipping fee)
          shippingPrice: shippingPrice
        };
      }
    }
  } catch (e) {
    // Silent fail - __NEXT_DATA__ may not always be available
    console.log('  ⚠️ Failed to parse __NEXT_DATA__');
  }
  return {};
}

// Fallback: Extract low stock message from HTML using regex
function extractLowStockInfoFromHtml(html) {
  if (!html) return { lowStockMessage: '', stockLevel: '' };

  const lowStockPatterns = [
    /Only (\d+) left/i,
    /(\d+) left in stock/i,
    /Low stock/i,
    /Limited stock/i,
    /Only a few left/i,
    /Last one/i
  ];

  for (const pattern of lowStockPatterns) {
    const match = html.match(pattern);
    if (match) {
      return {
        lowStockMessage: match[0],
        stockLevel: match[1] || ''
      };
    }
  }

  return { lowStockMessage: '', stockLevel: '' };
}

// Determine availability status
function determineAvailabilityStatus(apiData, sellerName, delivery, shipping) {
  const isThirdPartySeller = sellerName && !sellerName.toLowerCase().includes('walmart');
  const noAvailability = !delivery && !shipping;

  if (apiData.out_of_stock) {
    return { status: 'OUT_OF_STOCK', reason: 'Product marked out of stock' };
  }
  if (isThirdPartySeller) {
    return { status: 'THIRD_PARTY', reason: '3rd party seller: ' + sellerName };
  }
  if (noAvailability) {
    return { status: 'NO_FULFILLMENT', reason: 'No delivery/shipping available' };
  }
  return { status: 'IN_STOCK', reason: '' };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN SCRAPE FUNCTION
// ═══════════════════════════════════════════════════════════════════

async function scrapeProduct(item, index) {
  const recordId = item.json.id;
  const wmProductId = item.json.fields?.['WM Product ID'] || item.json['WM Product ID'] || '';
  const sku = item.json.fields?.SKU || item.json.SKU || '';
  const wmUploadStatus = item.json.fields?.['WM Upload Status'] || item.json['WM Upload Status'] || '';
  const wmWpid = item.json.fields?.['WM WPID'] || item.json['WM WPID'] || '';
  const existingTitle = item.json.fields?.['Title'] || item.json['Title'] || '';
  const internalSku = item.json.fields?.['Internal_SKU'] || item.json['Internal_SKU'] || '';

  console.log(`[${index + 1}/${items.length}] Scraping: ${sku} - Product ID: ${wmProductId}`);

  // Default result for skipped/failed items
  const defaultResult = {
    recordId, sku, internalSku, wmProductId, wmUploadStatus, wmWpid, existingTitle,
    success: false, upcFound: false, error: '', productId: '', productIdType: '',
    title: existingTitle, productCost: null, sellerName: '',
    // Enhanced fields
    availabilityStatus: 'ERROR',
    availabilityReason: '',
    deliveryAvailable: false,
    shippingAvailable: false,
    // Low stock
    lowStockMessage: '',
    stockLevel: '',
    exactStockLevel: null,
    // 3P Competition (with _3p suffix)
    additionalOfferCount: null,
    transactableOfferCount: null,
    price_3p: null,           // renamed from secondaryOfferPrice
    shippingFee_3p: null,     // 3P seller's shipping fee
    totalPrice_3p: null,      // 3P total (price + shipping)
    is3PSeller: false,
    sellerType: '',
    // Popularity & Badges (removed isRollback)
    purchaseBadge: '',
    customerPickBadge: '',
    isBestSeller: false,
    // Product quality
    averageRating: null,
    numberOfReviews: null,
    brand: '',
    // New fields (v2.3)
    orderLimit: null,
    buyBoxSuppression: false,
    categoryPath: '',
    // Current seller pricing
    currentPrice: null,
    shippingFee: null,
    totalPriceWithShipping: null
  };

  // Skip if no product ID
  if (!wmProductId) {
    console.log(`  ⚠️ Skipped - No WM Product ID`);
    return { ...defaultResult, error: 'No WM Product ID' };
  }

  try {
    // API URL with light_request=true + add_html=true (maintains low credit cost ~5-10)
    const url = `https://app.scrapingbee.com/api/v1/walmart/product?api_key=${API_KEY}&product_id=${wmProductId}&light_request=true&device=desktop&delivery_zip=77057&add_html=true`;

    const response = await this.helpers.httpRequest({
      method: 'GET',
      url: url,
      returnFullResponse: true,
      simple: false,
      timeout: 25000
    });

    const statusCode = response.statusCode;

    if (statusCode !== 200) {
      console.log(`  ❌ HTTP ${statusCode}`);
      return { ...defaultResult, error: `HTTP ${statusCode}` };
    }

    const data = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
    const html = data.html || '';

    // ═══════════════════════════════════════════════════════════════
    // Extract UPC/GTIN (original logic)
    // ═══════════════════════════════════════════════════════════════
    const rawId = data.gtin || data.upc || data.manufacturerProductId || '';

    let productId = '';
    let productIdType = '';

    if (rawId) {
      productId = String(rawId).replace(/\D/g, '');
      if (productId.length === 12) {
        productIdType = 'UPC';
      } else if (productId.length === 13) {
        productIdType = 'EAN';
      } else if (productId.length === 14) {
        productIdType = 'GTIN';
      } else if (productId.length < 12) {
        productId = productId.padStart(12, '0');
        productIdType = 'UPC';
      } else {
        productIdType = 'GTIN';
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // Extract Basic Fields from API
    // ═══════════════════════════════════════════════════════════════
    const scrapedTitle = data.title || data.name || '';
    const title = scrapedTitle || existingTitle;
    const sellerName = data.seller_name || data.sellerName || '';
    const isWalmartSeller = sellerName.toLowerCase().includes('walmart');

    // Price - only if Walmart seller
    let productCost = null;
    if (isWalmartSeller) {
      productCost = data.price || data.priceInfo?.currentPrice?.price || null;
    }

    // Fulfillment from API
    const delivery = data.fulfillment?.delivery || false;
    const shipping = data.fulfillment?.shipping || false;
    const freeShippingApi = data.fulfillment?.free_shipping || false;

    // Parse shipping fee from API response
    const shippingInfoText = data.fulfillment?.shipping_information || '';
    const { shippingFee: apiShippingFee, isFreeShipping: apiIsFreeShipping } = parseShippingFeeFromInfo(shippingInfoText);

    // ═══════════════════════════════════════════════════════════════
    // Parse __NEXT_DATA__ for enhanced data
    // ═══════════════════════════════════════════════════════════════
    const nextData = extractNextData(html);

    // Low stock: prefer __NEXT_DATA__ badge, fallback to HTML regex
    let lowStockMessage = nextData.lowInventoryText || '';
    let stockLevel = '';
    let exactStockLevel = nextData.exactStockLevel;

    if (!lowStockMessage) {
      const htmlLowStock = extractLowStockInfoFromHtml(html);
      lowStockMessage = htmlLowStock.lowStockMessage;
      stockLevel = htmlLowStock.stockLevel;
      if (stockLevel) {
        exactStockLevel = parseInt(stockLevel) || null;
      }
    }

    // Determine availability status
    const { status: availabilityStatus, reason: availabilityReason } = determineAvailabilityStatus(data, sellerName, delivery, shipping);

    // UPC found status
    const upcFound = productId && productId.length >= 12;

    // Log result with rich info
    const statusEmoji = availabilityStatus === 'IN_STOCK' ? '✅' : (availabilityStatus === 'THIRD_PARTY' ? '⚠️' : '❌');
    const badges = [
      nextData.purchaseBadge ? `📈${nextData.purchaseBadge.substring(0, 20)}` : '',
      nextData.customerPickBadge ? '🏆Popular' : '',
      nextData.isRollback ? '💰Rollback' : '',
      lowStockMessage ? `⚠️${lowStockMessage}` : '',
      nextData.additionalOfferCount ? `👥${nextData.additionalOfferCount}3P` : ''
    ].filter(Boolean).join(' ');

    console.log(`  ${statusEmoji} ${productIdType}: ${productId || 'N/A'} | ${availabilityStatus}${badges ? ' | ' + badges : ''}`);

    // Determine shipping fee - prefer __NEXT_DATA__, fallback to API parsing
    // For current seller (could be Walmart or 3P)
    let shippingFee = nextData.shippingPrice ?? apiShippingFee;

    // Calculate total price (product + shipping) for competitiveness analysis
    const currentPrice = data.price || data.priceInfo?.currentPrice?.price || null;
    const totalPriceWithShipping = (currentPrice && shippingFee !== null)
      ? currentPrice + (shippingFee || 0)
      : currentPrice;

    // 3P seller pricing (with _3p suffix for clarity)
    // Note: secondaryOfferPrice_3p is the 3P competitor's product price only
    // We don't have their shipping fee, so totalPrice_3p = price_3p (estimate)
    const price_3p = nextData.secondaryOfferPrice_3p;
    const shippingFee_3p = null;  // Not available in API
    const totalPrice_3p = price_3p;  // Best estimate without shipping

    return {
      recordId, sku, internalSku, wmProductId, wmUploadStatus, wmWpid, existingTitle,
      success: true,
      upcFound,
      productId,
      productIdType,
      title,
      productCost,
      sellerName,
      // Enhanced fields
      availabilityStatus,
      availabilityReason,
      deliveryAvailable: delivery,
      shippingAvailable: shipping,
      // Low stock
      lowStockMessage,
      stockLevel: stockLevel || (exactStockLevel ? String(exactStockLevel) : ''),
      exactStockLevel,
      // 3P Competition (with _3p suffix)
      additionalOfferCount: nextData.additionalOfferCount,
      transactableOfferCount: nextData.transactableOfferCount,
      price_3p: price_3p,
      shippingFee_3p: shippingFee_3p,
      totalPrice_3p: totalPrice_3p,
      is3PSeller: !isWalmartSeller && sellerName !== '',
      sellerType: nextData.sellerType || (isWalmartSeller ? 'INTERNAL' : 'EXTERNAL'),
      // Popularity & Badges (removed isRollback)
      purchaseBadge: nextData.purchaseBadge || '',
      customerPickBadge: nextData.customerPickBadge || '',
      isBestSeller: nextData.isBestSeller || false,
      // Product quality
      averageRating: nextData.averageRating,
      numberOfReviews: nextData.numberOfReviews,
      brand: nextData.brand || '',
      // New fields (v2.3)
      orderLimit: nextData.orderLimit,
      buyBoxSuppression: nextData.buyBoxSuppression || false,
      categoryPath: nextData.categoryPath || '',
      // Current seller pricing
      currentPrice: currentPrice,
      shippingFee: shippingFee,
      totalPriceWithShipping: totalPriceWithShipping
    };

  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return { ...defaultResult, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════
// PARALLEL PROCESSING WITH STAGGERED START
// ═══════════════════════════════════════════════════════════════════

const results = [];

for (let i = 0; i < items.length; i++) {
  const promise = scrapeProduct.call(this, items[i], i);
  results.push(promise);

  // Stagger requests by 100ms to avoid rate limiting
  if (i < items.length - 1) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

const completedResults = await Promise.all(results);

// ═══════════════════════════════════════════════════════════════════
// STATISTICS
// ═══════════════════════════════════════════════════════════════════

const apiSuccess = completedResults.filter(r => r.success).length;
const apiFailed = completedResults.filter(r => !r.success).length;
const withUPC = completedResults.filter(r => r.upcFound).length;
const inStockCount = completedResults.filter(r => r.availabilityStatus === 'IN_STOCK').length;
const oosCount = completedResults.filter(r => r.availabilityStatus === 'OUT_OF_STOCK').length;
const thirdPartyCount = completedResults.filter(r => r.availabilityStatus === 'THIRD_PARTY').length;
const noFulfillmentCount = completedResults.filter(r => r.availabilityStatus === 'NO_FULFILLMENT').length;
const withLowStock = completedResults.filter(r => r.lowStockMessage).length;
const with3POffers = completedResults.filter(r => r.additionalOfferCount > 0).length;
const withPurchaseBadge = completedResults.filter(r => r.purchaseBadge).length;
const withPopularPick = completedResults.filter(r => r.customerPickBadge).length;

console.log('');
console.log('🛒═══════════════════════════════════════════════════════════════');
console.log('🛒 WALMART UPC SCRAPER v2.3 COMPLETE');
console.log('🛒═══════════════════════════════════════════════════════════════');
console.log(`📊 Total: ${items.length} | Success: ${apiSuccess} | Failed: ${apiFailed}`);
console.log(`🏷️  UPC Found: ${withUPC}`);
console.log(`📦 Status: IN_STOCK=${inStockCount} | OOS=${oosCount} | 3P=${thirdPartyCount} | No Fulfill=${noFulfillmentCount}`);
console.log(`⚠️  Low Stock: ${withLowStock} | With 3P Competition: ${with3POffers}`);
console.log(`📈 Purchase Badges: ${withPurchaseBadge} | Popular Picks: ${withPopularPick}`);
console.log('🛒═══════════════════════════════════════════════════════════════');

// Return ALL results - both success and failed
return completedResults.map(r => ({ json: r }));
