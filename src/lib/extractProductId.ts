/**
 * Extract Product ID from supplier URLs
 * Handles Walmart Product IDs and Amazon ASINs
 * Strips tracking parameters and extracts core identifier
 */

export interface ProductIdResult {
  platform: 'walmart' | 'amazon' | 'unknown';
  productId: string | null;
  originalUrl: string;
}

export function extractProductId(url: string): ProductIdResult {
  const result: ProductIdResult = {
    platform: 'unknown',
    productId: null,
    originalUrl: url
  };

  if (!url || typeof url !== 'string') {
    return result;
  }

  const normalizedUrl = url.toLowerCase().trim();

  // Walmart URL patterns:
  // https://www.walmart.com/ip/Product-Name/123456789
  // https://www.walmart.com/ip/123456789
  // https://walmart.com/ip/Product-Name/123456789?tracking=xxx
  if (normalizedUrl.includes('walmart.com')) {
    result.platform = 'walmart';

    // Match /ip/ followed by optional product name and then the numeric ID
    // The ID is always the last numeric segment before any query params
    const walmartMatch = url.match(/\/ip\/(?:[^\/]+\/)?(\d{6,15})(?:\?|$|\/)/i);
    if (walmartMatch && walmartMatch[1]) {
      result.productId = walmartMatch[1];
    } else {
      // Alternative: try to find any long numeric sequence in the URL path
      const numericMatch = url.match(/\/(\d{6,15})(?:\?|$|\/)/);
      if (numericMatch && numericMatch[1]) {
        result.productId = numericMatch[1];
      }
    }

    return result;
  }

  // Amazon URL patterns:
  // https://www.amazon.com/dp/B01ABC1234
  // https://www.amazon.com/gp/product/B01ABC1234
  // https://www.amazon.com/Product-Name/dp/B01ABC1234/ref=xxx
  // https://amazon.com/dp/B01ABC1234?tracking=xxx
  if (normalizedUrl.includes('amazon.com') || normalizedUrl.includes('amzn.')) {
    result.platform = 'amazon';

    // ASIN pattern: 10 characters starting with B0 (most common) or just 10 alphanumeric
    // Match /dp/ASIN or /gp/product/ASIN
    const asinMatch = url.match(/(?:\/dp\/|\/gp\/product\/|\/product\/)([A-Z0-9]{10})(?:\/|\?|$)/i);
    if (asinMatch && asinMatch[1]) {
      result.productId = asinMatch[1].toUpperCase();
    }

    return result;
  }

  return result;
}

/**
 * Build Airtable formula to search for existing product
 */
export function buildDuplicateCheckFormula(productId: string, fieldName: string = 'Product ID'): string {
  // Escape single quotes in the product ID
  const escapedId = productId.replace(/'/g, "\\'");
  return `{${fieldName}} = '${escapedId}'`;
}
