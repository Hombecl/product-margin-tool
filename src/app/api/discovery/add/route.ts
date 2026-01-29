import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AIRTABLE_TOKEN = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = 'appRCQASsApV4C33N';
const PRODUCT_TABLE_ID = 'tblo1uuy8Nc9CSjX4';
const SCRAPE_LOG_TABLE_ID = 'tbl1Csm5TFd7O3Prw';

interface ProductToAdd {
  id: string;
  title: string;
  productCost: number;
  calculatedSellingPrice: number;
  image?: string;
  url?: string;
  rating?: number;
  rating_count?: number;
}

interface AddProductsRequest {
  products: ProductToAdd[];
  store: string;
  discoverySource: string;
  discoveryTags?: string[];
  operator: string;
  sessionId: string;
}

// Check existing products in Airtable - process in batches to avoid URL length limits
async function checkExistingProducts(productIds: string[]): Promise<Set<string>> {
  if (!AIRTABLE_TOKEN || productIds.length === 0) return new Set();

  const existingIds = new Set<string>();
  const batchSize = 30; // Safe batch size to avoid URL length limits

  // Process in batches
  for (let i = 0; i < productIds.length; i += batchSize) {
    const batch = productIds.slice(i, i + batchSize);
    const idChecks = batch.map(id => `{WM Product ID} = '${id}'`).join(', ');
    const formula = `OR(${idChecks})`;

    try {
      const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PRODUCT_TABLE_ID}`);
      url.searchParams.set('filterByFormula', formula);
      url.searchParams.set('fields[]', 'WM Product ID');

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        for (const record of data.records || []) {
          const wmProductId = record.fields['WM Product ID'];
          if (wmProductId) {
            existingIds.add(wmProductId);
          }
        }
      }

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < productIds.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } catch (error) {
      console.error('Error checking batch:', error);
    }
  }

  return existingIds;
}

async function updateScrapeLog(sessionId: string, productsAdded: number) {
  if (!AIRTABLE_TOKEN || !sessionId) return;

  try {
    // Find the log record by session ID
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${SCRAPE_LOG_TABLE_ID}`);
    url.searchParams.set('filterByFormula', `{Session ID} = '${sessionId}'`);
    url.searchParams.set('sort[0][field]', 'Timestamp');
    url.searchParams.set('sort[0][direction]', 'desc');
    url.searchParams.set('maxRecords', '1');

    const findResponse = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`
      }
    });

    if (findResponse.ok) {
      const data = await findResponse.json();
      if (data.records && data.records.length > 0) {
        const recordId = data.records[0].id;
        const currentAdded = data.records[0].fields['Products Added'] || 0;

        // Update the record
        await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${SCRAPE_LOG_TABLE_ID}/${recordId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fields: {
              'Products Added': currentAdded + productsAdded
            }
          })
        });
      }
    }
  } catch (error) {
    console.error('Error updating scrape log:', error);
  }
}

function generateDiscoverySKU(store: string, sequence: number): string {
  // Format: DISC-{Store}-{4-digit sequence}
  const paddedSequence = sequence.toString().padStart(4, '0');
  return `DISC-${store}-${paddedSequence}`;
}

export async function POST(request: NextRequest) {
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
    const body: AddProductsRequest = await request.json();
    const { products, store, discoverySource, discoveryTags = [], operator, sessionId } = body;

    if (!products || products.length === 0) {
      return NextResponse.json({ error: 'No products to add' }, { status: 400 });
    }

    if (!store) {
      return NextResponse.json({ error: 'Store is required' }, { status: 400 });
    }

    // Check for existing products
    const productIds = products.map(p => p.id);
    const existingIds = await checkExistingProducts(productIds);

    // Filter out existing products
    const newProducts = products.filter(p => !existingIds.has(p.id));

    if (newProducts.length === 0) {
      return NextResponse.json({
        success: true,
        added: 0,
        skipped: products.length,
        message: 'All products already exist in the database'
      });
    }

    // Get current timestamp for sequence
    const timestamp = Date.now();

    // Valid Discovery Tags choices in Airtable
    const validDiscoveryTags = ['Grocery', 'Home', 'Electronics', 'Health', 'Beauty', 'Bestseller', 'High Margin', 'Low Price'];
    const filteredTags = discoveryTags.filter(tag => validDiscoveryTags.includes(tag));

    // Prepare records for Airtable
    // Note: WM Product ID is a formula field that extracts from Primary Supplier Link, so we don't set it directly
    const records = newProducts.map((product, index) => {
      const fields: Record<string, unknown> = {
        'Title': product.title,
        'Product Cost': product.productCost,
        'Approved Base Price': product.calculatedSellingPrice,
        'Store': store,
        'SKU': generateDiscoverySKU(store, (timestamp % 10000) + index),
        'Primary Supplier Link': `https://www.walmart.com/ip/${product.id}`,
        'Discovery Source': discoverySource,
        'Discovery Date': new Date().toISOString(),
        'Lister': 'Auto'
      };

      // Only add Discovery Tags if there are valid tags
      if (filteredTags.length > 0) {
        fields['Discovery Tags'] = filteredTags;
      }

      return { fields };
    });

    // Add to Airtable in batches of 10
    const batchSize = 10;
    const results = [];
    const errors = [];

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      try {
        const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PRODUCT_TABLE_ID}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ records: batch })
        });

        if (response.ok) {
          const data = await response.json();
          results.push(...(data.records || []));
        } else {
          const errorText = await response.text();
          console.error('Airtable batch error:', errorText);
          errors.push({ batch: i / batchSize, error: errorText });
        }
      } catch (error) {
        console.error('Batch error:', error);
        errors.push({ batch: i / batchSize, error: String(error) });
      }

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < records.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Update scrape log with products added count
    await updateScrapeLog(sessionId, results.length);

    return NextResponse.json({
      success: true,
      added: results.length,
      skipped: existingIds.size,
      errors: errors.length > 0 ? errors : undefined,
      message: `Added ${results.length} products, skipped ${existingIds.size} duplicates`
    });
  } catch (error) {
    console.error('Add products error:', error);
    return NextResponse.json({ error: 'Failed to add products' }, { status: 500 });
  }
}
