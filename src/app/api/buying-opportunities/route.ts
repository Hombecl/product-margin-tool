import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AUTH_COOKIE_NAME = 'profit-scout-auth';
const AIRTABLE_BASE_ID = 'appRCQASsApV4C33N';
const AIRTABLE_TABLE_ID = 'tbldotf29PlnIboA0';

// Verify authentication
async function isAuthenticated(): Promise<boolean> {
  const correctPassword = process.env.APP_PASSWORD;
  if (!correctPassword) return false;

  const cookieStore = await cookies();
  const authCookie = cookieStore.get(AUTH_COOKIE_NAME);
  const expectedToken = Buffer.from(correctPassword).toString('base64');

  return authCookie?.value === expectedToken;
}

export async function GET(request: NextRequest) {
  // Check authentication first
  if (!(await isAuthenticated())) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const apiKey = process.env.AIRTABLE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing Airtable API key' },
        { status: 500 }
      );
    }

    // Get filter from query params
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || 'Active';
    const urgency = searchParams.get('urgency');

    // Build filter formula
    let filterFormula = `{Status}='${status}'`;
    if (urgency && urgency !== 'all') {
      filterFormula = `AND({Status}='${status}', {Urgency}='${urgency}')`;
    }

    // Fetch from Airtable
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?filterByFormula=${encodeURIComponent(filterFormula)}&sort[0][field]=Urgency&sort[0][direction]=desc&sort[1][field]=Last%20Check&sort[1][direction]=desc`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      next: { revalidate: 60 } // Cache for 60 seconds
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Airtable API error:', errorData);
      return NextResponse.json(
        { error: errorData.error?.message || 'Failed to fetch from Airtable' },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Transform records for frontend
    const opportunities = data.records.map((record: { id: string; fields: Record<string, unknown> }) => ({
      id: record.id,
      sku: record.fields['SKU'] || '',
      title: record.fields['Product Title'] || '',
      store: record.fields['Store'] || 'Walmart',
      urgency: record.fields['Urgency'] || 'LOW',
      recommendedQty: record.fields['Recommended Qty'] || 0,
      shipperStatus: record.fields['Shipper ZIP Status'] || '',
      shipperEstQty: record.fields['Shipper Est Qty'] || 0,
      oosRegions: record.fields['OOS Regions'] || '',
      lowStockRegions: record.fields['Low Stock Regions'] || '',
      totalRegions: record.fields['Total Regions'] || 7,
      reason: record.fields['Reason'] || '',
      status: record.fields['Status'] || 'Active',
      actionedBy: record.fields['Actioned By'] || null,
      actionedAt: record.fields['Actioned At'] || null,
      qtyPurchased: record.fields['Qty Purchased'] || null,
      walmartLink: record.fields['Walmart Link'] || '',
      lastCheck: record.fields['Last Check'] || '',
      notes: record.fields['Notes'] || ''
    }));

    return NextResponse.json({
      success: true,
      opportunities,
      total: opportunities.length
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Update opportunity status
export async function PATCH(request: NextRequest) {
  // Check authentication first
  if (!(await isAuthenticated())) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { recordId, status, actionedBy, qtyPurchased, notes } = body;

    if (!recordId) {
      return NextResponse.json(
        { error: 'Missing record ID' },
        { status: 400 }
      );
    }

    const apiKey = process.env.AIRTABLE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing Airtable API key' },
        { status: 500 }
      );
    }

    // Build update fields
    const fields: Record<string, unknown> = {};
    if (status) fields['Status'] = status;
    if (actionedBy) fields['Actioned By'] = actionedBy;
    if (qtyPurchased !== undefined) fields['Qty Purchased'] = qtyPurchased;
    if (notes !== undefined) fields['Notes'] = notes;

    // Add timestamp when actioning
    if (status === 'Actioned' || status === 'Skipped') {
      fields['Actioned At'] = new Date().toISOString();
    }

    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${recordId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields, typecast: true })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { error: errorData.error?.message || 'Failed to update record' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({
      success: true,
      record: data
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
