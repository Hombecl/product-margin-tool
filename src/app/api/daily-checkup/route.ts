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
    '14-Day Sales'?: number;
    '3-Day Sales'?: number;
    'Daily Check Our Rank'?: number;
    'Daily Check Our Price'?: number;
    'Daily Check Our Shipping'?: number;
    'Daily Check All Sellers'?: string;
    'Daily Check Is Winning'?: boolean;
    'Daily Check Last Run'?: string;
    'Daily Check Lowest 3P Price'?: number;
    'Daily Check Price Diff'?: number;
    'Scrape Total Sellers'?: number;
    'Scrape 3P Seller Count'?: number;
    'Scrape Current Price'?: number;
    'Scrape Price'?: number;
    'Scrape Seller Name'?: string;
    'Scrape Rating'?: number;
    'Scrape Review Count'?: number;
    'Scrape Brand'?: string;
    'Scrape Low Stock Message'?: string;
    Title?: string;
    'Walmart Listing URL'?: string;
    // Cost and margin fields
    'Product Cost'?: number;
    'Approved Base Price'?: number;
    'Declared Price'?: number;
    'Primary Supplier Link'?: string;
    // Inventory fields
    'WM Publish Status'?: string;
    'WM Inventory'?: number;
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
  sales3Day: number;
  sales7Day: number;
  sales14Day: number;
  // Pricing
  productCost: number | null;
  ourSellingPrice: number | null;
  declaredPrice: number | null;
  walmartPrice: number | null;
  // Inventory
  totalInventory: number;
  inventoryWarning: boolean;
  publishedStatus: string;
  // Margin
  marginDollar: number | null;
  marginPercent: number | null;
  // Competition
  ourRank: number | null;
  ourPrice: number | null;
  ourShipping: number | null;
  ourTotal: number | null;
  isWinning: boolean;
  lowest3PPrice: number | null;
  priceDiff: number | null;
  totalSellers: number;
  thirdPartySellers: number;
  buyBoxSeller: string;
  // Product info
  brand: string | null;
  rating: number | null;
  reviewCount: number;
  lowStockWarning: string | null;
  // Links
  supplierLink: string | null;
  lastCheck: string | null;
  sellers: Seller[];
  walmartUrl: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '15');
    const store = searchParams.get('store'); // WM19 or WM24 or all

    // Build filter formula - use 14-Day Sales for sorting
    let filterFormula = "AND({14-Day Sales}>0, OR({Store}='WM19', {Store}='WM24'))";
    if (store && store !== 'all') {
      filterFormula = `AND({14-Day Sales}>0, {Store}='${store}')`;
    }

    // Fetch from Airtable
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
    url.searchParams.set('filterByFormula', filterFormula);
    url.searchParams.set('sort[0][field]', '14-Day Sales');
    url.searchParams.set('sort[0][direction]', 'desc');
    url.searchParams.set('maxRecords', limit.toString());
    // Basic product info
    url.searchParams.set('fields[]', 'SKU');
    url.searchParams.append('fields[]', 'Product ID');
    url.searchParams.append('fields[]', 'Store');
    url.searchParams.append('fields[]', 'Status');
    url.searchParams.append('fields[]', 'Title');
    url.searchParams.append('fields[]', 'Walmart Listing URL');
    // Sales data
    url.searchParams.append('fields[]', '3-Day Sales');
    url.searchParams.append('fields[]', '7-Day Sales');
    url.searchParams.append('fields[]', '14-Day Sales');
    // Cost and pricing
    url.searchParams.append('fields[]', 'Product Cost');
    url.searchParams.append('fields[]', 'Approved Base Price');
    url.searchParams.append('fields[]', 'Declared Price');
    url.searchParams.append('fields[]', 'Primary Supplier Link');
    // Inventory
    url.searchParams.append('fields[]', 'WM Publish Status');
    url.searchParams.append('fields[]', 'WM Inventory');
    // Scrape data
    url.searchParams.append('fields[]', 'Scrape Current Price');
    url.searchParams.append('fields[]', 'Scrape Price');
    url.searchParams.append('fields[]', 'Scrape Seller Name');
    url.searchParams.append('fields[]', 'Scrape Total Sellers');
    url.searchParams.append('fields[]', 'Scrape 3P Seller Count');
    url.searchParams.append('fields[]', 'Scrape Rating');
    url.searchParams.append('fields[]', 'Scrape Review Count');
    url.searchParams.append('fields[]', 'Scrape Brand');
    url.searchParams.append('fields[]', 'Scrape Low Stock Message');
    // Daily check data
    url.searchParams.append('fields[]', 'Daily Check Our Rank');
    url.searchParams.append('fields[]', 'Daily Check Our Price');
    url.searchParams.append('fields[]', 'Daily Check Our Shipping');
    url.searchParams.append('fields[]', 'Daily Check All Sellers');
    url.searchParams.append('fields[]', 'Daily Check Is Winning');
    url.searchParams.append('fields[]', 'Daily Check Last Run');
    url.searchParams.append('fields[]', 'Daily Check Lowest 3P Price');
    url.searchParams.append('fields[]', 'Daily Check Price Diff');

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

      // Pricing data
      const productCost = f['Product Cost'] || null;
      const ourSellingPrice = f['Approved Base Price'] || null;
      const declaredPrice = f['Declared Price'] || null;
      const walmartPrice = f['Scrape Current Price'] || f['Scrape Price'] || null;

      // Calculate Margin: Our Selling Price - Product Cost - $4.5 shipping - (Our Selling Price * 10.5% platform fee)
      let marginDollar: number | null = null;
      let marginPercent: number | null = null;
      if (ourSellingPrice && productCost) {
        const platformFee = ourSellingPrice * 0.105;
        const shippingCost = 4.5;
        marginDollar = ourSellingPrice - productCost - shippingCost - platformFee;
        marginPercent = marginDollar / ourSellingPrice;
      }

      // Inventory
      const totalInventory = f['WM Inventory'] || 0;
      const inventoryWarning = totalInventory === 0;

      // Publish status
      const wmStatus = f['WM Publish Status'] || '';
      let publishedStatus: string;
      if (wmStatus.includes('PUBLISHED') || wmStatus.includes('ACTIVE')) {
        publishedStatus = 'PUBLISHED';
      } else if (wmStatus.includes('UNPUBLISHED') || wmStatus.includes('RETIRED')) {
        publishedStatus = 'UNPUBLISHED';
      } else {
        publishedStatus = wmStatus || 'Unknown';
      }

      const ourPrice = f['Daily Check Our Price'] || null;
      const ourShipping = f['Daily Check Our Shipping'] || 0;
      const ourTotal = ourPrice ? ourPrice + ourShipping : null;

      const lowest3PPrice = f['Daily Check Lowest 3P Price'] || null;
      const isWinning = f['Daily Check Is Winning'] || (ourSellingPrice && lowest3PPrice ? ourSellingPrice <= lowest3PPrice : false);

      return {
        id: record.id,
        sku: f.SKU || '',
        productId: f['Product ID'] || '',
        title: f.Title || f.SKU || 'Unknown Product',
        store: f.Store || 'Unknown',
        status: f.Status || 'Unknown',
        sales3Day: f['3-Day Sales'] || 0,
        sales7Day: f['7-Day Sales'] || 0,
        sales14Day: f['14-Day Sales'] || 0,
        // Pricing
        productCost,
        ourSellingPrice,
        declaredPrice,
        walmartPrice,
        // Inventory
        totalInventory,
        inventoryWarning,
        publishedStatus,
        // Margin
        marginDollar,
        marginPercent,
        // Competition
        ourRank: f['Daily Check Our Rank'] || null,
        ourPrice,
        ourShipping: f['Daily Check Our Shipping'] || null,
        ourTotal,
        isWinning,
        lowest3PPrice,
        priceDiff: f['Daily Check Price Diff'] || null,
        totalSellers: f['Scrape Total Sellers'] || sellers.length,
        thirdPartySellers: f['Scrape 3P Seller Count'] || 0,
        buyBoxSeller: f['Scrape Seller Name'] || 'Unknown',
        // Product info
        brand: f['Scrape Brand'] || null,
        rating: f['Scrape Rating'] || null,
        reviewCount: f['Scrape Review Count'] || 0,
        lowStockWarning: f['Scrape Low Stock Message'] || null,
        // Links
        supplierLink: f['Primary Supplier Link'] || null,
        lastCheck: f['Daily Check Last Run'] || null,
        sellers,
        walmartUrl: f['Walmart Listing URL'] || `https://www.walmart.com/ip/${f['Product ID']}`,
      };
    });

    // Calculate summary stats
    const published = products.filter(p => p.publishedStatus === 'PUBLISHED').length;
    const unpublished = products.filter(p => p.publishedStatus === 'UNPUBLISHED').length;
    const zeroInventory = products.filter(p => p.inventoryWarning).length;

    const summary = {
      totalProducts: products.length,
      winning: products.filter(p => p.isWinning).length,
      losing: products.filter(p => !p.isWinning && p.ourRank !== null).length,
      notFound: products.filter(p => p.ourRank === null).length,
      published,
      unpublished,
      zeroInventory,
      totalSales3Day: products.reduce((sum, p) => sum + (p.sales3Day || 0), 0),
      totalSales7Day: products.reduce((sum, p) => sum + (p.sales7Day || 0), 0),
      totalSales14Day: products.reduce((sum, p) => sum + (p.sales14Day || 0), 0),
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
