import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AUTH_COOKIE_NAME = 'profit-scout-auth';

// Verify authentication
async function isAuthenticated(): Promise<boolean> {
  const correctPassword = process.env.APP_PASSWORD;
  if (!correctPassword) return false;

  const cookieStore = await cookies();
  const authCookie = cookieStore.get(AUTH_COOKIE_NAME);
  const expectedToken = Buffer.from(correctPassword).toString('base64');

  return authCookie?.value === expectedToken;
}

export async function POST(request: NextRequest) {
  // Check authentication first
  if (!(await isAuthenticated())) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { sku, store, targetPrice, productCost, competitorPrice, undercut, marginPercent, priceSource } = body;

    // Get Airtable config from environment
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_REPRICING_BASE_ID || process.env.AIRTABLE_BASE_ID;
    const tableName = process.env.AIRTABLE_REPRICING_TABLE_NAME || 'Price Schedule';

    if (!apiKey || !baseId) {
      return NextResponse.json(
        { error: 'Airtable not configured', needsConfig: true },
        { status: 400 }
      );
    }

    // First, check if record exists (search by SKU + Store)
    const searchFormula = `AND({SKU}='${sku}', {Store}='${store}')`;
    const searchUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?filterByFormula=${encodeURIComponent(searchFormula)}&maxRecords=1`;

    const searchResponse = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!searchResponse.ok) {
      const errorData = await searchResponse.json();
      return NextResponse.json(
        { error: errorData.error?.message || 'Failed to search Airtable' },
        { status: searchResponse.status }
      );
    }

    const searchData = await searchResponse.json();
    const existingRecord = searchData.records?.[0];

    // Prepare fields for upsert
    const fields: Record<string, unknown> = {
      'SKU': sku,
      'Store': store,
      'Target Price': targetPrice,
      'Status': 'Pending',
      'Updated By': 'Repricing Calculator'
    };

    let response;

    if (existingRecord) {
      // Update existing record
      response = await fetch(
        `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${existingRecord.id}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ fields, typecast: true })
        }
      );
    } else {
      // Create new record
      response = await fetch(
        `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ fields, typecast: true })
        }
      );
    }

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { error: errorData.error?.message || 'Failed to save to Airtable' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({
      success: true,
      record: data,
      isUpdate: !!existingRecord
    });

  } catch (error) {
    console.error('Repricing API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hasConfig = !!(process.env.AIRTABLE_API_KEY && (process.env.AIRTABLE_REPRICING_BASE_ID || process.env.AIRTABLE_BASE_ID));

  return NextResponse.json({
    configured: hasConfig,
    tableName: process.env.AIRTABLE_REPRICING_TABLE_NAME || 'Price Schedule'
  });
}
