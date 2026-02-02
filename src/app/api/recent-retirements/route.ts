import { NextResponse } from 'next/server';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = 'appRCQASsApV4C33N';
const TABLE_ID = 'tblo1uuy8Nc9CSjX4';

interface AirtableRecord {
  id: string;
  fields: {
    SKU?: string;
    'Product ID'?: string;
    Store?: string;
    Title?: string;
    'WM Publish Status'?: string;
    'WM Last Verification'?: string;
    '14-Day Sales'?: number;
    '7-Day Sales'?: number;
    'Approved Base Price'?: number;
    'Product Cost'?: number;
    'Retire Reason'?: string;
  };
}

interface RetiredProduct {
  id: string;
  sku: string;
  productId: string;
  title: string;
  store: string;
  publishStatus: string;
  retireReason: string;
  retireDate: string | null;
  sales14Day: number;
  sales7Day: number;
  estimatedRevenue: number;
  sellingPrice: number | null;
  productCost: number | null;
}

interface ReasonBreakdown {
  [reason: string]: number;
}

interface Summary {
  totalRetired: number;
  withSalesCount: number;
  totalLostSales14Day: number;
  totalLostRevenue: number;
  reasonBreakdown: ReasonBreakdown;
  byStore: { [store: string]: number };
  lastUpdate: string;
}

export async function GET() {
  try {
    if (!AIRTABLE_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'Airtable API key not configured' },
        { status: 500 }
      );
    }

    // Calculate date 7 days ago for filtering
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString();

    // Filter: Products with "Retired" in WM Publish Status, updated in last 7 days
    // Also include products currently marked with Retire Reason (pending retirement)
    const filterFormula = `OR(
      AND(
        FIND('Retired', {WM Publish Status}) > 0,
        {WM Last Verification} >= '${sevenDaysAgoStr}'
      ),
      AND(
        {Retire Reason} != '',
        OR({Store} = 'WM19', {Store} = 'WM24', {Store} = 'WM33')
      )
    )`;

    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
    url.searchParams.set('filterByFormula', filterFormula);
    url.searchParams.set('sort[0][field]', 'WM Last Verification');
    url.searchParams.set('sort[0][direction]', 'desc');
    url.searchParams.set('maxRecords', '100');

    // Fields to fetch
    const fields = [
      'SKU', 'Product ID', 'Store', 'Title',
      'WM Publish Status', 'WM Last Verification',
      '14-Day Sales', '7-Day Sales',
      'Approved Base Price', 'Product Cost',
      'Retire Reason'
    ];
    fields.forEach(field => url.searchParams.append('fields[]', field));

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

    // Process records
    const retiredProducts: RetiredProduct[] = [];
    const pendingRetirements: RetiredProduct[] = [];
    const reasonBreakdown: ReasonBreakdown = {};
    const byStore: { [store: string]: number } = {};
    let totalLostSales14Day = 0;
    let totalLostRevenue = 0;
    let withSalesCount = 0;

    for (const record of records) {
      const f = record.fields;
      const publishStatus = f['WM Publish Status'] || '';
      const isRetired = publishStatus.toLowerCase().includes('retired');
      const isPending = !isRetired && f['Retire Reason'];

      // Extract retire reason from status or field
      let retireReason = f['Retire Reason'] || '';
      if (!retireReason && isRetired) {
        // Try to extract from status like "Retired (Blacklisted Brand)"
        const match = publishStatus.match(/Retired\s*\(([^)]+)\)/i);
        retireReason = match ? match[1] : 'Unknown';
      }

      const sales14Day = f['14-Day Sales'] || 0;
      const sales7Day = f['7-Day Sales'] || 0;
      const sellingPrice = f['Approved Base Price'] || null;
      const productCost = f['Product Cost'] || null;

      // Estimate lost revenue (14-day sales * selling price)
      const estimatedRevenue = sales14Day * (sellingPrice || 0);

      const product: RetiredProduct = {
        id: record.id,
        sku: f.SKU || '',
        productId: f['Product ID'] || '',
        title: f.Title || f.SKU || 'Unknown',
        store: f.Store || 'Unknown',
        publishStatus,
        retireReason,
        retireDate: f['WM Last Verification'] || null,
        sales14Day,
        sales7Day,
        estimatedRevenue,
        sellingPrice,
        productCost,
      };

      if (isPending) {
        pendingRetirements.push(product);
      } else if (isRetired) {
        retiredProducts.push(product);

        // Aggregate stats
        if (sales14Day > 0) {
          withSalesCount++;
          totalLostSales14Day += sales14Day;
          totalLostRevenue += estimatedRevenue;
        }

        // Count by reason
        const reason = retireReason || 'Unknown';
        reasonBreakdown[reason] = (reasonBreakdown[reason] || 0) + 1;

        // Count by store
        const store = f.Store || 'Unknown';
        byStore[store] = (byStore[store] || 0) + 1;
      }
    }

    const summary: Summary = {
      totalRetired: retiredProducts.length,
      withSalesCount,
      totalLostSales14Day,
      totalLostRevenue,
      reasonBreakdown,
      byStore,
      lastUpdate: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      summary,
      retiredProducts,
      pendingRetirements,
    });

  } catch (error) {
    console.error('Recent retirements API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch retirement data'
      },
      { status: 500 }
    );
  }
}
