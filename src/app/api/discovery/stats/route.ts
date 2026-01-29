import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AIRTABLE_TOKEN = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = 'appRCQASsApV4C33N';
const SCRAPE_LOG_TABLE_ID = 'tbl1Csm5TFd7O3Prw';

const MONTHLY_CREDITS_LIMIT = 250000; // Default limit

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
    // Get current month's start date
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartISO = monthStart.toISOString().split('T')[0];

    // Fetch all logs for this month with pagination
    const allRecords: Array<{ fields: Record<string, unknown> }> = [];
    let offset: string | undefined;

    do {
      const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${SCRAPE_LOG_TABLE_ID}`);
      url.searchParams.set('filterByFormula', `IS_AFTER({Timestamp}, '${monthStartISO}')`);
      if (offset) {
        url.searchParams.set('offset', offset);
      }

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }

      const data = await response.json();
      allRecords.push(...(data.records || []));
      offset = data.offset; // Will be undefined if no more pages
    } while (offset);

    const records = allRecords;

    // Calculate stats
    let totalSearches = 0;
    let totalCreditsUsed = 0;
    let totalProductsAdded = 0;
    let totalResultsFound = 0;

    const byStore: Record<string, { searches: number; credits: number; productsAdded: number }> = {};
    const byOperator: Record<string, { searches: number; credits: number; productsAdded: number }> = {};
    const recentActivity: Array<{
      timestamp: string;
      action: string;
      query: string;
      resultsCount: number;
      productsAdded: number;
      operator: string;
      store: string;
    }> = [];

    for (const record of records) {
      const fields = record.fields;
      const action = String(fields['Action'] || 'Unknown');
      const creditsUsed = Number(fields['Credits Used']) || 0;
      const productsAdded = Number(fields['Products Added']) || 0;
      const resultsCount = Number(fields['Results Count']) || 0;
      const store = String(fields['Store'] || 'Unknown');
      const operator = String(fields['Operator'] || 'Unknown');

      if (action === 'Search') {
        totalSearches++;
      }
      totalCreditsUsed += creditsUsed;
      totalProductsAdded += productsAdded;
      totalResultsFound += resultsCount;

      // By store
      if (!byStore[store]) {
        byStore[store] = { searches: 0, credits: 0, productsAdded: 0 };
      }
      byStore[store].searches++;
      byStore[store].credits += creditsUsed;
      byStore[store].productsAdded += productsAdded;

      // By operator
      if (!byOperator[operator]) {
        byOperator[operator] = { searches: 0, credits: 0, productsAdded: 0 };
      }
      byOperator[operator].searches++;
      byOperator[operator].credits += creditsUsed;
      byOperator[operator].productsAdded += productsAdded;

      // Recent activity (last 20)
      if (recentActivity.length < 20) {
        recentActivity.push({
          timestamp: String(fields['Timestamp'] || ''),
          action,
          query: String(fields['Query'] || ''),
          resultsCount,
          productsAdded,
          operator,
          store
        });
      }
    }

    // Sort recent activity by timestamp descending
    recentActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({
      thisMonth: {
        totalSearches,
        totalCreditsUsed,
        totalProductsAdded,
        totalResultsFound,
        creditsLimit: MONTHLY_CREDITS_LIMIT,
        creditsRemaining: MONTHLY_CREDITS_LIMIT - totalCreditsUsed,
        usagePercent: Math.round((totalCreditsUsed / MONTHLY_CREDITS_LIMIT) * 1000) / 10
      },
      byStore,
      byOperator,
      recentActivity
    });
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
