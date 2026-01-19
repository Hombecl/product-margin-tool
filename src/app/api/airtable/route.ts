import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fields, customConfig } = body;

    // Priority: custom config from client > environment variables
    const apiKey = customConfig?.apiKey || process.env.AIRTABLE_API_KEY;
    const baseId = customConfig?.baseId || process.env.AIRTABLE_BASE_ID;
    const tableName = customConfig?.tableName || process.env.AIRTABLE_TABLE_NAME || 'Product Research';

    if (!apiKey || !baseId) {
      return NextResponse.json(
        {
          error: 'Missing Airtable configuration',
          needsConfig: true,
          message: 'Please configure Airtable API Key and Base ID in settings'
        },
        { status: 400 }
      );
    }

    const response = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields,
          typecast: true
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { error: errorData.error?.message || 'Failed to save to Airtable' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ success: true, record: data });

  } catch (error) {
    console.error('Airtable API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Health check endpoint - returns whether env vars are configured
export async function GET() {
  const hasEnvConfig = !!(process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID);

  return NextResponse.json({
    configured: hasEnvConfig,
    tableName: process.env.AIRTABLE_TABLE_NAME || 'Product Research'
  });
}
