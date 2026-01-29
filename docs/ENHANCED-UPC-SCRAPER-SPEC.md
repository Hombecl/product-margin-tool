# Enhanced UPC Scraper Specification

**Version:** 2.3
**Date:** 2026-01-29
**Workflow:** `Qp9ROvSa0HOR9D81` - Upload product from airtable to walmart - Data Collection (UPC Scraping)

---

## Overview

Enhance the existing "Scrape Walmart & Extract Data" node to collect additional data points for pre-publish validation while maintaining low credit cost.

### API Configuration

```
URL: https://app.scrapingbee.com/api/v1/walmart/product
Parameters:
  - api_key: {API_KEY}
  - product_id: {wmProductId}
  - light_request: true     (keep for low cost)
  - add_html: true          (for HTML parsing)
  - device: desktop
  - delivery_zip: 77057

Credit Cost: ~5-10 credits (vs 15 for full request)
```

---

## Data Fields to Extract

### From API Response (JSON)

| Field | Source Path | Description |
|-------|-------------|-------------|
| `gtin` / `upc` | `data.gtin` or `data.upc` | Product identifier |
| `title` | `data.title` | Product title |
| `price` | `data.price` | Current price |
| `seller_name` | `data.seller_name` | Seller name |
| `out_of_stock` | `data.out_of_stock` | OOS flag |
| `delivery` | `data.fulfillment.delivery` | Delivery available |
| `shipping` | `data.fulfillment.shipping` | Shipping available |

### From `__NEXT_DATA__` Parsing

| Field | Source Path | Description |
|-------|-------------|-------------|
| `averageRating` | `product.averageRating` | Product rating (1-5) |
| `numberOfReviews` | `product.numberOfReviews` | Review count |
| `brand` | `product.brand` | Brand name |
| `transactableOfferCount` | `product.transactableOfferCount` | Total number of sellers |
| `additionalOfferCount` | `product.additionalOfferCount` | Number of 3P sellers |
| `price_3p` | `product.secondaryOfferPrice.currentPrice.price` | 3P seller's product price |
| `orderLimit` | `product.orderLimit` | Max units per order |
| `buyBoxSuppression` | `product.buyBoxSuppression` | Buy Box suppressed? |
| `categoryPath` | `product.category.path` | Category hierarchy |
| `purchaseBadge` | `badges.flags[SOCIAL_PROOF_PURCHASES_FLAG]` | "500+ bought since yesterday" |
| `customerPickBadge` | `badges.flags[CUSTOMER_PICK]` | "Popular pick" |
| `isBestSeller` | `badges.flags[BEST_SELLER]` | Best seller badge |
| `lowInventoryText` | `badges.groups[urgency].LOW_INVENTORY` | "Only 9 left" |

---

## Field Naming Convention

**Important:** Use `_3p` suffix for 3rd party seller fields to avoid confusion with our own pricing:

| Field | Description |
|-------|-------------|
| `price_3p` | 3P seller's product price |
| `shippingFee_3p` | 3P seller's shipping fee (if available) |
| `totalPrice_3p` | 3P total price (price + shipping) |

Current seller fields (no suffix):
| Field | Description |
|-------|-------------|
| `currentPrice` | Current buy box price |
| `shippingFee` | Current seller's shipping fee |
| `totalPriceWithShipping` | Total price with shipping |

---

## New Output Fields (v2.3)

| Field | Type | Description |
|-------|------|-------------|
| `availabilityStatus` | string | 'IN_STOCK', 'OUT_OF_STOCK', 'THIRD_PARTY', 'NO_FULFILLMENT' |
| `availabilityReason` | string | Reason for status (if not IN_STOCK) |
| `deliveryAvailable` | boolean | Can be delivered |
| `shippingAvailable` | boolean | Can be shipped |
| `lowStockMessage` | string | Low stock warning text |
| `exactStockLevel` | number | Parsed stock quantity (e.g., 9) |
| `transactableOfferCount` | number | Total sellers (Walmart + 3P) |
| `additionalOfferCount` | number | Number of 3P sellers only |
| `price_3p` | number | 3P seller's product price |
| `shippingFee_3p` | number/null | 3P seller's shipping (not available) |
| `totalPrice_3p` | number | 3P total price |
| `averageRating` | number | Product rating (1-5) |
| `numberOfReviews` | number | Review count |
| `brand` | string | Brand name |
| `orderLimit` | number | Max units per order |
| `buyBoxSuppression` | boolean | Buy Box suppressed |
| `categoryPath` | string | "Electronics > Audio > Headphones" |
| `purchaseBadge` | string | "500+ bought since yesterday" |
| `customerPickBadge` | string | "Popular pick" |
| `isBestSeller` | boolean | Has Best Seller badge |
| `currentPrice` | number | Current buy box price |
| `shippingFee` | number | Current seller's shipping fee |
| `totalPriceWithShipping` | number | Total price for comparison |

---

## Removed Fields (v2.3)

| Field | Reason |
|-------|--------|
| `isRollback` | Not needed for filtering |
| `deliveryFee` | Not needed (express delivery) |
| `isFreeShipping` | Can derive from shippingFee === 0 |
| `wasPrice` / `savingsAmount` | Price history not needed |
| `deliverySpeed` / `SLA` | Not needed |

---

## New Airtable Fields Required

| Field Name | Type | Description |
|------------|------|-------------|
| `Scrape Availability Status` | Single select | IN_STOCK, OUT_OF_STOCK, THIRD_PARTY, NO_FULFILLMENT, ERROR |
| `Scrape Delivery Available` | Checkbox | - |
| `Scrape Shipping Available` | Checkbox | - |
| `Scrape Low Stock Message` | Single line text | - |
| `Scrape Stock Level` | Number | Exact stock quantity |
| `Scrape Total Sellers` | Number | transactableOfferCount |
| `Scrape 3P Seller Count` | Number | additionalOfferCount |
| `Scrape Price 3P` | Currency | 3P seller's price |
| `Scrape Rating` | Number (decimal) | - |
| `Scrape Review Count` | Number | - |
| `Scrape Brand` | Single line text | - |
| `Scrape Order Limit` | Number | Max units per order |
| `Scrape Buy Box Suppression` | Checkbox | - |
| `Scrape Category` | Single line text | Category path |
| `Scrape Popularity` | Single line text | Purchase badge text |
| `Scrape Is Best Seller` | Checkbox | - |
| `Scrape Current Price` | Currency | Current buy box price |
| `Scrape Shipping Fee` | Currency | Current seller shipping |
| `Scrape Total Price` | Currency | Price + Shipping |

---

## Pre-Publish Validation Rules

**Simplified rules (only 2 auto-filters):**

| Rule | Condition | Action |
|------|-----------|--------|
| Single Seller Risk | `transactableOfferCount === 1` | Flag for review |
| Low Rating | `averageRating < 3.5` | Flag for review |

**Note:** Other filtering (OOS, low stock, etc.) handled by separate OOS Detection workflow.

---

## Testing Checklist

- [ ] Test with IN_STOCK product (Walmart seller, delivery available)
- [ ] Test with OUT_OF_STOCK product
- [ ] Test with 3rd party seller product
- [ ] Test with product showing "Only X left"
- [ ] Test with product having additionalOfferCount > 0
- [ ] Test with product having transactableOfferCount === 1
- [ ] Test with product having low rating (< 3.5)
- [ ] Verify credit usage stays at 5-10 credits
- [ ] Verify no regression on existing UPC extraction
- [ ] Verify categoryPath extraction
- [ ] Verify orderLimit and buyBoxSuppression extraction
