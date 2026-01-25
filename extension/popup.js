/**
 * LeadGenTool Chrome Extension - Popup Script
 */

// DOM Elements
const notMapsSection = document.getElementById('not-maps');
const onMapsSection = document.getElementById('on-maps');
const businessCount = document.getElementById('business-count');
const findEmailsBtn = document.getElementById('find-emails-btn');
const showOverlayBtn = document.getElementById('show-overlay-btn');
const resultsDiv = document.getElementById('results');
const resultsList = document.getElementById('results-list');
const loadingDiv = document.getElementById('loading');
const savedList = document.getElementById('saved-list');
const savedCount = document.getElementById('saved-count');
const exportBtn = document.getElementById('export-btn');
const saveAllBtn = document.getElementById('save-all-btn');

// State
let currentTabId = null;
let savedLeads = [];
let foundLeads = [];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadSavedLeads();
  await checkCurrentTab();
  setupEventListeners();
});

// Check if current tab is Google Maps
async function checkCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab.id;

    if (tab.url && (tab.url.includes('google.com/maps') || tab.url.includes('maps.google.com'))) {
      notMapsSection.classList.add('hidden');
      onMapsSection.classList.remove('hidden');
      await getBusinessCount();
    } else {
      notMapsSection.classList.remove('hidden');
      onMapsSection.classList.add('hidden');
    }
  } catch (error) {
    console.error('Error checking tab:', error);
    notMapsSection.classList.remove('hidden');
  }
}

// Get business count from content script
async function getBusinessCount() {
  try {
    const response = await chrome.tabs.sendMessage(currentTabId, { action: 'getBusinessCount' });
    if (response && response.count !== undefined) {
      businessCount.textContent = `${response.count} businesses detected`;
    }
  } catch {
    businessCount.textContent = 'Page loading...';
  }
}

// Setup event listeners
function setupEventListeners() {
  findEmailsBtn.addEventListener('click', findEmails);
  showOverlayBtn.addEventListener('click', toggleOverlay);
  exportBtn.addEventListener('click', exportLeads);
  saveAllBtn.addEventListener('click', saveAllLeads);
}

// Find emails for visible businesses
async function findEmails() {
  findEmailsBtn.disabled = true;
  loadingDiv.classList.remove('hidden');
  resultsDiv.classList.add('hidden');

  try {
    // Get businesses from content script
    const response = await chrome.tabs.sendMessage(currentTabId, { action: 'getBusinesses' });

    if (response && response.businesses) {
      foundLeads = response.businesses;

      // Display results
      displayResults(foundLeads);
    }
  } catch (error) {
    console.error('Error finding emails:', error);
    resultsList.innerHTML = '<p class="empty-message">Error finding businesses. Please refresh the page.</p>';
  } finally {
    findEmailsBtn.disabled = false;
    loadingDiv.classList.add('hidden');
  }
}

// Display results
function displayResults(businesses) {
  resultsDiv.classList.remove('hidden');
  resultsList.innerHTML = '';

  if (businesses.length === 0) {
    resultsList.innerHTML = '<p class="empty-message">No businesses found on this page</p>';
    return;
  }

  businesses.forEach((business, index) => {
    const isSaved = savedLeads.some(l => l.name === business.name);

    const item = document.createElement('div');
    item.className = 'result-item';
    item.innerHTML = `
      <div class="result-info">
        <div class="result-name">${escapeHtml(business.name)}</div>
        ${business.email
          ? `<div class="result-email ${business.verified ? 'verified' : ''}">${escapeHtml(business.email)}</div>`
          : '<div class="result-no-email">No email found</div>'
        }
      </div>
      <div class="result-actions">
        <button class="result-action-btn ${isSaved ? 'saved' : ''}" data-index="${index}" title="Save lead">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
            <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        ${business.email ? `
          <button class="result-action-btn copy-btn" data-email="${escapeHtml(business.email)}" title="Copy email">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
          </button>
        ` : ''}
      </div>
    `;

    resultsList.appendChild(item);
  });

  // Add click handlers
  resultsList.querySelectorAll('.result-action-btn:not(.copy-btn)').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index);
      toggleSaveLead(foundLeads[index], btn);
    });
  });

  resultsList.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(btn.dataset.email);
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      setTimeout(() => {
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
      }, 1500);
    });
  });
}

// Toggle overlay on page
async function toggleOverlay() {
  try {
    await chrome.tabs.sendMessage(currentTabId, { action: 'toggleOverlay' });
  } catch (error) {
    console.error('Error toggling overlay:', error);
  }
}

// Toggle save lead
function toggleSaveLead(lead, button) {
  const existingIndex = savedLeads.findIndex(l => l.name === lead.name);

  if (existingIndex >= 0) {
    savedLeads.splice(existingIndex, 1);
    button.classList.remove('saved');
    button.querySelector('svg').setAttribute('fill', 'none');
  } else {
    savedLeads.push(lead);
    button.classList.add('saved');
    button.querySelector('svg').setAttribute('fill', 'currentColor');
  }

  saveSavedLeads();
  renderSavedLeads();
}

// Save all visible leads
function saveAllLeads() {
  foundLeads.forEach(lead => {
    if (lead.email && !savedLeads.some(l => l.name === lead.name)) {
      savedLeads.push(lead);
    }
  });

  saveSavedLeads();
  renderSavedLeads();
  displayResults(foundLeads); // Re-render to update saved status
}

// Load saved leads from storage
async function loadSavedLeads() {
  try {
    const result = await chrome.storage.local.get('savedLeads');
    savedLeads = result.savedLeads || [];
    renderSavedLeads();
  } catch (error) {
    console.error('Error loading saved leads:', error);
  }
}

// Save leads to storage
async function saveSavedLeads() {
  try {
    await chrome.storage.local.set({ savedLeads });
  } catch (error) {
    console.error('Error saving leads:', error);
  }
}

// Render saved leads list
function renderSavedLeads() {
  savedCount.textContent = savedLeads.length;

  if (savedLeads.length === 0) {
    savedList.innerHTML = '<p class="empty-message">No saved leads yet</p>';
    exportBtn.classList.add('hidden');
    return;
  }

  exportBtn.classList.remove('hidden');
  savedList.innerHTML = '';

  savedLeads.forEach((lead, index) => {
    const item = document.createElement('div');
    item.className = 'saved-item';
    item.innerHTML = `
      <span class="saved-item-name">${escapeHtml(lead.name)}</span>
      ${lead.email ? `<span class="saved-item-email">${escapeHtml(lead.email)}</span>` : ''}
      <button class="remove-btn" data-index="${index}" title="Remove">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    `;
    savedList.appendChild(item);
  });

  // Add remove handlers
  savedList.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index);
      savedLeads.splice(index, 1);
      saveSavedLeads();
      renderSavedLeads();
    });
  });
}

// Export saved leads
function exportLeads() {
  if (savedLeads.length === 0) return;

  // Create CSV
  const headers = ['Name', 'Email', 'Phone', 'Address'];
  const rows = savedLeads.map(lead => [
    lead.name || '',
    lead.email || '',
    lead.phone || '',
    lead.address || '',
  ]);

  let csv = headers.join(',') + '\n';
  rows.forEach(row => {
    csv += row.map(field => `"${field.replace(/"/g, '""')}"`).join(',') + '\n';
  });

  // Download
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leads_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
