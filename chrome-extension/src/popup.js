// ═══════════════════════════════════════════════════════════════════
// WALMART SELLER SCRAPER - Popup Script
// ═══════════════════════════════════════════════════════════════════

// Config - Calculator URL (will be opened in new tab)
const CALCULATOR_URL = 'https://product-margin-tool.vercel.app/repricing';

// Store names to check for self-competition
// Add your actual Walmart seller names here
const OUR_STORE_NAMES = [
  'ECL',
  'eCloudLife',
  'eCloud Life',
  'E-Cloud Life'
];

let productData = null;
let validationFlags = {
  noCompetition: false,
  selfCompetition: false,
  tooMuchCompetition: false
};

// ═══════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  const contentEl = document.getElementById('content');

  // Check if we're on a Walmart product page
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url || !tab.url.includes('walmart.com/ip/')) {
    contentEl.innerHTML = `
      <div class="not-walmart">
        <div class="icon">🛒</div>
        <div>Please navigate to a Walmart product page</div>
        <div style="font-size: 11px; margin-top: 8px; color: #94a3b8;">
          Example: walmart.com/ip/Product-Name/123456789
        </div>
      </div>
    `;
    return;
  }

  // Request data from content script
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractData' });

    if (response && response.success && response.data) {
      productData = response.data;
      renderProductData(productData);
    } else {
      contentEl.innerHTML = `
        <div class="error-state">
          <div class="icon">⚠️</div>
          <div>Could not extract seller data</div>
          <div style="font-size: 11px; margin-top: 8px;">
            Try refreshing the page and clicking the extension again.
          </div>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error:', error);
    contentEl.innerHTML = `
      <div class="error-state">
        <div class="icon">❌</div>
        <div>Error communicating with page</div>
        <div style="font-size: 11px; margin-top: 8px;">
          ${error.message || 'Please refresh the page'}
        </div>
      </div>
    `;
  }
});

// ═══════════════════════════════════════════════════════════════════
// RENDER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

function renderProductData(data) {
  const contentEl = document.getElementById('content');
  const sellers = data.sellers || [];
  const totalSellers = data.transactableOfferCount || sellers.length;
  const thirdPartySellers = data.additionalOfferCount || sellers.filter(s => s.sellerType === 'EXTERNAL').length;

  // Check for self-competition
  const selfCompetitionSellers = sellers.filter(s =>
    OUR_STORE_NAMES.some(name => s.sellerName.toLowerCase().includes(name.toLowerCase()))
  );

  // Find cheapest seller
  const cheapestSeller = sellers.length > 0 ? sellers[0] : null;

  // Determine stat box classes
  const totalSellersClass = totalSellers === 1 ? 'warning' : (totalSellers === 0 ? 'danger' : '');
  const thirdPartyClass = thirdPartySellers >= 3 ? 'danger' : (thirdPartySellers >= 2 ? 'warning' : 'success');

  contentEl.innerHTML = `
    <!-- Product Info -->
    <div class="product-info">
      <div class="product-title">${escapeHtml(data.title)}</div>
      <div class="product-meta">
        <span>ID: ${data.productId}</span>
        ${data.brand ? `<span>Brand: ${escapeHtml(data.brand)}</span>` : ''}
        ${data.averageRating ? `<span>⭐ ${data.averageRating.toFixed(1)}</span>` : ''}
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-row">
      <div class="stat-box ${totalSellersClass}">
        <div class="stat-value">${totalSellers}</div>
        <div class="stat-label">Total Sellers</div>
      </div>
      <div class="stat-box ${thirdPartyClass}">
        <div class="stat-value">${thirdPartySellers}</div>
        <div class="stat-label">3P Sellers</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${cheapestSeller && cheapestSeller.totalPrice != null ? '$' + cheapestSeller.totalPrice.toFixed(2) : '-'}</div>
        <div class="stat-label">Lowest Price</div>
      </div>
    </div>

    <!-- Sellers List -->
    <div class="sellers-section">
      <div class="sellers-header">
        <span>Seller Comparison</span>
        <span>${sellers.length} visible</span>
      </div>
      ${sellers.length > 0 ? sellers.map((seller, index) => renderSellerRow(seller, index, cheapestSeller)).join('') : `
        <div style="padding: 20px; text-align: center; color: #64748b; font-size: 12px;">
          No seller data available.<br>
          Click "Compare All Sellers" on the product page for more data.
        </div>
      `}
    </div>

    <!-- Validation Flags -->
    <div class="validation-flags">
      <div class="flag-btn no-competition ${validationFlags.noCompetition ? 'active' : ''}" data-flag="noCompetition">
        <span class="flag-icon">🔴</span>
        <div class="flag-text">
          <strong>No Competition</strong>
          <span>Only us selling - consider retire</span>
        </div>
      </div>
      <div class="flag-btn self-competition ${validationFlags.selfCompetition ? 'active' : ''}" data-flag="selfCompetition">
        <span class="flag-icon">🟣</span>
        <div class="flag-text">
          <strong>Self Competition</strong>
          <span>Our other store is also selling</span>
        </div>
      </div>
      <div class="flag-btn too-much-competition ${validationFlags.tooMuchCompetition ? 'active' : ''}" data-flag="tooMuchCompetition">
        <span class="flag-icon">🔴</span>
        <div class="flag-text">
          <strong>Too Much Competition</strong>
          <span>2+ sellers below our 10% min price</span>
        </div>
      </div>
    </div>

    <!-- Min Price Input for Competition Check -->
    <div class="min-price-section">
      <div class="min-price-label">Your 10% Minimum Price (to check competition)</div>
      <div class="min-price-row">
        <input type="number" class="min-price-input" id="minPriceInput" placeholder="0.00" step="0.01">
        <button class="btn btn-secondary" id="checkCompetitionBtn">Check</button>
      </div>
    </div>

    <!-- Actions -->
    <div class="actions">
      <button class="btn btn-primary" id="sendToCalculatorBtn">
        📱 Send to Repricing Calculator
      </button>
      <button class="btn btn-secondary" id="copyDataBtn">
        📋 Copy Seller Data
      </button>
    </div>

    <div class="footer">
      Extracted at ${new Date(data.extractedAt).toLocaleTimeString()}
    </div>
  `;

  // Attach event listeners
  attachEventListeners();
}

function renderSellerRow(seller, index, cheapestSeller) {
  const isBuyBox = seller.isBuyBox || index === 0;
  const isCheapest = seller === cheapestSeller;
  const isWalmart = seller.sellerType === 'INTERNAL' || (seller.sellerName && seller.sellerName.toLowerCase().includes('walmart'));
  const isOurStore = OUR_STORE_NAMES.some(name => seller.sellerName && seller.sellerName.toLowerCase().includes(name.toLowerCase()));

  let rowClass = '';
  if (isBuyBox) rowClass = 'buy-box';
  else if (isCheapest) rowClass = 'cheapest';

  // Safe price formatting
  const totalPrice = seller.totalPrice != null ? seller.totalPrice.toFixed(2) : '-.--';
  const itemPrice = seller.price != null ? seller.price.toFixed(2) : '-.--';
  const shipPrice = (seller.shippingPrice || 0).toFixed(2);

  return `
    <div class="seller-row ${rowClass}">
      <div class="seller-rank">${index + 1}</div>
      <div class="seller-info">
        <div class="seller-name">${escapeHtml(seller.sellerName || 'Unknown')}</div>
        <div class="seller-tags">
          ${isWalmart ? '<span class="seller-tag walmart">Walmart</span>' : '<span class="seller-tag third-party">3P</span>'}
          ${isBuyBox ? '<span class="seller-tag buy-box">Buy Box</span>' : ''}
          ${isOurStore ? '<span class="seller-tag" style="background:#ede9fe;color:#7c3aed;">Our Store</span>' : ''}
        </div>
      </div>
      <div class="seller-prices">
        <div class="seller-total">$${totalPrice}</div>
        <div class="seller-breakdown">
          $${itemPrice} + $${shipPrice} ship
        </div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════
// EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════════

function attachEventListeners() {
  // Validation flag toggles
  document.querySelectorAll('.flag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const flag = btn.dataset.flag;
      validationFlags[flag] = !validationFlags[flag];
      btn.classList.toggle('active', validationFlags[flag]);
    });
  });

  // Check competition button
  document.getElementById('checkCompetitionBtn')?.addEventListener('click', () => {
    checkCompetition();
  });

  // Send to Calculator
  document.getElementById('sendToCalculatorBtn')?.addEventListener('click', () => {
    sendToCalculator();
  });

  // Copy Data
  document.getElementById('copyDataBtn')?.addEventListener('click', () => {
    copySellerData();
  });
}

function checkCompetition() {
  const minPrice = parseFloat(document.getElementById('minPriceInput').value);
  if (!minPrice || !productData) return;

  const sellers = productData.sellers || [];
  const sellersBelow = sellers.filter(s => s.totalPrice < minPrice && !s.isBuyBox);

  if (sellersBelow.length >= 2) {
    validationFlags.tooMuchCompetition = true;
    document.querySelector('.flag-btn.too-much-competition').classList.add('active');
    alert(`⚠️ Too Much Competition!\n\n${sellersBelow.length} sellers priced below your $${minPrice.toFixed(2)} minimum:\n\n${sellersBelow.map(s => `• ${s.sellerName}: $${s.totalPrice.toFixed(2)}`).join('\n')}`);
  } else {
    alert(`✅ Competition OK\n\nOnly ${sellersBelow.length} seller(s) below your minimum price.`);
  }
}

function sendToCalculator() {
  if (!productData) return;

  // Find the cheapest 3P seller (excluding our stores and Walmart)
  const sellers = productData.sellers || [];
  const thirdPartySellers = sellers.filter(s =>
    s.sellerType !== 'INTERNAL' &&
    !(s.sellerName && s.sellerName.toLowerCase().includes('walmart')) &&
    !OUR_STORE_NAMES.some(name => s.sellerName && s.sellerName.toLowerCase().includes(name.toLowerCase()))
  );

  const cheapest3P = thirdPartySellers.length > 0 ? thirdPartySellers[0] : null;

  // Build URL with query params
  const params = new URLSearchParams();
  params.set('wmProductId', productData.productId || '');
  params.set('title', (productData.title || '').substring(0, 100));
  params.set('compPrice', cheapest3P && cheapest3P.price != null ? cheapest3P.price.toFixed(2) : '');
  params.set('compShipping', cheapest3P ? (cheapest3P.shippingPrice || 0).toFixed(2) : '');
  params.set('totalSellers', String(productData.transactableOfferCount || sellers.length));
  params.set('thirdPartySellers', String(productData.additionalOfferCount || thirdPartySellers.length));
  params.set('brand', productData.brand || '');
  params.set('rating', productData.averageRating ? productData.averageRating.toFixed(1) : '');
  // Include validation flags
  params.set('noCompetition', validationFlags.noCompetition ? '1' : '0');
  params.set('selfCompetition', validationFlags.selfCompetition ? '1' : '0');
  params.set('tooMuchCompetition', validationFlags.tooMuchCompetition ? '1' : '0');
  // Source tracking
  params.set('source', 'chrome-extension');

  const url = `${CALCULATOR_URL}?${params.toString()}`;

  // Open in new tab
  chrome.tabs.create({ url });
}

function copySellerData() {
  if (!productData) return;

  const sellers = productData.sellers || [];
  const text = `Product: ${productData.title}
ID: ${productData.productId}
Total Sellers: ${productData.transactableOfferCount || sellers.length}
3P Sellers: ${productData.additionalOfferCount || 0}

Sellers:
${sellers.map((s, i) => `${i + 1}. ${s.sellerName}: $${s.price.toFixed(2)} + $${(s.shippingPrice || 0).toFixed(2)} ship = $${s.totalPrice.toFixed(2)}`).join('\n')}

Validation Flags:
- No Competition: ${validationFlags.noCompetition ? 'Yes' : 'No'}
- Self Competition: ${validationFlags.selfCompetition ? 'Yes' : 'No'}
- Too Much Competition: ${validationFlags.tooMuchCompetition ? 'Yes' : 'No'}
`;

  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copyDataBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '✅ Copied!';
    setTimeout(() => {
      btn.innerHTML = originalText;
    }, 2000);
  });
}

// ═══════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
