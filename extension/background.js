/**
 * LeadGenTool Chrome Extension - Background Service Worker
 *
 * Handles:
 * - Extension installation
 * - Context menu actions
 * - Cross-tab communication
 * - API calls to LeadGenTool backend
 */

// Extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // First time installation
    console.log('LeadGenTool extension installed');

    // Initialize storage
    chrome.storage.local.set({
      savedLeads: [],
      settings: {
        autoShowOverlay: false,
        showNotifications: true,
      },
    });

    // Open onboarding page
    chrome.tabs.create({
      url: 'https://leadgentool.app/extension/welcome',
    });
  } else if (details.reason === 'update') {
    console.log('LeadGenTool extension updated to version', chrome.runtime.getManifest().version);
  }
});

// Context menu for right-click actions
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'leadgen-lookup',
    title: 'Find email for this business',
    contexts: ['link', 'selection'],
    documentUrlPatterns: ['https://www.google.com/maps/*', 'https://maps.google.com/*'],
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'leadgen-lookup') {
    const text = info.selectionText || '';

    if (text) {
      // Send message to content script to look up business
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'lookupBusiness',
          businessName: text,
        });
      } catch (error) {
        console.error('Error sending message:', error);
      }
    }
  }
});

// Handle messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'verifyEmail':
      verifyEmail(request.email).then(sendResponse);
      return true; // Keep channel open for async

    case 'saveToApp':
      saveLeadsToApp(request.leads).then(sendResponse);
      return true;

    case 'getSettings':
      getSettings().then(sendResponse);
      return true;

    case 'updateSettings':
      updateSettings(request.settings).then(sendResponse);
      return true;
  }
});

/**
 * Verify an email address using the LeadGenTool API
 */
async function verifyEmail(email) {
  try {
    // In production, this would call your actual API
    // For now, simulate a response
    const response = {
      email,
      valid: email.includes('@') && email.includes('.'),
      confidence: 0.85,
      source: 'pattern',
    };

    return response;
  } catch (error) {
    console.error('Email verification failed:', error);
    return { email, valid: false, error: error.message };
  }
}

/**
 * Save leads to the main LeadGenTool app
 */
async function saveLeadsToApp(leads) {
  try {
    // Get auth token from storage (if user is logged in to the app)
    const { authToken } = await chrome.storage.local.get('authToken');

    if (!authToken) {
      return {
        success: false,
        error: 'Not logged in. Please sign in to LeadGenTool.',
        loginUrl: 'https://leadgentool.app/login?from=extension',
      };
    }

    // In production, this would POST to your API
    // const response = await fetch('https://leadgentool.app/api/leads/import', {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': `Bearer ${authToken}`,
    //   },
    //   body: JSON.stringify({ leads }),
    // });

    return { success: true, count: leads.length };
  } catch (error) {
    console.error('Failed to save leads:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get extension settings
 */
async function getSettings() {
  const result = await chrome.storage.local.get('settings');
  return result.settings || {
    autoShowOverlay: false,
    showNotifications: true,
  };
}

/**
 * Update extension settings
 */
async function updateSettings(newSettings) {
  const currentSettings = await getSettings();
  const updatedSettings = { ...currentSettings, ...newSettings };
  await chrome.storage.local.set({ settings: updatedSettings });
  return updatedSettings;
}

// Tab update listener - inject content script if needed
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    if (tab.url.includes('google.com/maps') || tab.url.includes('maps.google.com')) {
      // Tab is on Google Maps
      const settings = await getSettings();

      if (settings.autoShowOverlay) {
        // Automatically show overlays
        try {
          await chrome.tabs.sendMessage(tabId, { action: 'showOverlay' });
        } catch {
          // Content script not ready yet, ignore
        }
      }
    }
  }
});

// Badge update for showing lead count
async function updateBadge() {
  const result = await chrome.storage.local.get('savedLeads');
  const count = (result.savedLeads || []).length;

  if (count > 0) {
    chrome.action.setBadgeText({ text: count.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#64ffda' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Listen for storage changes to update badge
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.savedLeads) {
    updateBadge();
  }
});

// Initialize badge on startup
updateBadge();
