import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;
const AIRTABLE_TOKEN = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = 'appRCQASsApV4C33N';
const SCRAPE_LOG_TABLE_ID = 'tbl1Csm5TFd7O3Prw';

// Credits estimation
const CREDITS_PER_SEARCH = 10;

interface WalmartProduct {
  id: string;
  title: string;
  price: number;
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

// Default ZIP code for Houston area
const DEFAULT_DELIVERY_ZIP = '77057';

interface SearchResult {
  products: WalmartProduct[];
  totalResults: number;
  creditsUsed: number;
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
}

const AIRTABLE_PRODUCT_TABLE_ID = 'tblo1uuy8Nc9CSjX4';

// Check existing products in Airtable
async function checkExistingProducts(productIds: string[]): Promise<Set<string>> {
  if (!AIRTABLE_TOKEN || productIds.length === 0) return new Set();

  const existingIds = new Set<string>();

  // Build formula to check multiple IDs
  const idChecks = productIds.map(id => `{WM Product ID} = '${id}'`).join(', ');
  const formula = `OR(${idChecks})`;

  try {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_PRODUCT_TABLE_ID}`);
    url.searchParams.set('filterByFormula', formula);
    url.searchParams.set('fields[]', 'WM Product ID');

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      for (const record of data.records || []) {
        const wmProductId = record.fields['WM Product ID'];
        if (wmProductId) {
          existingIds.add(wmProductId);
        }
      }
    }
  } catch (error) {
    console.error('Error checking existing products:', error);
  }

  return existingIds;
}

async function logScrape(data: {
  action: string;
  query: string;
  resultsCount: number;
  creditsUsed: number;
  operator: string;
  store: string;
  productsAdded: number;
  sessionId: string;
}) {
  if (!AIRTABLE_TOKEN) return;

  try {
    await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${SCRAPE_LOG_TABLE_ID}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        records: [{
          fields: {
            'Timestamp': new Date().toISOString(),
            'Action': data.action,
            'Query': data.query,
            'Results Count': data.resultsCount,
            'Credits Used': data.creditsUsed,
            'Operator': data.operator,
            'Store': data.store,
            'Products Added': data.productsAdded,
            'Session ID': data.sessionId
          }
        }]
      })
    });
  } catch (error) {
    console.error('Failed to log scrape:', error);
  }
}

export async function POST(request: NextRequest) {
  // Check authentication
  const cookieStore = await cookies();
  const authCookie = cookieStore.get('profit-scout-auth');
  if (!authCookie) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!SCRAPINGBEE_API_KEY) {
    return NextResponse.json({ error: 'ScrapingBee API key not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const {
      query,
      maxPrice = 40,
      minRating = 0,
      store = 'WM19',
      operator = 'Unknown',
      sessionId = '',
      sortBy = 'best_seller',  // 'best_match', 'best_seller', 'price_low', 'price_high'
      deliveryZip = DEFAULT_DELIVERY_ZIP,
      page = 1,  // Page number for pagination (1-indexed)
      checkDuplicates = true,  // Whether to check Airtable for existing products
      // Custom pricing settings
      additionalCost = 4.50,
      targetMarginPercent = 15,
      platformFeePercent = 10.5
    } = body;

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // Call ScrapingBee Walmart Search API
    // Endpoint: https://app.scrapingbee.com/api/v1/walmart/search
    const searchUrl = new URL('https://app.scrapingbee.com/api/v1/walmart/search');
    searchUrl.searchParams.set('api_key', SCRAPINGBEE_API_KEY);
    searchUrl.searchParams.set('query', query);
    searchUrl.searchParams.set('delivery_zip', deliveryZip);
    searchUrl.searchParams.set('sort_by', sortBy);

    // Add page parameter for pagination
    if (page > 1) {
      searchUrl.searchParams.set('page', String(page));
    }

    const response = await fetch(searchUrl.toString());

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ScrapingBee error:', errorText);
      return NextResponse.json({ error: 'Failed to fetch from Walmart' }, { status: 500 });
    }

    const data = await response.json();
    const allProducts: WalmartProduct[] = data.products || [];

    // Filter products
    const filteredProducts = allProducts.filter((product: WalmartProduct) => {
      // Must be sold by Walmart
      const isWalmart = product.seller_name?.toLowerCase().includes('walmart') ?? false;
      // Must be in stock
      const inStock = !product.out_of_stock;
      // Must be within price range
      const withinPrice = product.price && product.price <= maxPrice;
      // Must meet minimum rating (if rating exists)
      const meetsRating = !minRating || !product.rating || product.rating >= minRating;

      return isWalmart && inStock && withinPrice && meetsRating;
    });

    // Check for existing products in Airtable (deduplication)
    let existingProductIds = new Set<string>();
    if (checkDuplicates && filteredProducts.length > 0) {
      const productIds = filteredProducts.map(p => p.id);
      existingProductIds = await checkExistingProducts(productIds);
    }

    // Calculate selling price for each product
    // Formula: Selling Price = (Cost + additionalCost) / (1 - platformFee% - targetMargin%)
    const marginDivisor = 1 - (platformFeePercent / 100) - (targetMarginPercent / 100);
    const productsWithPricing = filteredProducts.map((product: WalmartProduct) => {
      const cost = product.price || 0;
      const sellingPrice = (cost + additionalCost) / marginDivisor;
      const margin = sellingPrice - cost - additionalCost - (sellingPrice * (platformFeePercent / 100));
      const marginPercent = (margin / sellingPrice) * 100;

      return {
        ...product,
        productCost: cost,
        calculatedSellingPrice: Math.ceil(sellingPrice * 100) / 100, // Round up to nearest cent
        calculatedMargin: Math.round(margin * 100) / 100,
        calculatedMarginPercent: Math.round(marginPercent * 10) / 10,
        isExisting: existingProductIds.has(product.id)  // Mark if already in Airtable
      };
    });

    // Estimate pagination info
    // ScrapingBee typically returns ~40 products per page
    const productsPerPage = 40;
    const estimatedTotalPages = Math.ceil(data.total_results / productsPerPage) || 1;
    const hasMore = page < estimatedTotalPages && allProducts.length >= productsPerPage;

    // Log the scrape
    await logScrape({
      action: 'Search',
      query: `${query} (page ${page})`,
      resultsCount: productsWithPricing.length,
      creditsUsed: CREDITS_PER_SEARCH,
      operator,
      store,
      productsAdded: 0, // Will be updated when products are added
      sessionId
    });

    const result: SearchResult = {
      products: productsWithPricing,
      totalResults: data.total_results || allProducts.length,
      creditsUsed: CREDITS_PER_SEARCH,
      currentPage: page,
      totalPages: estimatedTotalPages,
      hasMore
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
