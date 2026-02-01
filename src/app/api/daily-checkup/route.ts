import { NextRequest, NextResponse } from 'next/server';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = 'appRCQASsApV4C33N';
const TABLE_ID = 'tblo1uuy8Nc9CSjX4';

interface AirtableRecord {
  id: string;
  fields: {
    SKU?: string;
    'Product ID'?: string;
    Store?: string;
    Status?: string;
    '7-Day Sales'?: number;
    'Daily Check Our Rank'?: number;
    'Daily Check Our Price'?: number;
    'Daily Check Our Shipping'?: number;
    'Daily Check All Sellers'?: string;
    'Daily Check Is Winning'?: boolean;
    'Daily Check Last Run'?: string;
    'Daily Check Lowest 3P Price'?: number;
    'Daily Check Price Diff'?: number;
    'Scrape Total Sellers'?: number;
    Title?: string;
    'Walmart Listing URL'?: string;
  };
}

interface Seller {
  name: string;
  price: number;
  shipping: number;
  freeShipping: boolean;
  total: number;
  isOurs: boolean;
  rank: number;
}

interface DailyCheckProduct {
  id: string;
  sku: string;
  productId: string;
  title: string;
  store: string;
  status: string;
  sales7Day: number;
  ourRank: number | null;
  ourPrice: number | null;
  ourShipping: number | null;
  ourTotal: number | null;
  isWinning: boolean;
  lowest3PPrice: number | null;
  priceDiff: number | null;
  totalSellers: number;
  lastCheck: string | null;
  sellers: Seller[];
  walmartUrl: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const store = searchParams.get('store'); // WM19 or WM24 or all

    // Build filter formula
    let filterFormula = "AND({Status}='Active', {7-Day Sales}>0)";
    if (store && store !== 'all') {
      filterFormula = `AND({Status}='Active', {7-Day Sales}>0, {Store}='${store}')`;
    }

    // Fetch from Airtable
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
    url.searchParams.set('filterByFormula', filterFormula);
    url.searchParams.set('sort[0][field]', '7-Day Sales');
    url.searchParams.set('sort[0][direction]', 'desc');
    url.searchParams.set('maxRecords', limit.toString());
    url.searchParams.set('fields[]', 'SKU');
    url.searchParams.append('fields[]', 'Product ID');
    url.searchParams.append('fields[]', 'Store');
    url.searchParams.append('fields[]', 'Status');
    url.searchParams.append('fields[]', '7-Day Sales');
    url.searchParams.append('fields[]', 'Daily Check Our Rank');
    url.searchParams.append('fields[]', 'Daily Check Our Price');
    url.searchParams.append('fields[]', 'Daily Check Our Shipping');
    url.searchParams.append('fields[]', 'Daily Check All Sellers');
    url.searchParams.append('fields[]', 'Daily Check Is Winning');
    url.searchParams.append('fields[]', 'Daily Check Last Run');
    url.searchParams.append('fields[]', 'Daily Check Lowest 3P Price');
    url.searchParams.append('fields[]', 'Daily Check Price Diff');
    url.searchParams.append('fields[]', 'Scrape Total Sellers');
    url.searchParams.append('fields[]', 'Title');
    url.searchParams.append('fields[]', 'Walmart Listing URL');

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Failed to fetch from Airtable');
    }

    const data = await response.json();
    const records: AirtableRecord[] = data.records || [];

    // Transform records
    const products: DailyCheckProduct[] = records.map((record) => {
      const f = record.fields;
      let sellers: Seller[] = [];

      try {
        if (f['Daily Check All Sellers']) {
          sellers = JSON.parse(f['Daily Check All Sellers']);
        }
      } catch {
        sellers = [];
      }

      const ourPrice = f['Daily Check Our Price'] || null;
      const ourShipping = f['Daily Check Our Shipping'] || 0;
      const ourTotal = ourPrice ? ourPrice + ourShipping : null;

      return {
        id: record.id,
        sku: f.SKU || '',
        productId: f['Product ID'] || '',
        title: f.Title || f.SKU || 'Unknown Product',
        store: f.Store || 'Unknown',
        status: f.Status || 'Unknown',
        sales7Day: f['7-Day Sales'] || 0,
        ourRank: f['Daily Check Our Rank'] || null,
        ourPrice: f['Daily Check Our Price'] || null,
        ourShipping: f['Daily Check Our Shipping'] || null,
        ourTotal,
        isWinning: f['Daily Check Is Winning'] || false,
        lowest3PPrice: f['Daily Check Lowest 3P Price'] || null,
        priceDiff: f['Daily Check Price Diff'] || null,
        totalSellers: f['Scrape Total Sellers'] || sellers.length,
        lastCheck: f['Daily Check Last Run'] || null,
        sellers,
        walmartUrl: f['Walmart Listing URL'] || `https://www.walmart.com/ip/${f['Product ID']}`,
      };
    });

    // Calculate summary stats
    const summary = {
      totalProducts: products.length,
      winning: products.filter(p => p.isWinning).length,
      losing: products.filter(p => !p.isWinning && p.ourRank !== null).length,
      notFound: products.filter(p => p.ourRank === null).length,
      lastCheck: products[0]?.lastCheck || null,
    };

    return NextResponse.json({
      success: true,
      summary,
      products,
    });

  } catch (error) {
    console.error('Daily check-up API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch daily check-up data'
      },
      { status: 500 }
    );
  }
}

// POST endpoint to trigger a manual check via n8n webhook
export async function POST() {
  try {
    const webhookUrl = 'https://n8n.nuxec.com/webhook/daily-checkup-manual';

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ manual: true, triggeredAt: new Date().toISOString() }),
    });

    if (!response.ok) {
      throw new Error('Failed to trigger daily check-up workflow');
    }

    const result = await response.json();

    return NextResponse.json({
      success: true,
      message: 'Daily check-up triggered successfully',
      result,
    });

  } catch (error) {
    console.error('Trigger daily check-up error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to trigger daily check-up'
      },
      { status: 500 }
    );
  }
}
