# Extension Icons

This directory should contain the extension icons in the following sizes:

- `icon16.png` - 16x16 pixels (toolbar icon)
- `icon32.png` - 32x32 pixels (Windows computers)
- `icon48.png` - 48x48 pixels (extension management page)
- `icon128.png` - 128x128 pixels (Chrome Web Store)

## Generating Icons

You can generate these icons from the SVG source using any image editing tool or online converter.

### Using the base SVG

The base icon design (a search/email hybrid):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#0a0a0f"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="24" fill="url(#bg)"/>
  <circle cx="54" cy="54" r="24" fill="none" stroke="#64ffda" stroke-width="6"/>
  <line x1="72" y1="72" x2="96" y2="96" stroke="#64ffda" stroke-width="6" stroke-linecap="round"/>
  <path d="M40 98 L64 114 L88 98" fill="none" stroke="#64ffda" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M40 98 L40 108 L88 108 L88 98" fill="none" stroke="#64ffda" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

### Quick generation commands

Using ImageMagick:
```bash
convert -background none -resize 16x16 icon.svg icon16.png
convert -background none -resize 32x32 icon.svg icon32.png
convert -background none -resize 48x48 icon.svg icon48.png
convert -background none -resize 128x128 icon.svg icon128.png
```

### Online tools

- https://cloudconvert.com/svg-to-png
- https://www.iloveimg.com/resize-image/resize-svg
