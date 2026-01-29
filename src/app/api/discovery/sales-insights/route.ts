import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AIRTABLE_TOKEN = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = 'appRCQASsApV4C33N';
const PRODUCT_TABLE_ID = 'tblo1uuy8Nc9CSjX4';

interface ProductRecord {
  id: string;
  fields: {
    'SKU'?: string;
    'Title'?: string;
    'Store'?: string;
    'Total Sold Units'?: number;
    '7-Day Sales'?: number;
    '30-Day Sales'?: number;
    'Sales Velocity'?: number;
    'Product Cost'?: number;
    'Approved Base Price'?: number;
    'Margin%'?: number;
    'Discovery Source'?: string;
    'Discovery Date'?: string;
    'Discovery Tags'?: string[];
    'Status'?: string;
    'WM Product ID'?: string;
    'Primary Supplier Link'?: string;
  };
}

interface SourcePerformance {
  source: string;
  totalProducts: number;
  productsWithSales: number;
  conversionRate: number;
  totalUnitsSold: number;
  total7DaySales: number;
  total30DaySales: number;
  avgSalesVelocity: number;
  avgMarginPercent: number;
  topProducts: Array<{
    sku: string;
    title: string;
    unitsSold: number;
    sales7Day: number;
    marginPercent: number;
  }>;
}

interface TagPerformance {
  tag: string;
  totalProducts: number;
  productsWithSales: number;
  conversionRate: number;
  totalUnitsSold: number;
  avgSalesVelocity: number;
}

export async function GET() {
  // Check authentication
  const cookieStore = await cookies();
  const authCookie = cookieStore.get('profit-scout-auth');
  if (!authCookie) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!AIRTABLE_TOKEN) {
    return NextResponse.json({ error: 'Airtable not configured' }, { status: 500 });
  }

  try {
    // Fetch all products with Discovery Source (discovered products)
    const allRecords: ProductRecord[] = [];
    let offset: string | undefined;

    do {
      const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PRODUCT_TABLE_ID}`);
      // Filter for products that have a Discovery Source (i.e., discovered via Product Discovery)
      url.searchParams.set('filterByFormula', `NOT({Discovery Source} = '')`);
      url.searchParams.set('fields[]', 'SKU');
      url.searchParams.append('fields[]', 'Title');
      url.searchParams.append('fields[]', 'Store');
      url.searchParams.append('fields[]', 'Total Sold Units');
      url.searchParams.append('fields[]', '7-Day Sales');
      url.searchParams.append('fields[]', '30-Day Sales');
      url.searchParams.append('fields[]', 'Sales Velocity');
      url.searchParams.append('fields[]', 'Product Cost');
      url.searchParams.append('fields[]', 'Approved Base Price');
      url.searchParams.append('fields[]', 'Margin%');
      url.searchParams.append('fields[]', 'Discovery Source');
      url.searchParams.append('fields[]', 'Discovery Date');
      url.searchParams.append('fields[]', 'Discovery Tags');
      url.searchParams.append('fields[]', 'Status');

      if (offset) {
        url.searchParams.set('offset', offset);
      }

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch products');
      }

      const data = await response.json();
      allRecords.push(...(data.records || []));
      offset = data.offset;
    } while (offset);

    // Aggregate by Discovery Source
    const bySource: Record<string, ProductRecord[]> = {};
    const byTag: Record<string, ProductRecord[]> = {};

    for (const record of allRecords) {
      const source = record.fields['Discovery Source'] || 'Unknown';

      if (!bySource[source]) {
        bySource[source] = [];
      }
      bySource[source].push(record);

      // Also aggregate by tags
      const tags = record.fields['Discovery Tags'] || [];
      for (const tag of tags) {
        if (!byTag[tag]) {
          byTag[tag] = [];
        }
        byTag[tag].push(record);
      }
    }

    // Calculate performance metrics by source
    const sourcePerformance: SourcePerformance[] = Object.entries(bySource).map(([source, products]) => {
      const productsWithSales = products.filter(p => (p.fields['Total Sold Units'] || 0) > 0);

      const totalUnitsSold = products.reduce((sum, p) => sum + (p.fields['Total Sold Units'] || 0), 0);
      const total7DaySales = products.reduce((sum, p) => sum + (p.fields['7-Day Sales'] || 0), 0);
      const total30DaySales = products.reduce((sum, p) => sum + (p.fields['30-Day Sales'] || 0), 0);

      const velocities = products.filter(p => p.fields['Sales Velocity']).map(p => p.fields['Sales Velocity'] || 0);
      const avgSalesVelocity = velocities.length > 0
        ? velocities.reduce((sum, v) => sum + v, 0) / velocities.length
        : 0;

      const margins = products.filter(p => p.fields['Margin%']).map(p => p.fields['Margin%'] || 0);
      const avgMarginPercent = margins.length > 0
        ? margins.reduce((sum, m) => sum + m, 0) / margins.length
        : 0;

      // Top products by units sold
      const topProducts = products
        .filter(p => (p.fields['Total Sold Units'] || 0) > 0)
        .sort((a, b) => (b.fields['Total Sold Units'] || 0) - (a.fields['Total Sold Units'] || 0))
        .slice(0, 5)
        .map(p => ({
          sku: p.fields['SKU'] || '',
          title: p.fields['Title'] || '',
          unitsSold: p.fields['Total Sold Units'] || 0,
          sales7Day: p.fields['7-Day Sales'] || 0,
          marginPercent: p.fields['Margin%'] || 0
        }));

      return {
        source,
        totalProducts: products.length,
        productsWithSales: productsWithSales.length,
        conversionRate: products.length > 0
          ? Math.round((productsWithSales.length / products.length) * 1000) / 10
          : 0,
        totalUnitsSold,
        total7DaySales,
        total30DaySales,
        avgSalesVelocity: Math.round(avgSalesVelocity * 100) / 100,
        avgMarginPercent: Math.round(avgMarginPercent * 10) / 10,
        topProducts
      };
    });

    // Sort by total units sold (best performing first)
    sourcePerformance.sort((a, b) => b.totalUnitsSold - a.totalUnitsSold);

    // Calculate performance metrics by tag
    const tagPerformance: TagPerformance[] = Object.entries(byTag).map(([tag, products]) => {
      const productsWithSales = products.filter(p => (p.fields['Total Sold Units'] || 0) > 0);
      const totalUnitsSold = products.reduce((sum, p) => sum + (p.fields['Total Sold Units'] || 0), 0);

      const velocities = products.filter(p => p.fields['Sales Velocity']).map(p => p.fields['Sales Velocity'] || 0);
      const avgSalesVelocity = velocities.length > 0
        ? velocities.reduce((sum, v) => sum + v, 0) / velocities.length
        : 0;

      return {
        tag,
        totalProducts: products.length,
        productsWithSales: productsWithSales.length,
        conversionRate: products.length > 0
          ? Math.round((productsWithSales.length / products.length) * 1000) / 10
          : 0,
        totalUnitsSold,
        avgSalesVelocity: Math.round(avgSalesVelocity * 100) / 100
      };
    });

    tagPerformance.sort((a, b) => b.totalUnitsSold - a.totalUnitsSold);

    // Overall summary
    const summary = {
      totalDiscoveredProducts: allRecords.length,
      productsWithSales: allRecords.filter(p => (p.fields['Total Sold Units'] || 0) > 0).length,
      overallConversionRate: allRecords.length > 0
        ? Math.round((allRecords.filter(p => (p.fields['Total Sold Units'] || 0) > 0).length / allRecords.length) * 1000) / 10
        : 0,
      totalUnitsSold: allRecords.reduce((sum, p) => sum + (p.fields['Total Sold Units'] || 0), 0),
      total7DaySales: allRecords.reduce((sum, p) => sum + (p.fields['7-Day Sales'] || 0), 0),
      total30DaySales: allRecords.reduce((sum, p) => sum + (p.fields['30-Day Sales'] || 0), 0)
    };

    // Recent top performers (last 30 days discovery with sales)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentWinners = allRecords
      .filter(p => {
        const discoveryDate = p.fields['Discovery Date'];
        if (!discoveryDate) return false;
        return new Date(discoveryDate) >= thirtyDaysAgo && (p.fields['Total Sold Units'] || 0) > 0;
      })
      .sort((a, b) => (b.fields['Total Sold Units'] || 0) - (a.fields['Total Sold Units'] || 0))
      .slice(0, 10)
      .map(p => ({
        sku: p.fields['SKU'] || '',
        title: p.fields['Title'] || '',
        unitsSold: p.fields['Total Sold Units'] || 0,
        sales7Day: p.fields['7-Day Sales'] || 0,
        marginPercent: p.fields['Margin%'] || 0,
        discoverySource: p.fields['Discovery Source'] || '',
        discoveryDate: p.fields['Discovery Date'] || ''
      }));

    return NextResponse.json({
      summary,
      bySource: sourcePerformance,
      byTag: tagPerformance,
      recentWinners
    });
  } catch (error) {
    console.error('Sales insights error:', error);
    return NextResponse.json({ error: 'Failed to fetch sales insights' }, { status: 500 });
  }
}
