# n8n UPC Workflow Specification

**Version:** 1.0
**Date:** 2026-01-28
**Purpose:** Detailed specification for the n8n workflow that fetches UPC data and applies filters

---

## Workflow Overview

### Name: `Product UPC Fetch & Validation`

### Trigger
- **Type:** Airtable Trigger (Webhook or Polling)
- **Table:** Product Research (`tblo1uuy8Nc9CSjX4`)
- **Condition:**
  - Status = "Imported - Needs Review"
  - UPC field is empty

### Output
- Updated Airtable record with UPC data
- Status change based on filter results
- Log entry for audit trail

---

## Workflow Nodes

### Node 1: Airtable Trigger

**Type:** `n8n-nodes-base.airtableTrigger` (if using webhooks) or `n8n-nodes-base.airtable` with schedule

**Configuration:**
```json
{
  "operation": "list",
  "base": "appRCQASsApV4C33N",
  "table": "tblo1uuy8Nc9CSjX4",
  "filterByFormula": "AND({Status} = 'Imported - Needs Review', {UPC} = '')",
  "fields": [
    "SKU",
    "Title",
    "Product Cost",
    "Approved Base Price",
    "Primary Supplier Link",
    "Store",
    "Discovery Source"
  ]
}
```

**Alternative - Schedule Trigger:**
```json
{
  "rule": {
    "interval": [{ "field": "minutes", "minutesInterval": 5 }]
  }
}
```

---

### Node 2: Extract Product ID

**Type:** `n8n-nodes-base.code`

**Purpose:** Extract Walmart Product ID from Primary Supplier Link

**Code:**
```javascript
// Extract WM Product ID from URL
// Formats:
// - https://www.walmart.com/ip/Product-Name/123456789
// - https://www.walmart.com/ip/123456789

const items = $input.all();

for (const item of items) {
  const url = item.json['Primary Supplier Link'] || '';

  // Extract product ID from URL
  const patterns = [
    /\/ip\/[^\/]+\/(\d+)/,  // /ip/product-name/123456789
    /\/ip\/(\d+)/,          // /ip/123456789
    /[?&]product_id=(\d+)/, // ?product_id=123456789
  ];

  let productId = null;
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      productId = match[1];
      break;
    }
  }

  item.json.wmProductId = productId;
  item.json.hasValidUrl = !!productId;
}

return items;
```

---

### Node 3: Filter - Has Valid URL

**Type:** `n8n-nodes-base.filter`

**Configuration:**
```json
{
  "conditions": {
    "boolean": [
      {
        "value1": "={{ $json.hasValidUrl }}",
        "value2": true
      }
    ]
  }
}
```

---

### Node 4: ScrapingBee Product API

**Type:** `n8n-nodes-base.httpRequest`

**Configuration:**
```json
{
  "method": "GET",
  "url": "https://app.scrapingbee.com/api/v1/walmart/product",
  "authentication": "none",
  "sendQuery": true,
  "queryParameters": {
    "parameters": [
      {
        "name": "api_key",
        "value": "={{ $env.SCRAPINGBEE_API_KEY }}"
      },
      {
        "name": "product_id",
        "value": "={{ $json.wmProductId }}"
      },
      {
        "name": "delivery_zip",
        "value": "77057"
      }
    ]
  },
  "options": {
    "timeout": 60000,
    "response": {
      "response": {
        "fullResponse": false
      }
    }
  }
}
```

**Expected Response:**
```json
{
  "product": {
    "id": "123456789",
    "upc": "012345678901",
    "gtin": "00012345678901",
    "title": "Product Title",
    "brand": "Brand Name",
    "manufacturer": "Manufacturer Name",
    "price": 19.99,
    "in_stock": true,
    "stock_quantity": 50,
    "seller": {
      "name": "Walmart.com",
      "type": "1P"
    },
    "third_party_sellers": 0,
    "fulfillment": {
      "delivery": true,
      "pickup": true,
      "shipping": true,
      "free_shipping": true
    }
  }
}
```

---

### Node 5: Parse Product Data

**Type:** `n8n-nodes-base.code`

**Purpose:** Parse ScrapingBee response and prepare data for Airtable

**Code:**
```javascript
const items = $input.all();

for (const item of items) {
  const product = item.json.product || item.json;
  const originalData = $('Extract Product ID').first().json;

  // Extract UPC data
  item.json.upc = product.upc || '';
  item.json.gtin = product.gtin || '';
  item.json.brand = product.brand || '';
  item.json.manufacturer = product.manufacturer || '';

  // Extract stock data
  item.json.currentPrice = product.price || 0;
  item.json.inStock = product.in_stock !== false;
  item.json.stockQuantity = product.stock_quantity || 0;

  // Check for low stock
  const lowStockThreshold = 5;
  item.json.isLowStock = item.json.stockQuantity < lowStockThreshold && item.json.stockQuantity > 0;
  item.json.isOutOfStock = !item.json.inStock || item.json.stockQuantity === 0;

  // Extract seller data
  const seller = product.seller || {};
  item.json.sellerName = seller.name || 'Unknown';
  item.json.isWalmartSeller = item.json.sellerName.toLowerCase().includes('walmart');

  // 3P competition
  item.json.thirdPartySellers = product.third_party_sellers || 0;
  item.json.has3PCompetition = item.json.thirdPartySellers > 0;

  // Price change check
  const originalCost = originalData['Product Cost'] || 0;
  const priceChangePercent = originalCost > 0
    ? Math.abs((item.json.currentPrice - originalCost) / originalCost * 100)
    : 0;
  item.json.priceChangePercent = priceChangePercent;
  item.json.significantPriceChange = priceChangePercent > 10;

  // Carry forward original data
  item.json.recordId = originalData.id;
  item.json.sku = originalData.SKU;
  item.json.title = originalData.Title;
  item.json.productCost = originalCost;
  item.json.approvedBasePrice = originalData['Approved Base Price'] || 0;
  item.json.store = originalData.Store;
}

return items;
```

---

### Node 6: Apply Filter Rules

**Type:** `n8n-nodes-base.code`

**Purpose:** Determine filter result and new status

**Code:**
```javascript
const items = $input.all();

// Filter configuration (can be moved to environment variables)
const config = {
  minMarginPercent: 15,
  minStockQuantity: 5,
  allow3PCompetition: false,
  maxPriceChangePercent: 10,
  autoExcludeLowStock: true,
  autoExclude3P: true,
  excludedBrands: [
    'Great Value',
    'Equate',
    'Mainstays',
    "Parent's Choice",
    "Sam's Choice",
    "ol' roy",
    'Special Kitty'
  ]
};

for (const item of items) {
  const reasons = [];
  let filterResult = 'passed';
  let newStatus = '1.1 Ready to Upload to WM - UPC Fetched';

  // Check 1: Out of Stock
  if (item.json.isOutOfStock) {
    filterResult = 'excluded';
    newStatus = 'Closed - Low Stock/OOS';
    reasons.push('Product is out of stock');
  }

  // Check 2: Low Stock
  else if (config.autoExcludeLowStock && item.json.isLowStock) {
    filterResult = 'excluded';
    newStatus = 'Closed - Low Stock/OOS';
    reasons.push(`Low stock: ${item.json.stockQuantity} units`);
  }

  // Check 3: Not sold by Walmart
  else if (config.autoExclude3P && !item.json.isWalmartSeller) {
    filterResult = 'excluded';
    newStatus = 'Removed';
    reasons.push(`3P seller: ${item.json.sellerName}`);
  }

  // Check 4: 3P Competition
  else if (!config.allow3PCompetition && item.json.has3PCompetition) {
    filterResult = 'flagged';
    newStatus = 'Pending Review';
    reasons.push(`Has ${item.json.thirdPartySellers} third-party sellers`);
  }

  // Check 5: Excluded Brand
  else if (config.excludedBrands.some(brand =>
    item.json.brand.toLowerCase().includes(brand.toLowerCase())
  )) {
    filterResult = 'excluded';
    newStatus = 'Removed';
    reasons.push(`Excluded brand: ${item.json.brand}`);
  }

  // Check 6: Significant Price Change
  else if (item.json.significantPriceChange) {
    filterResult = 'flagged';
    newStatus = 'Pending Review';
    reasons.push(`Price changed ${item.json.priceChangePercent.toFixed(1)}%`);
  }

  // Check 7: UPC not found
  else if (!item.json.upc && !item.json.gtin) {
    filterResult = 'flagged';
    newStatus = 'Pending Review';
    reasons.push('UPC/GTIN not found');
  }

  // Calculate margin for validation
  const platformFeePercent = 10.5;
  const additionalCost = 4.50;
  const cost = item.json.productCost;
  const price = item.json.approvedBasePrice;
  const platformFee = price * (platformFeePercent / 100);
  const margin = price - cost - additionalCost - platformFee;
  const marginPercent = price > 0 ? (margin / price * 100) : 0;

  item.json.calculatedMarginPercent = marginPercent;

  // Check 8: Low margin
  if (filterResult === 'passed' && marginPercent < config.minMarginPercent) {
    filterResult = 'flagged';
    newStatus = 'Pending Review';
    reasons.push(`Low margin: ${marginPercent.toFixed(1)}%`);
  }

  item.json.filterResult = filterResult;
  item.json.filterReasons = reasons;
  item.json.newStatus = newStatus;
}

return items;
```

---

### Node 7: Update Airtable Record

**Type:** `n8n-nodes-base.airtable`

**Configuration:**
```json
{
  "operation": "update",
  "base": "appRCQASsApV4C33N",
  "table": "tblo1uuy8Nc9CSjX4",
  "id": "={{ $json.recordId }}",
  "fields": {
    "UPC": "={{ $json.upc }}",
    "GTIN": "={{ $json.gtin }}",
    "Brand": "={{ $json.brand }}",
    "Scrape Price": "={{ $json.currentPrice }}",
    "Scrape Seller Name": "={{ $json.sellerName }}",
    "Scrape Out of Stock": "={{ $json.isOutOfStock }}",
    "Scrape Low Stock Message": "={{ $json.isLowStock ? 'Low stock: ' + $json.stockQuantity + ' units' : '' }}",
    "Status": "={{ $json.newStatus }}",
    "Remarks": "={{ $json.filterResult !== 'passed' ? 'Auto-filter: ' + $json.filterReasons.join('; ') : '' }}"
  }
}
```

---

### Node 8: Log to Scrape Log (Optional)

**Type:** `n8n-nodes-base.airtable`

**Configuration:**
```json
{
  "operation": "create",
  "base": "appRCQASsApV4C33N",
  "table": "tbl1Csm5TFd7O3Prw",
  "fields": {
    "Timestamp": "={{ $now.toISO() }}",
    "Action": "UPC Fetch",
    "Query": "={{ $json.sku }}",
    "Results Count": 1,
    "Credits Used": 10,
    "Operator": "n8n-automation",
    "Store": "={{ $json.store }}",
    "Products Added": 0
  }
}
```

---

## Error Handling

### Node: Error Handler

**Type:** `n8n-nodes-base.code`

**Trigger:** On error from ScrapingBee API

**Code:**
```javascript
const items = $input.all();
const originalData = $('Extract Product ID').first().json;

// Log error and update status
return [{
  json: {
    recordId: originalData.id,
    error: true,
    errorMessage: items[0].json.message || 'Unknown error',
    newStatus: 'Pending Review'
  }
}];
```

### Node: Update on Error

**Type:** `n8n-nodes-base.airtable`

**Configuration:**
```json
{
  "operation": "update",
  "base": "appRCQASsApV4C33N",
  "table": "tblo1uuy8Nc9CSjX4",
  "id": "={{ $json.recordId }}",
  "fields": {
    "Status": "Pending Review",
    "Remarks": "UPC fetch failed: {{ $json.errorMessage }}"
  }
}
```

---

## Workflow Diagram

```
┌─────────────────────┐
│  Airtable Trigger   │
│  (New records with  │
│   Status: Imported) │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Extract Product ID │
│  (Code node)        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐     ┌─────────────────────┐
│  Filter: Has Valid  │────▶│  Update: Mark Error │
│  URL?               │ No  │  Status             │
└──────────┬──────────┘     └─────────────────────┘
           │ Yes
           ▼
┌─────────────────────┐     ┌─────────────────────┐
│  ScrapingBee        │────▶│  Error Handler      │
│  Product API        │Error│  (Update status)    │
└──────────┬──────────┘     └─────────────────────┘
           │ Success
           ▼
┌─────────────────────┐
│  Parse Product Data │
│  (Code node)        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Apply Filter Rules │
│  (Code node)        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Update Airtable    │
│  (UPC + Status)     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Log to Scrape Log  │
│  (Optional)         │
└─────────────────────┘
```

---

## Environment Variables Required

| Variable | Description |
|----------|-------------|
| `SCRAPINGBEE_API_KEY` | ScrapingBee API key |
| `AIRTABLE_API_KEY` | Airtable personal access token |

---

## Testing Checklist

- [ ] Test with product that has UPC available
- [ ] Test with product that has no UPC
- [ ] Test with out-of-stock product
- [ ] Test with low stock product (<5 units)
- [ ] Test with 3P seller product
- [ ] Test with excluded brand (e.g., Great Value)
- [ ] Test with significant price change (>10%)
- [ ] Test with low margin product (<15%)
- [ ] Test error handling (invalid product ID)
- [ ] Test rate limiting behavior

---

## Scheduling Recommendations

| Option | Frequency | Use Case |
|--------|-----------|----------|
| Webhook | Real-time | Low volume, immediate processing |
| Poll every 5 min | Every 5 minutes | Medium volume |
| Poll every 15 min | Every 15 minutes | High volume, cost-conscious |
| Manual trigger | On-demand | Testing, batch processing |

---

## Cost Estimation

- ScrapingBee credits: ~10 credits per product lookup
- Airtable API: Free (within limits)
- Estimated monthly cost for 1000 products: ~10,000 credits

---

**Document Version History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-28 | Claude | Initial specification |
