import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { extractProductId, buildDuplicateCheckFormula } from '@/lib/extractProductId';

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

// Check if product already exists in Airtable
async function checkDuplicate(
  apiKey: string,
  baseId: string,
  tableName: string,
  productId: string
): Promise<{ isDuplicate: boolean; existingRecord?: { id: string; lister?: string; date?: string } }> {
  const formula = buildDuplicateCheckFormula(productId);
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`
    }
  });

  if (!response.ok) {
    // If search fails, allow the save to proceed (fail open for better UX)
    console.error('Duplicate check failed:', await response.text());
    return { isDuplicate: false };
  }

  const data = await response.json();

  if (data.records && data.records.length > 0) {
    const record = data.records[0];
    return {
      isDuplicate: true,
      existingRecord: {
        id: record.id,
        lister: record.fields?.Lister,
        date: record.fields?.Date
      }
    };
  }

  return { isDuplicate: false };
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
    const { fields, customConfig, supplierLink, platform } = body;

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

    // Extract Product ID from supplier link
    const productIdResult = extractProductId(supplierLink || fields['Primary Supplier Link'] || '');
    const productId = productIdResult.productId;

    // Check for duplicates if we have a valid product ID
    if (productId) {
      const duplicateCheck = await checkDuplicate(apiKey, baseId, tableName, productId);

      if (duplicateCheck.isDuplicate) {
        return NextResponse.json(
          {
            error: 'Duplicate product',
            isDuplicate: true,
            productId,
            platform: productIdResult.platform,
            existingRecord: duplicateCheck.existingRecord,
            message: `This product (${productIdResult.platform === 'walmart' ? 'Walmart ID' : 'ASIN'}: ${productId}) was already added${duplicateCheck.existingRecord?.lister ? ` by ${duplicateCheck.existingRecord.lister}` : ''}${duplicateCheck.existingRecord?.date ? ` on ${duplicateCheck.existingRecord.date}` : ''}`
          },
          { status: 409 } // Conflict
        );
      }

      // Add Product ID to fields for future duplicate checks
      fields['Product ID'] = productId;
    }

    // Save to Airtable
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
    return NextResponse.json({
      success: true,
      record: data,
      productId,
      platform: productIdResult.platform
    });

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
  // Check authentication first
  if (!(await isAuthenticated())) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const hasEnvConfig = !!(process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID);

  return NextResponse.json({
    configured: hasEnvConfig,
    tableName: process.env.AIRTABLE_TABLE_NAME || 'Product Research'
  });
}
