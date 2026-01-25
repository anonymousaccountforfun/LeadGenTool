# Email Optimization Design - 80%+ Find Rate

## Goal
Increase email find rate from 50% to 80%+ using all free sources.

## Problem Analysis
Current state: 100% find rate for businesses WITH websites, 0% for businesses WITHOUT.
Half of business listings lack websites, causing 50% overall rate.

## Solution: Comprehensive Logic Chain

Run all branches in parallel, score results, return highest confidence.

```
For each business:
├── Branch A: Website-based (if website exists)
│   ├── 1. Scrape website pages
│   ├── 2. Pattern + MX/SMTP validation
│   └── 3. Social media extraction
│
├── Branch B: Find missing website (if no website)
│   ├── 1. Google search: "{name} {location} website"
│   ├── 2. Bing search: "{name} {location}"
│   ├── 3. Yelp page scrape for website link
│   ├── 4. Yellow Pages scrape for website link
│   ├── 5. BBB page scrape for website link
│   └── → If found, run Branch A on discovered website
│
├── Branch C: Direct email search
│   ├── 1. Google: "{name} {location} email"
│   ├── 2. Google: "{name} {location} contact"
│   ├── 3. Bing: "{name} email"
│   └── 4. Extract emails from search result snippets
│
├── Branch D: Social media search
│   ├── 1. Facebook search by business name
│   ├── 2. Instagram search by business name
│   └── 3. Extract emails from profiles
│
└── Branch E: Phone-based lookup (if phone exists)
    ├── 1. Google: "{phone} email"
    ├── 2. Yelp page (often has email if phone matches)
    └── 3. Yellow Pages listing

→ Score all results, return highest confidence
```

## Confidence Scoring

| Source | Base Confidence | Domain Match Bonus |
|--------|-----------------|-------------------|
| Website scrape (contact page) | 0.85 | +0.05 |
| Website scrape (homepage) | 0.80 | +0.05 |
| Pattern + SMTP verified | 0.75 | - |
| Directory listing (Yelp/YP/BBB) | 0.75 | +0.05 |
| Social media profile | 0.70 | +0.10 |
| Pattern + MX only | 0.60 | - |
| Search result snippet | 0.55 | +0.10 |
| Phone-based search | 0.50 | +0.10 |

**Rules:**
- Domain match bonus: If email domain matches business website domain
- Multiple source bonus: +0.05 if same email found via 2+ sources
- Confidence cap: Maximum 0.95

## Rate Limiting

- Google: 1 request/second
- Bing/DDG: 2 requests/second
- Directories: 1 request/2 seconds
- Max 4 search queries per business
- Stop early if high-confidence email found

## Files

**Create:**
- `lib/search-engines.ts` - Google/Bing/DDG search interface
- `lib/directory-scraper.ts` - Yelp/YellowPages/BBB scraping
- `lib/website-discovery.ts` - Find missing websites
- `lib/email-search.ts` - Direct email search

**Modify:**
- `lib/email-finder.ts` - Add `findEmailComprehensive()` orchestrator
- `lib/inngest/functions.ts` - Use new comprehensive finder

## Expected Results

| Scenario | Before | After |
|----------|--------|-------|
| Has website | 100% | 100% |
| No website | 0% | ~70% |
| **Overall** | **50%** | **~85%** |
