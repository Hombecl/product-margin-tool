import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AUTH_COOKIE_NAME = 'profit-scout-auth';

// Airtable config
const PRODUCT_BASE_ID = 'appRCQASsApV4C33N';
const PRODUCT_TABLE_ID = 'tblo1uuy8Nc9CSjX4';

// Predefined retire reasons for manual selection
export const MANUAL_RETIRE_REASONS = [
  'Manual - No Sales',
  'Manual - Bad Category',
  'Manual - Low Margin',
  'Manual - Too Much Competition',
  'Manual - Other'
] as const;

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
  // Check authentication
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { skus, retireReason } = body;

    // Validate input
    if (!skus || !Array.isArray(skus) || skus.length === 0) {
      return NextResponse.json(
        { error: 'SKUs array is required' },
        { status: 400 }
      );
    }

    if (!retireReason || typeof retireReason !== 'string') {
      return NextResponse.json(
        { error: 'Retire reason is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.AIRTABLE_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Airtable not configured' },
        { status: 400 }
      );
    }

    const results: { sku: string; success: boolean; error?: string; recordId?: string }[] = [];

    // Process each SKU
    for (const sku of skus) {
      try {
        // Search for product by SKU
        const searchFormula = `{SKU}='${sku}'`;
        const searchUrl = `https://api.airtable.com/v0/${PRODUCT_BASE_ID}/${PRODUCT_TABLE_ID}?filterByFormula=${encodeURIComponent(searchFormula)}&maxRecords=1`;

        const searchResponse = await fetch(searchUrl, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (!searchResponse.ok) {
          results.push({ sku, success: false, error: 'Search failed' });
          continue;
        }

        const searchData = await searchResponse.json();
        const record = searchData.records?.[0];

        if (!record) {
          results.push({ sku, success: false, error: 'SKU not found' });
          continue;
        }

        // Update Retire Reason
        const updateResponse = await fetch(
          `https://api.airtable.com/v0/${PRODUCT_BASE_ID}/${PRODUCT_TABLE_ID}/${record.id}`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              fields: {
                'Retire Reason': retireReason
              },
              typecast: true
            })
          }
        );

        if (updateResponse.ok) {
          results.push({ sku, success: true, recordId: record.id });
        } else {
          const errorData = await updateResponse.json();
          results.push({ sku, success: false, error: errorData.error?.message || 'Update failed' });
        }

        // Rate limiting - small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (err) {
        results.push({ sku, success: false, error: String(err) });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      message: `Marked ${successCount} products for retire`,
      results,
      summary: {
        total: skus.length,
        success: successCount,
        failed: failedCount
      }
    });

  } catch (error) {
    console.error('Retire API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - Return available retire reasons
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    reasons: MANUAL_RETIRE_REASONS
  });
}
