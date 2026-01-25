# LeadGenTool Chrome Extension

Find business email addresses directly on Google Maps.

## Features

- **Email Discovery**: Automatically find email addresses for businesses visible on Google Maps
- **Email Overlay**: Toggle email badges directly on the map listings
- **Quick Save**: Save leads with one click for later export
- **CSV Export**: Export saved leads as CSV files
- **Sync with App**: Connect to your LeadGenTool account to sync leads

## Installation

### Development / Testing

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension` folder from this project
5. The LeadGenTool icon should appear in your toolbar

### Before Loading

Make sure to add icon files to the `icons/` directory:
- `icon16.png` (16x16)
- `icon32.png` (32x32)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

See `icons/README.md` for generation instructions.

## Usage

### Finding Emails on Google Maps

1. Navigate to [Google Maps](https://www.google.com/maps)
2. Search for a business type (e.g., "restaurants in San Francisco")
3. Click the LeadGenTool extension icon
4. Click "Find Emails for Visible Businesses"
5. The extension will scan visible listings and discover email addresses

### Using the Email Overlay

1. On Google Maps with business listings visible
2. Click "Toggle Email Overlay" in the extension popup
3. Email badges will appear on each business card
4. Click the copy icon to copy an email address

### Saving Leads

- Click the bookmark icon next to any result to save it
- Click "Save All" to save all results with emails
- View saved leads in the bottom section
- Click "Export Saved Leads" to download as CSV

## Files

```
extension/
├── manifest.json        # Extension configuration
├── popup.html          # Popup UI
├── popup.css           # Popup styles
├── popup.js            # Popup logic
├── content.js          # Runs on Google Maps pages
├── content-styles.css  # Overlay styles
├── background.js       # Service worker
└── icons/              # Extension icons
```

## Permissions

The extension requires:

- `activeTab` - Access current tab to detect Google Maps
- `storage` - Save leads and settings locally
- `scripting` - Inject content scripts
- Host permissions for `google.com/maps` and `maps.google.com`

## Development

### Testing Changes

1. Make code changes
2. Go to `chrome://extensions/`
3. Click the refresh icon on the LeadGenTool card
4. Refresh any Google Maps tabs

### Debugging

- Popup: Right-click extension icon → "Inspect popup"
- Content script: Open DevTools on Google Maps page
- Background: Click "service worker" link on extensions page

## Connecting to LeadGenTool App

To sync leads with your LeadGenTool account:

1. Log in to [LeadGenTool](https://leadgentool.app)
2. Go to Settings → Extensions
3. Click "Connect Chrome Extension"
4. Your saved leads will sync automatically

## Limitations

- Email discovery uses pattern matching and is not always accurate
- Works best with businesses that have websites
- Some listings may not have extractable information
- Rate limited to prevent overwhelming the page

## Privacy

- All data is stored locally by default
- No data is sent to external servers unless you opt to sync
- The extension only runs on Google Maps pages
