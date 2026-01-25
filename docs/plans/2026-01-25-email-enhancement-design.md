# Email Enhancement Design

## Goal
Increase email find rate from ~25% to 65-80% using free methods only.

## Strategy Layers

| Layer | Method | Expected Gain | Confidence |
|-------|--------|---------------|------------|
| 1 | Website scraping (existing) | ~25% | 0.85 |
| 2 | Pattern guessing + SMTP validation | +30-40% | 0.75 |
| 3 | Social media extraction | +10-15% | 0.70 |

## Layer 1: Website Scraping (Existing)
Already implemented in `lib/simple-email-finder.ts`. Scrapes homepage and contact pages for email addresses.

## Layer 2: Pattern Guessing + SMTP Validation

### Pattern Generation
For each business domain, generate common email patterns:
- info@domain.com
- contact@domain.com
- hello@domain.com
- sales@domain.com
- support@domain.com
- admin@domain.com
- mail@domain.com

### Validation Flow
1. **DNS MX lookup** - Check domain has mail servers
2. **SMTP connect** - Open connection to MX server on port 25
3. **EHLO handshake** - Verify server responds
4. Close connection (no RCPT TO to avoid blacklisting)

### Confidence Scoring
- MX exists + SMTP responds: 0.75
- MX exists but SMTP timeout: 0.50
- No MX records: skip domain

### Rate Limiting
- Max 10 SMTP connections/second
- Cache MX results per domain

## Layer 3: Social Media Extraction

### Facebook
1. Use existing Facebook URL if available
2. Otherwise search: `facebook.com/search/pages/?q={name}+{location}`
3. Scrape "About" section for email
4. Look for mailto: links

### Instagram
1. Use existing Instagram URL if available
2. Otherwise search via Instagram web search
3. Extract email from bio text or contact data

### Rate Limiting
- Rotate User-Agent strings
- 1-2 second delays between requests
- Prioritize existing URLs (reduces requests ~60%)

### Confidence Scoring
- Verified business page: 0.70
- Search result page: 0.60
- Domain matches website: +0.10 bonus

## Orchestrator Flow

```
findEmail(business):
  1. Try website scraping → return if confidence >= 0.80
  2. Try pattern + SMTP → return if confidence >= 0.70
  3. Try social media → return if found
  4. Return best website result or null
```

## Files

| File | Action | Purpose |
|------|--------|---------|
| `lib/email-patterns.ts` | Create | Pattern generation + MX/SMTP |
| `lib/social-email-finder.ts` | Create | Facebook/Instagram extraction |
| `lib/email-finder.ts` | Create | Orchestrator |
| `lib/inngest/functions.ts` | Modify | Use new orchestrator |

## Success Criteria
- Email find rate >= 65% on test searches
- No external API costs
- Processing time < 30 seconds for 25 businesses
