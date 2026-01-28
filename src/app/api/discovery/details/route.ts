import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;
const AIRTABLE_TOKEN = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = 'appRCQASsApV4C33N';
const SCRAPE_LOG_TABLE_ID = 'tbl1Csm5TFd7O3Prw';

// Credits per product detail fetch
const CREDITS_PER_PRODUCT = 10;

interface ProductDetails {
  id: string;
  upc?: string;
  gtin?: string;
  inStock: boolean;
  stockQuantity?: number;
  thirdPartySellers: number;
  hasCompetition: boolean;
  brand?: string;
  manufacturer?: string;
  modelNumber?: string;
  price?: number;
  wasPrice?: number;
  fulfillment?: {
    shipping: boolean;
    delivery: boolean;
    pickup: boolean;
  };
  error?: string;
}

interface ScrapingBeeProductResponse {
  upc?: string;
  gtin?: string;
  product_id?: string;
  title?: string;
  brand?: string;
  manufacturer?: string;
  model_number?: string;
  price?: number;
  was_price?: number;
  in_stock?: boolean;
  stock_status?: string;
  available_quantity?: number;
  fulfillment?: {
    shipping?: boolean;
    delivery?: boolean;
    pickup?: boolean;
    free_shipping?: boolean;
  };
  sellers?: Array<{
    seller_id?: string;
    seller_name?: string;
    price?: number;
  }>;
  buybox_winner?: {
    seller_id?: string;
    seller_name?: string;
    price?: number;
  };
}

async function logScrape(data: {
  action: string;
  query: string;
  resultsCount: number;
  creditsUsed: number;
  operator: string;
  store: string;
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
            'Products Added': 0,
            'Session ID': data.sessionId
          }
        }]
      })
    });
  } catch (error) {
    console.error('Failed to log scrape:', error);
  }
}

async function fetchProductDetails(productId: string): Promise<ProductDetails> {
  if (!SCRAPINGBEE_API_KEY) {
    return {
      id: productId,
      inStock: false,
      thirdPartySellers: 0,
      hasCompetition: false,
      error: 'API key not configured'
    };
  }

  try {
    // Use ScrapingBee Walmart Product API
    const productUrl = new URL('https://app.scrapingbee.com/api/v1/walmart/product');
    productUrl.searchParams.set('api_key', SCRAPINGBEE_API_KEY);
    productUrl.searchParams.set('product_id', productId);
    productUrl.searchParams.set('delivery_zip', '77057');

    const response = await fetch(productUrl.toString());

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Product ${productId} fetch error:`, errorText);
      return {
        id: productId,
        inStock: false,
        thirdPartySellers: 0,
        hasCompetition: false,
        error: 'Failed to fetch product details'
      };
    }

    const data: ScrapingBeeProductResponse = await response.json();

    // Count third-party sellers (excluding Walmart.com)
    const sellers = data.sellers || [];
    const thirdPartySellers = sellers.filter(s =>
      s.seller_name && !s.seller_name.toLowerCase().includes('walmart')
    ).length;

    // Check if buybox winner is a third-party seller
    const buyboxIsThirdParty = data.buybox_winner?.seller_name &&
      !data.buybox_winner.seller_name.toLowerCase().includes('walmart');

    return {
      id: productId,
      upc: data.upc,
      gtin: data.gtin,
      inStock: data.in_stock ?? false,
      stockQuantity: data.available_quantity,
      thirdPartySellers,
      hasCompetition: thirdPartySellers > 0 || buyboxIsThirdParty || false,
      brand: data.brand,
      manufacturer: data.manufacturer,
      modelNumber: data.model_number,
      price: data.price,
      wasPrice: data.was_price,
      fulfillment: data.fulfillment ? {
        shipping: data.fulfillment.shipping ?? false,
        delivery: data.fulfillment.delivery ?? false,
        pickup: data.fulfillment.pickup ?? false
      } : undefined
    };
  } catch (error) {
    console.error(`Error fetching product ${productId}:`, error);
    return {
      id: productId,
      inStock: false,
      thirdPartySellers: 0,
      hasCompetition: false,
      error: String(error)
    };
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
      productIds,  // Array of product IDs to fetch details for
      operator = 'Unknown',
      store = 'WM19',
      sessionId = ''
    } = body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({ error: 'Product IDs array is required' }, { status: 400 });
    }

    // Limit to 20 products per request to avoid timeout
    const limitedIds = productIds.slice(0, 20);
    const totalCredits = limitedIds.length * CREDITS_PER_PRODUCT;

    // Fetch details for each product (in parallel with limit)
    const results: ProductDetails[] = [];
    const batchSize = 5; // Fetch 5 at a time to avoid rate limiting

    for (let i = 0; i < limitedIds.length; i += batchSize) {
      const batch = limitedIds.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(id => fetchProductDetails(id))
      );
      results.push(...batchResults);

      // Small delay between batches
      if (i + batchSize < limitedIds.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // Log the scrape
    await logScrape({
      action: 'Product Details',
      query: `${limitedIds.length} products`,
      resultsCount: results.filter(r => !r.error).length,
      creditsUsed: totalCredits,
      operator,
      store,
      sessionId
    });

    // Summary stats
    const summary = {
      total: results.length,
      successful: results.filter(r => !r.error).length,
      failed: results.filter(r => r.error).length,
      inStock: results.filter(r => r.inStock).length,
      withUPC: results.filter(r => r.upc || r.gtin).length,
      withCompetition: results.filter(r => r.hasCompetition).length,
      noCompetition: results.filter(r => !r.hasCompetition && !r.error).length
    };

    return NextResponse.json({
      products: results,
      summary,
      creditsUsed: totalCredits,
      truncated: productIds.length > 20
    });
  } catch (error) {
    console.error('Product details error:', error);
    return NextResponse.json({ error: 'Failed to fetch product details' }, { status: 500 });
  }
}
