# Pre-publish Validation System - Technical Specification

**Version:** 1.0
**Date:** 2026-01-28
**Purpose:** Document the architecture and requirements for validating products before publishing to Walmart

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Current Architecture](#2-current-architecture)
3. [Airtable Data Model](#3-airtable-data-model)
4. [Pre-publish Validation Workflow](#4-pre-publish-validation-workflow)
5. [UPC Workflow Enhancement](#5-upc-workflow-enhancement)
6. [Filter Criteria & Exclusion Rules](#6-filter-criteria--exclusion-rules)
7. [Implementation Phases](#7-implementation-phases)
8. [API Specifications](#8-api-specifications)

---

## 1. System Overview

### 1.1 Current Problem

Products discovered via Product Discovery are added directly to Airtable without a formal validation step before publishing to Walmart. This creates risks:

- Products with insufficient margin may be published
- No human review checkpoint before going live
- Missing UPC/product data may cause upload failures
- Products with 3P seller competition may have unpredictable pricing
- Low stock products may go OOS immediately after listing

### 1.2 Proposed Solution

Implement a **Pre-publish Validation System** with three components:

1. **Validation Checkpoint** - Automated checks before publishing
2. **Enhanced UPC Workflow** - Fetch additional data (stock, sales, competition)
3. **Filter Mechanism** - Exclude problematic products automatically

### 1.3 High-Level Flow

```
Product Discovery → Airtable (Status: "Imported - Needs Review")
                           ↓
                    UPC Workflow (n8n)
                    - Fetch UPC/GTIN
                    - Fetch stock status
                    - Fetch monthly sales estimate
                    - Fetch 3P seller info
                           ↓
                    Auto-Filter (n8n)
                    - Exclude low stock
                    - Exclude 3P competition
                    - Exclude low margin
                           ↓
                    Status Update: "1.1 Ready to Upload to WM - UPC Fetched"
                           ↓
                    Human Review (Profit Scout UI or Airtable)
                    - Verify margin
                    - Approve/Reject/Reprice
                           ↓
                    Status Update: "1.2 Ready to Upload to WM - Flat File Ready"
                           ↓
                    Walmart Upload (n8n)
```

---

## 2. Current Architecture

### 2.1 Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | Next.js + React | Product Discovery UI |
| Backend | Next.js API Routes | Discovery, Add, Stats APIs |
| Database | Airtable | Product storage, Orders, Logs |
| Scraping | ScrapingBee | Walmart product data |
| Automation | n8n | UPC workflow, stock monitoring |

### 2.2 Current Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     PRODUCT DISCOVERY                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User Input (Keyword/Category)                                   │
│       ↓                                                          │
│  /api/discovery/search  ──→  ScrapingBee Walmart API            │
│  /api/discovery/category                                         │
│       ↓                                                          │
│  Filter (Price, Rating, Seller)                                  │
│       ↓                                                          │
│  Deduplication Check ──→ Airtable (WM Product ID lookup)        │
│       ↓                                                          │
│  User Selection (with margin calculation)                        │
│       ↓                                                          │
│  /api/discovery/add ──→ Airtable Product Table                  │
│       │                                                          │
│       └──→ Scrape Log Table (audit trail)                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Current API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/discovery/search` | POST | Keyword search via ScrapingBee |
| `/api/discovery/category` | POST | Category browse via ScrapingBee |
| `/api/discovery/details` | POST | Fetch UPC, GTIN, stock info |
| `/api/discovery/add` | POST | Add products to Airtable |
| `/api/discovery/stats` | GET | Usage statistics |
| `/api/discovery/sales-insights` | GET | Sales performance analytics |

### 2.4 Key Limitations

1. **UPC not persisted** - Fetched via `/api/discovery/details` but NOT saved to Airtable
2. **No validation step** - Products go directly from Discovery to Airtable
3. **No n8n integration in codebase** - n8n workflows are external
4. **Status not set properly** - Products added with no initial status for validation

---

## 3. Airtable Data Model

### 3.1 Product Table (`tblo1uuy8Nc9CSjX4`)

**Base ID:** `appRCQASsApV4C33N`

#### Key Fields for Validation

| Field Name | Type | Purpose | Used In Validation |
|------------|------|---------|-------------------|
| `SKU` | singleLineText | Product identifier | ✓ Required |
| `Title` | singleLineText | Product name | ✓ Required |
| `Product Cost` | number | Supplier cost | ✓ Margin calc |
| `Approved Base Price` | currency | Selling price | ✓ Margin calc |
| `Margin%` | formula | Calculated margin | ✓ Threshold check |
| `Status` | singleSelect | Product lifecycle | ✓ Workflow state |
| `Store` | singleSelect | Store assignment | ✓ Required |
| `Primary Supplier Link` | url | Walmart product URL | ✓ Required |
| `WM Product ID` | formula | Extracted from URL | ✓ Deduplication |
| `Discovery Source` | singleLineText | Origin of discovery | Tracking |
| `Discovery Date` | dateTime | When discovered | Tracking |

#### UPC/Product Data Fields (Need Population)

| Field Name | Type | Current State | Enhancement |
|------------|------|---------------|-------------|
| `UPC` | (needs creation) | Not exists | Create & populate |
| `GTIN` | (needs creation) | Not exists | Create & populate |
| `Brand` | singleLineText | Empty | Populate from ScrapingBee |
| `Manufacturer` | (needs creation) | Not exists | Create & populate |

#### Stock/Competition Fields (Need Creation)

| Field Name | Type | Purpose |
|------------|------|---------|
| `Scrape Low Stock Message` | singleLineText | Stock status indicator |
| `Scrape Out of Stock` | checkbox | OOS flag |
| `Scrape Seller Name` | singleLineText | Current seller |
| `Scrape Price` | currency | Current price |
| `Has 3P Competition` | (needs creation) | checkbox | 3P seller presence |
| `Estimated Monthly Sales` | (needs creation) | number | Sales estimate |

#### Status Values (Existing)

| Status | Description | Use in Workflow |
|--------|-------------|-----------------|
| `Imported - Needs Review` | Just added from Discovery | Entry point |
| `Pending Review` | Awaiting human review | Validation queue |
| `1.1 Ready to Upload to WM - UPC Fetched` | UPC data retrieved | After n8n UPC fetch |
| `1.2 Ready to Upload to WM - Flat File Ready` | Human approved | Ready for upload |
| `Ready to Upload to WM` | Legacy ready status | Upload queue |
| `Approved - Live` | Published and active | Active listing |

### 3.2 Scrape Log Table (`tbl1Csm5TFd7O3Prw`)

Used for audit trail of all discovery activities.

| Field | Type | Purpose |
|-------|------|---------|
| `Timestamp` | dateTime | When action occurred |
| `Action` | singleLineText | Search, Category Browse, Details Fetch |
| `Query` | singleLineText | Search term or category |
| `Results Count` | number | Products found |
| `Credits Used` | number | ScrapingBee credits |
| `Operator` | singleLineText | User who performed action |
| `Products Added` | number | Products saved to Airtable |
| `Session ID` | singleLineText | Session tracking |

---

## 4. Pre-publish Validation Workflow

### 4.1 Validation States

```
┌──────────────────────┐
│ Imported - Needs     │  ← Products from Discovery
│ Review               │
└──────────┬───────────┘
           ↓
    [n8n UPC Workflow]
           ↓
┌──────────────────────┐
│ 1.1 Ready to Upload  │  ← UPC fetched, auto-filters applied
│ - UPC Fetched        │
└──────────┬───────────┘
           ↓
    [Human Review]
    ├── Approve → Status: "1.2 Ready to Upload - Flat File Ready"
    ├── Reprice → Adjust price, then approve
    └── Reject  → Status: "Removed" or specific closure reason
           ↓
┌──────────────────────┐
│ 1.2 Ready to Upload  │  ← Human approved
│ - Flat File Ready    │
└──────────┬───────────┘
           ↓
    [n8n Upload Workflow]
           ↓
┌──────────────────────┐
│ Approved - Live      │  ← Published on Walmart
└──────────────────────┘
```

### 4.2 Validation Checkpoints

#### Checkpoint 1: Automated (n8n)

| Check | Criteria | Action if Fail |
|-------|----------|----------------|
| UPC Available | UPC or GTIN exists | Flag for manual review |
| Stock Status | Not low stock/OOS | Auto-exclude or flag |
| 3P Sellers | No 3P competition | Auto-exclude or flag |
| Price Stability | Price hasn't changed >10% | Flag for review |
| Seller Check | Sold by Walmart.com | Auto-exclude if 3P |

#### Checkpoint 2: Human Review (UI)

| Review Item | Action Options |
|-------------|----------------|
| Margin Verification | Approve / Adjust price / Reject |
| Product Suitability | Approve / Reject with reason |
| Brand Check | Approve / Flag as restricted |
| Pricing Approval | Approve / Reprice |

### 4.3 Margin Validation Rules

```
Target Margin: ≥ 15%

Margin% = (Approved Base Price - Product Cost - Platform Fee - Additional Cost)
          / Approved Base Price × 100

Where:
- Platform Fee = 10.5% of Approved Base Price (configurable)
- Additional Cost = $4.50 (configurable - shipping, handling)

Validation Thresholds:
- Green (Auto-approve): Margin% ≥ 20%
- Yellow (Review): 15% ≤ Margin% < 20%
- Red (Reject/Reprice): Margin% < 15%
```

---

## 5. UPC Workflow Enhancement

### 5.1 Current UPC Fetch (ScrapingBee)

The `/api/discovery/details` endpoint currently fetches:

```typescript
// From ScrapingBee Walmart Product API
{
  upc: string,
  gtin: string,
  inStock: boolean,
  stockQuantity: number,
  brand: string,
  manufacturer: string,
  modelNumber: string,
  thirdPartySellers: number,
  hasCompetition: boolean,
  fulfillment: {
    delivery: boolean,
    pickup: boolean,
    shipping: boolean,
    free_shipping: boolean
  }
}
```

**Problem:** This data is displayed in UI but NOT saved to Airtable.

### 5.2 Enhanced UPC Workflow Requirements

#### Data to Fetch (via n8n)

| Data Point | Source | Field in Airtable |
|------------|--------|-------------------|
| UPC | ScrapingBee Product API | `UPC` (new field) |
| GTIN | ScrapingBee Product API | `GTIN` (new field) |
| Brand | ScrapingBee Product API | `Brand` |
| Current Price | ScrapingBee Product API | `Scrape Price` |
| Stock Status | ScrapingBee Product API | `Scrape Low Stock Message` |
| Out of Stock | ScrapingBee Product API | `Scrape Out of Stock` |
| Seller Name | ScrapingBee Product API | `Scrape Seller Name` |
| 3P Sellers Count | ScrapingBee Product API | `Has 3P Competition` (new) |
| Monthly Sales Est. | (External API or estimate) | `Estimated Monthly Sales` (new) |

#### n8n Workflow Trigger

```
Trigger: Airtable Record Created/Updated
Filter: Status = "Imported - Needs Review" AND UPC is empty

Steps:
1. Get record details from Airtable
2. Extract WM Product ID from Primary Supplier Link
3. Call ScrapingBee Walmart Product API
4. Parse response for UPC, stock, seller data
5. Apply auto-filter rules (see Section 6)
6. Update Airtable record with fetched data
7. Update Status based on filter results
```

### 5.3 ScrapingBee API Call (n8n)

```
URL: https://app.scrapingbee.com/api/v1/walmart/product

Parameters:
- api_key: {{$env.SCRAPINGBEE_API_KEY}}
- product_id: {{product_id_from_airtable}}
- delivery_zip: 77057

Response fields to extract:
- product.upc
- product.gtin
- product.brand
- product.manufacturer
- product.price
- product.in_stock
- product.stock_quantity
- product.seller_name
- product.third_party_sellers
```

### 5.4 Monthly Sales Estimation

**Option A: Jungle Scout / Helium 10 API** (if available)
- Provides estimated monthly sales for Walmart products

**Option B: Calculate from order history**
- Use existing Orders table data
- Formula: `Total Sold Units / Days Since First Order × 30`

**Option C: Use Sales Velocity field**
- Already calculated in Airtable
- `Sales Velocity` = units/day average

---

## 6. Filter Criteria & Exclusion Rules

### 6.1 Auto-Exclusion Rules (n8n)

Products matching these criteria should be automatically excluded or flagged:

| Rule | Criteria | Action |
|------|----------|--------|
| Low Stock | `stock_quantity < 5` OR low stock message present | Exclude |
| Out of Stock | `in_stock = false` OR `out_of_stock = true` | Exclude |
| 3P Seller | `seller_name` not contains "Walmart" | Exclude |
| 3P Competition | `third_party_sellers > 0` | Flag for review |
| Price Changed | Current price differs from `Product Cost` by >10% | Flag for review |
| Low Margin | Calculated margin < 15% | Exclude or reprice |

### 6.2 Auto-Exclusion Status Updates

| Scenario | New Status |
|----------|------------|
| Low stock detected | `Closed - Low Stock/OOS` |
| Out of stock | `Closed - Low Stock/OOS` |
| 3P seller (not Walmart) | `Removed` with note |
| Margin too low | `Pending Review` (for repricing) |
| All checks pass | `1.1 Ready to Upload to WM - UPC Fetched` |

### 6.3 Filter Configuration (Recommended Airtable Fields)

Create a **Settings** table for configurable filters:

| Setting | Default Value | Description |
|---------|---------------|-------------|
| `Min Margin Percent` | 15 | Minimum acceptable margin |
| `Min Stock Quantity` | 5 | Minimum stock to proceed |
| `Allow 3P Competition` | false | Whether to allow 3P sellers |
| `Max Price Change Percent` | 10 | Alert if price changed |
| `Auto Exclude Low Stock` | true | Automatic exclusion |
| `Auto Exclude 3P` | true | Automatic exclusion |

### 6.4 Brand Exclusion (Existing)

Already implemented in Product Discovery:

```typescript
const defaultExcludedBrands = [
  'Great Value',
  'Equate',
  'Mainstays',
  "Parent's Choice",
  "Sam's Choice",
  "ol' roy",
  'Special Kitty'
];
```

These brands should also be excluded in n8n workflow.

---

## 7. Implementation Phases

### Phase 1: Data Model Updates (Airtable)

**Tasks:**
1. Create new fields in Product table:
   - `UPC` (singleLineText)
   - `GTIN` (singleLineText)
   - `Has 3P Competition` (checkbox)
   - `Estimated Monthly Sales` (number)
   - `Manufacturer` (singleLineText)

2. Ensure existing fields are properly used:
   - `Scrape Price`
   - `Scrape Seller Name`
   - `Scrape Low Stock Message`
   - `Scrape Out of Stock`

**Deliverable:** Updated Airtable schema

### Phase 2: n8n UPC Workflow

**Tasks:**
1. Create n8n workflow triggered by new Airtable records
2. Integrate ScrapingBee product API call
3. Parse and store UPC data in Airtable
4. Implement auto-filter logic
5. Update product status based on filters

**Deliverable:** n8n workflow JSON export

### Phase 3: Validation UI (Profit Scout)

**Tasks:**
1. Create validation queue view
   - Filter: Status = "1.1 Ready to Upload to WM - UPC Fetched"
   - Show: SKU, Title, Cost, Price, Margin%, UPC, Stock Status

2. Add action buttons:
   - Approve → Status: "1.2 Ready to Upload - Flat File Ready"
   - Reprice → Open price adjustment modal
   - Reject → Select rejection reason

3. Add margin calculator for repricing

**Deliverable:** New validation component in Profit Scout

### Phase 4: Integration Testing

**Tasks:**
1. Test end-to-end flow from Discovery to Upload Queue
2. Verify n8n workflow triggers correctly
3. Test filter rules with various product scenarios
4. Validate status transitions

**Deliverable:** Test report with results

---

## 8. API Specifications

### 8.1 New API: Update Product Status

**Endpoint:** `POST /api/products/[id]/status`

**Request:**
```typescript
{
  status: string,           // New status value
  note?: string,            // Optional note/reason
  adjustedPrice?: number    // If repricing
}
```

**Response:**
```typescript
{
  success: boolean,
  product: {
    id: string,
    sku: string,
    status: string,
    updatedAt: string
  }
}
```

### 8.2 New API: Get Validation Queue

**Endpoint:** `GET /api/products/validation-queue`

**Query Parameters:**
- `store`: Filter by store
- `status`: Filter by status (default: "1.1 Ready to Upload to WM - UPC Fetched")
- `limit`: Results per page
- `offset`: Pagination offset

**Response:**
```typescript
{
  products: Array<{
    id: string,
    sku: string,
    title: string,
    productCost: number,
    approvedBasePrice: number,
    marginPercent: number,
    upc: string,
    gtin: string,
    stockStatus: string,
    has3PCompetition: boolean,
    status: string
  }>,
  total: number,
  hasMore: boolean
}
```

### 8.3 n8n Webhook: UPC Fetch Complete

**Endpoint:** `POST /api/webhooks/upc-complete`

**Request (from n8n):**
```typescript
{
  recordId: string,
  upc: string,
  gtin: string,
  brand: string,
  stockStatus: string,
  has3PCompetition: boolean,
  currentPrice: number,
  sellerName: string,
  filterResult: 'passed' | 'excluded' | 'flagged',
  filterReason?: string
}
```

**Response:**
```typescript
{
  success: boolean,
  newStatus: string
}
```

---

## Appendix A: Airtable Field IDs Reference

| Field Name | Field ID |
|------------|----------|
| Status | `fldoyqBb8SvsYOWwp` |
| WM Upload Status | `fldZ4eAbxoLDKTZRJ` |
| WM Publish Status | `fldftfdGFFZAqoFC5` |
| Upload Queue | `fld6xDzT0QtnxMpds` |

## Appendix B: Status Transition Matrix

| From Status | To Status | Trigger |
|-------------|-----------|---------|
| (none) | Imported - Needs Review | Product Discovery Add |
| Imported - Needs Review | 1.1 UPC Fetched | n8n UPC workflow complete (pass) |
| Imported - Needs Review | Closed - Low Stock/OOS | n8n filter: low stock |
| Imported - Needs Review | Removed | n8n filter: 3P seller |
| 1.1 UPC Fetched | 1.2 Flat File Ready | Human approval |
| 1.1 UPC Fetched | Removed | Human rejection |
| 1.1 UPC Fetched | Pending Review | Needs repricing |
| 1.2 Flat File Ready | Approved - Live | n8n upload success |

---

**Document Version History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-28 | Claude | Initial document |
