# Walmart Seller Scraper Chrome Extension

A Chrome extension that extracts seller pricing data from Walmart product pages for quick repricing decisions.

## Features

- **Auto-extract seller data** from Walmart product pages (via `__NEXT_DATA__`)
- **View all sellers** with their prices and shipping costs
- **Validation flags** to mark products for action:
  - 🔴 No Competition (only us selling)
  - 🟣 Self Competition (our other store selling)
  - 🔴 Too Much Competition (2+ sellers below minimum)
- **Competition check** - enter your 10% min price to auto-detect if competition is too strong
- **Send to Calculator** - one-click to open Repricing Calculator with pre-filled data
- **Copy data** - copy all seller info to clipboard

## Installation

### Developer Mode (Recommended for now)

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `chrome-extension` folder from this project
5. The extension icon should appear in your toolbar

### Configuration

Edit `src/popup.js` to configure:

```javascript
// Your Verso/Calculator URL
const CALCULATOR_URL = 'https://verso.ecl-automation.com/repricing';

// Your store names (for self-competition detection)
const OUR_STORE_NAMES = [
  'ECL',
  'ECL Store',
  // Add your actual Walmart seller names
];
```

## Usage

1. Navigate to any Walmart product page (e.g., `walmart.com/ip/Product-Name/123456789`)
2. Click the extension icon in your toolbar
3. View all seller prices and competition data
4. Set validation flags as needed
5. Click **Send to Repricing Calculator** to open the calculator with pre-filled data

## How It Works

The extension extracts data from Walmart's `__NEXT_DATA__` JSON embedded in the page. This includes:

- Product info (title, brand, ID)
- Current buy box price
- Secondary offer price (3P seller)
- Transactable offer count (total sellers)
- Additional offer count (3P sellers only)
- Fulfillment options with shipping prices

**Note:** Full seller list (beyond buy box winner and secondary offer) is only available if you click "Compare All Sellers" on the product page.

## Limitations

- Some seller data may not be visible in `__NEXT_DATA__` without clicking "Compare All Sellers"
- Shipping prices for 3P sellers may not always be available
- Extension only works on `walmart.com/ip/*` product pages

## Files

```
chrome-extension/
├── manifest.json       # Extension config
├── popup.html          # Popup UI
├── src/
│   ├── content.js      # Page scraping logic
│   └── popup.js        # Popup logic
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Updating Icons

Replace the placeholder PNGs in `/icons/` with proper icons:
- `icon16.png` - 16x16 pixels
- `icon48.png` - 48x48 pixels
- `icon128.png` - 128x128 pixels

Recommended: Use a blue (#0071dc) Walmart-style icon with a dollar sign.

## Integration with Repricing Calculator

When you click "Send to Repricing Calculator", the extension opens the calculator URL with these query parameters:

| Parameter | Description |
|-----------|-------------|
| `productId` | Walmart product ID |
| `title` | Product title (truncated) |
| `compPrice` | Cheapest 3P seller price |
| `compShipping` | Cheapest 3P seller shipping |
| `totalSellers` | Total seller count |
| `thirdPartySellers` | 3P seller count |
| `noCompetition` | Flag: 1 if marked |
| `selfCompetition` | Flag: 1 if marked |
| `tooMuchCompetition` | Flag: 1 if marked |

The Repricing Calculator should be updated to read these parameters and pre-fill the form.
