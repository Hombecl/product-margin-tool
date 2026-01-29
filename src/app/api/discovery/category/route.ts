import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;
const AIRTABLE_TOKEN = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = 'appRCQASsApV4C33N';
const SCRAPE_LOG_TABLE_ID = 'tbl1Csm5TFd7O3Prw';
const AIRTABLE_PRODUCT_TABLE_ID = 'tblo1uuy8Nc9CSjX4';

// Credits estimation for category browse
const CREDITS_PER_CATEGORY = 10;

// Check existing products in Airtable - process in batches to avoid URL length limits
async function checkExistingProducts(productIds: string[]): Promise<Set<string>> {
  if (!AIRTABLE_TOKEN || productIds.length === 0) return new Set();

  const existingIds = new Set<string>();
  const batchSize = 30;

  for (let i = 0; i < productIds.length; i += batchSize) {
    const batch = productIds.slice(i, i + batchSize);
    const idChecks = batch.map(id => `{WM Product ID} = '${id}'`).join(', ');
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

      if (i + batchSize < productIds.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } catch (error) {
      console.error('Error checking batch:', error);
    }
  }

  return existingIds;
}

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

// Popular Walmart categories for browsing
export const WALMART_CATEGORIES = [
  { id: 'grocery', name: 'Grocery', path: '/browse/food/976759' },
  { id: 'household', name: 'Household Essentials', path: '/browse/household-essentials/1115193' },
  { id: 'health', name: 'Health', path: '/browse/health/976760' },
  { id: 'beauty', name: 'Beauty', path: '/browse/beauty/1085666' },
  { id: 'baby', name: 'Baby', path: '/browse/baby/5427' },
  { id: 'pets', name: 'Pets', path: '/browse/pets/5440' },
  { id: 'home', name: 'Home', path: '/browse/home/4044' },
  { id: 'kitchen', name: 'Kitchen & Dining', path: '/browse/kitchen-dining/623679' },
  { id: 'office', name: 'Office Supplies', path: '/browse/office/1229749' },
  { id: 'sports', name: 'Sports & Outdoors', path: '/browse/sports-outdoors/4125' },
];

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

// GET - Return list of categories
export async function GET() {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get('profit-scout-auth');
  if (!authCookie) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ categories: WALMART_CATEGORIES });
}

// POST - Browse a specific category
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
      categoryId,
      categoryUrl, // Custom category URL if provided
      maxPrice = 40,
      minRating = 0,
      store = 'WM19',
      operator = 'Unknown',
      sessionId = '',
      // Custom pricing settings (matching search API)
      additionalCost = 4.50,
      targetMarginPercent = 15,
      platformFeePercent = 10.5,
      checkDuplicates = true
    } = body;

    // Determine the URL to scrape
    let targetUrl: string;
    let categoryName: string;

    if (categoryUrl) {
      // Custom category URL provided
      targetUrl = categoryUrl.startsWith('http')
        ? categoryUrl
        : `https://www.walmart.com${categoryUrl}`;
      categoryName = `Custom: ${categoryUrl}`;
    } else if (categoryId) {
      // Use predefined category
      const category = WALMART_CATEGORIES.find(c => c.id === categoryId);
      if (!category) {
        return NextResponse.json({ error: 'Invalid category ID' }, { status: 400 });
      }
      targetUrl = `https://www.walmart.com${category.path}?sort=best_seller`;
      categoryName = category.name;
    } else {
      return NextResponse.json({ error: 'Category ID or URL is required' }, { status: 400 });
    }

    // Add best seller sort if not already present
    if (!targetUrl.includes('sort=')) {
      targetUrl += targetUrl.includes('?') ? '&sort=best_seller' : '?sort=best_seller';
    }

    // Call ScrapingBee to scrape the category page
    // Using general scraping endpoint since category browsing requires page scraping
    const scrapeUrl = new URL('https://app.scrapingbee.com/api/v1');
    scrapeUrl.searchParams.set('api_key', SCRAPINGBEE_API_KEY);
    scrapeUrl.searchParams.set('url', targetUrl);
    scrapeUrl.searchParams.set('render_js', 'true');
    scrapeUrl.searchParams.set('premium_proxy', 'true');
    scrapeUrl.searchParams.set('country_code', 'us');

    // Extract product data using custom JS
    scrapeUrl.searchParams.set('extract_rules', JSON.stringify({
      products: {
        selector: '[data-item-id]',
        type: 'list',
        output: {
          id: { selector: '[data-item-id]', output: '@data-item-id' },
          title: { selector: '[data-automation-id="product-title"]', output: 'text' },
          price: { selector: '[data-automation-id="product-price"] .f2', output: 'text' },
          image: { selector: 'img[data-testid="productTileImage"]', output: '@src' },
          rating: { selector: '[data-testid="product-ratings"] .w_iUH7', output: 'text' },
          seller: { selector: '[data-automation-id="fulfilled-shipping-text"]', output: 'text' }
        }
      }
    }));

    const response = await fetch(scrapeUrl.toString());

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ScrapingBee category error:', errorText);

      // Fallback: Try using Walmart Search API with category name
      return await fallbackCategorySearch(
        categoryName,
        maxPrice,
        minRating,
        store,
        operator,
        sessionId,
        additionalCost,
        targetMarginPercent,
        platformFeePercent,
        checkDuplicates
      );
    }

    const data = await response.json();
    let allProducts: WalmartProduct[] = [];

    // Parse the extracted products
    if (data.products && Array.isArray(data.products)) {
      allProducts = data.products
        .filter((p: { id?: string }) => p.id)
        .map((p: { id: string; title?: string; price?: string; image?: string; rating?: string; seller?: string }) => ({
          id: p.id,
          title: p.title || 'Unknown Product',
          price: parsePrice(p.price),
          image: p.image,
          rating: parseFloat(p.rating || '0') || undefined,
          seller_name: p.seller || 'Walmart.com',
          url: `https://www.walmart.com/ip/${p.id}`
        }));
    }

    // Filter products
    const filteredProducts = allProducts.filter((product: WalmartProduct) => {
      // Must be sold by Walmart (or unknown seller which usually means Walmart)
      const isWalmart = !product.seller_name ||
        product.seller_name.toLowerCase().includes('walmart') ||
        product.seller_name.toLowerCase().includes('shipped');
      // Must be within price range
      const withinPrice = product.price && product.price > 0 && product.price <= maxPrice;
      // Must meet minimum rating (if rating exists)
      const meetsRating = !minRating || !product.rating || product.rating >= minRating;

      return isWalmart && withinPrice && meetsRating;
    });

    // Check for existing products in Airtable (deduplication)
    let existingProductIds = new Set<string>();
    if (checkDuplicates && filteredProducts.length > 0) {
      const productIds = filteredProducts.map((p: WalmartProduct) => p.id);
      existingProductIds = await checkExistingProducts(productIds);
    }

    // Calculate selling price for each product using custom settings
    const marginDivisor = 1 - (platformFeePercent / 100) - (targetMarginPercent / 100);
    const productsWithPricing = filteredProducts.map((product: WalmartProduct) => {
      const cost = product.price || 0;
      const sellingPrice = (cost + additionalCost) / marginDivisor;
      const margin = sellingPrice - cost - additionalCost - (sellingPrice * (platformFeePercent / 100));
      const marginPercent = (margin / sellingPrice) * 100;

      return {
        ...product,
        productCost: cost,
        calculatedSellingPrice: Math.ceil(sellingPrice * 100) / 100,
        calculatedMargin: Math.round(margin * 100) / 100,
        calculatedMarginPercent: Math.round(marginPercent * 10) / 10,
        isExisting: existingProductIds.has(product.id)
      };
    });

    // Log the scrape
    await logScrape({
      action: 'Category Browse',
      query: categoryName,
      resultsCount: productsWithPricing.length,
      creditsUsed: CREDITS_PER_CATEGORY * 5, // Premium proxy uses more credits
      operator,
      store,
      productsAdded: 0,
      sessionId
    });

    return NextResponse.json({
      products: productsWithPricing,
      totalResults: allProducts.length,
      creditsUsed: CREDITS_PER_CATEGORY * 5,
      category: categoryName
    });
  } catch (error) {
    console.error('Category browse error:', error);
    return NextResponse.json({ error: 'Category browse failed' }, { status: 500 });
  }
}

// Helper to parse price string
function parsePrice(priceStr?: string): number {
  if (!priceStr) return 0;
  const match = priceStr.replace(/[^0-9.]/g, '');
  return parseFloat(match) || 0;
}

// Fallback: Use search API with category name as query
async function fallbackCategorySearch(
  categoryName: string,
  maxPrice: number,
  minRating: number,
  store: string,
  operator: string,
  sessionId: string,
  additionalCost: number = 4.50,
  targetMarginPercent: number = 15,
  platformFeePercent: number = 10.5,
  checkDuplicates: boolean = true
) {
  if (!SCRAPINGBEE_API_KEY) {
    return NextResponse.json({ error: 'ScrapingBee API key not configured' }, { status: 500 });
  }

  // Use search API with category name + bestseller keywords
  const searchUrl = new URL('https://app.scrapingbee.com/api/v1/walmart/search');
  searchUrl.searchParams.set('api_key', SCRAPINGBEE_API_KEY);
  searchUrl.searchParams.set('query', `${categoryName}`);
  searchUrl.searchParams.set('delivery_zip', DEFAULT_DELIVERY_ZIP);
  searchUrl.searchParams.set('sort_by', 'best_seller');

  try {
    const response = await fetch(searchUrl.toString());

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch category' }, { status: 500 });
    }

    const data = await response.json();
    const allProducts = data.products || [];

    // Filter products
    const filteredProducts = allProducts.filter((product: WalmartProduct) => {
      const isWalmart = !product.seller_name || product.seller_name.toLowerCase().includes('walmart');
      const inStock = !product.out_of_stock;
      const withinPrice = product.price && product.price <= maxPrice;
      const meetsRating = !minRating || !product.rating || product.rating >= minRating;
      return isWalmart && inStock && withinPrice && meetsRating;
    });

    // Check for existing products in Airtable (deduplication)
    let existingProductIds = new Set<string>();
    if (checkDuplicates && filteredProducts.length > 0) {
      const productIds = filteredProducts.map((p: WalmartProduct) => p.id);
      existingProductIds = await checkExistingProducts(productIds);
    }

    // Calculate pricing using custom settings
    const marginDivisor = 1 - (platformFeePercent / 100) - (targetMarginPercent / 100);
    const productsWithPricing = filteredProducts.map((product: WalmartProduct) => {
      const cost = product.price || 0;
      const sellingPrice = (cost + additionalCost) / marginDivisor;
      const margin = sellingPrice - cost - additionalCost - (sellingPrice * (platformFeePercent / 100));
      const marginPercent = (margin / sellingPrice) * 100;

      return {
        ...product,
        productCost: cost,
        calculatedSellingPrice: Math.ceil(sellingPrice * 100) / 100,
        calculatedMargin: Math.round(margin * 100) / 100,
        calculatedMarginPercent: Math.round(marginPercent * 10) / 10,
        isExisting: existingProductIds.has(product.id)
      };
    });

    // Log the scrape
    await logScrape({
      action: 'Category Browse',
      query: `${categoryName} (fallback)`,
      resultsCount: productsWithPricing.length,
      creditsUsed: 10,
      operator,
      store,
      productsAdded: 0,
      sessionId
    });

    return NextResponse.json({
      products: productsWithPricing,
      totalResults: allProducts.length,
      creditsUsed: 10,
      category: categoryName,
      fallback: true
    });
  } catch (error) {
    console.error('Fallback search error:', error);
    return NextResponse.json({ error: 'Category browse failed' }, { status: 500 });
  }
}
