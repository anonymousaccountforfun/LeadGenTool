/**
 * LeadGenTool Chrome Extension - Content Script
 * Runs on Google Maps pages to detect and enrich business listings
 */

// State
let overlayVisible = false;
let businessCache = new Map();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getBusinessCount':
      const count = getVisibleBusinesses().length;
      sendResponse({ count });
      break;

    case 'getBusinesses':
      const businesses = getBusinessesWithEmails();
      sendResponse({ businesses });
      break;

    case 'toggleOverlay':
      toggleEmailOverlay();
      sendResponse({ success: true });
      break;
  }
  return true; // Keep message channel open for async response
});

/**
 * Get visible business elements on the page
 */
function getVisibleBusinesses() {
  // Google Maps business listing selectors
  const selectors = [
    '[data-result-index]', // Search results
    '.Nv2PK', // Place cards in list
    'a[href*="/maps/place/"]', // Place links
  ];

  const elements = new Set();

  selectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      elements.add(el);
    });
  });

  return Array.from(elements);
}

/**
 * Extract business info from a listing element
 */
function extractBusinessInfo(element) {
  const info = {
    name: '',
    phone: null,
    address: null,
    website: null,
    rating: null,
    reviewCount: null,
  };

  // Try different selectors for business name
  const nameSelectors = [
    '.qBF1Pd', // Main business name
    '.fontHeadlineSmall', // Card headline
    '[data-item-id] .fontBodyMedium', // List item name
    'h1.fontHeadlineLarge', // Detail view
  ];

  for (const selector of nameSelectors) {
    const nameEl = element.querySelector(selector);
    if (nameEl) {
      info.name = nameEl.textContent.trim();
      break;
    }
  }

  // If no name found in element, try parent or the element itself
  if (!info.name) {
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      info.name = ariaLabel.split(',')[0].trim();
    }
  }

  // Try to get phone
  const phoneMatch = element.textContent.match(/(\+?1?\s*\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/);
  if (phoneMatch) {
    info.phone = phoneMatch[1];
  }

  // Try to get address
  const addressSelectors = ['.W4Efsd:last-child', '.rogA2c'];
  for (const selector of addressSelectors) {
    const addrEl = element.querySelector(selector);
    if (addrEl && addrEl.textContent.includes(',')) {
      info.address = addrEl.textContent.trim();
      break;
    }
  }

  // Get rating
  const ratingEl = element.querySelector('.MW4etd');
  if (ratingEl) {
    info.rating = parseFloat(ratingEl.textContent);
  }

  // Get review count
  const reviewEl = element.querySelector('.UY7F9');
  if (reviewEl) {
    const match = reviewEl.textContent.match(/\(([0-9,]+)\)/);
    if (match) {
      info.reviewCount = parseInt(match[1].replace(',', ''));
    }
  }

  // Get website from link
  const websiteLink = element.querySelector('a[href*="http"]:not([href*="google.com"])');
  if (websiteLink) {
    info.website = websiteLink.href;
  }

  return info;
}

/**
 * Get businesses with email discovery
 */
async function getBusinessesWithEmails() {
  const elements = getVisibleBusinesses();
  const businesses = [];

  for (const element of elements) {
    const info = extractBusinessInfo(element);

    if (!info.name) continue;

    // Check cache first
    if (businessCache.has(info.name)) {
      businesses.push(businessCache.get(info.name));
      continue;
    }

    // Try to discover email
    const email = await discoverEmail(info);

    const business = {
      name: info.name,
      email: email?.address || null,
      verified: email?.verified || false,
      phone: info.phone,
      address: info.address,
      website: info.website,
      rating: info.rating,
      reviewCount: info.reviewCount,
    };

    businessCache.set(info.name, business);
    businesses.push(business);
  }

  return businesses;
}

/**
 * Discover email for a business
 * Uses common patterns and heuristics
 */
async function discoverEmail(businessInfo) {
  // If we have a website, try to derive email
  if (businessInfo.website) {
    try {
      const url = new URL(businessInfo.website);
      const domain = url.hostname.replace('www.', '');

      // Common email patterns
      const patterns = [
        `info@${domain}`,
        `contact@${domain}`,
        `hello@${domain}`,
        `support@${domain}`,
      ];

      // Return the most likely pattern
      // In a real implementation, you'd verify these
      return {
        address: patterns[0],
        verified: false,
        source: 'pattern',
      };
    } catch {
      // Invalid URL
    }
  }

  // Try business name pattern (e.g., "Joe's Pizza" -> info@joespizza.com)
  if (businessInfo.name) {
    const cleanName = businessInfo.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 20);

    if (cleanName.length >= 3) {
      return {
        address: `info@${cleanName}.com`,
        verified: false,
        source: 'guess',
      };
    }
  }

  return null;
}

/**
 * Toggle email overlay on business listings
 */
function toggleEmailOverlay() {
  overlayVisible = !overlayVisible;

  if (overlayVisible) {
    addEmailOverlays();
  } else {
    removeEmailOverlays();
  }
}

/**
 * Add email overlays to business listings
 */
async function addEmailOverlays() {
  const elements = getVisibleBusinesses();

  for (const element of elements) {
    const info = extractBusinessInfo(element);
    if (!info.name) continue;

    // Get or discover email
    let business = businessCache.get(info.name);
    if (!business) {
      const email = await discoverEmail(info);
      business = {
        name: info.name,
        email: email?.address || null,
        verified: email?.verified || false,
      };
      businessCache.set(info.name, business);
    }

    // Create overlay
    if (business.email) {
      const overlay = document.createElement('div');
      overlay.className = 'leadgen-email-overlay';
      overlay.innerHTML = `
        <div class="leadgen-email-badge ${business.verified ? 'verified' : ''}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
          <span class="leadgen-email-text">${business.email}</span>
          <button class="leadgen-copy-btn" data-email="${business.email}" title="Copy">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
          </button>
        </div>
      `;

      // Position relative to element
      element.style.position = 'relative';
      element.appendChild(overlay);

      // Add copy handler
      overlay.querySelector('.leadgen-copy-btn').addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await navigator.clipboard.writeText(business.email);
        overlay.querySelector('.leadgen-email-badge').classList.add('copied');
        setTimeout(() => {
          overlay.querySelector('.leadgen-email-badge').classList.remove('copied');
        }, 1500);
      });
    }
  }
}

/**
 * Remove email overlays
 */
function removeEmailOverlays() {
  document.querySelectorAll('.leadgen-email-overlay').forEach(el => el.remove());
}

// Observe for new business listings (infinite scroll)
const observer = new MutationObserver((mutations) => {
  if (overlayVisible) {
    // Re-add overlays for new elements
    addEmailOverlays();
  }
});

// Start observing when on a maps page
if (document.querySelector('[data-result-index]')) {
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}
