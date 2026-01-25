import { type Browser, type Page } from 'playwright';
import { verifyEmail, quickVerify } from './email-verifier';
import { loadConfig } from './config';
import { createStealthContext, humanWait, simulateHumanBehavior } from './stealth';
import { acquireRateLimit } from './rate-limiter';
import { crawlSiteForEmails, discoverContactPages } from './site-crawler';
import { searchAllApis, verifyEmailWithApi } from './email-apis';
import { detectCatchAll, getEmailVariations, adjustConfidenceForCatchAll, learnPattern, getPatternMatchBoost } from './email-patterns';
import { getCachedEmail, cacheEmail, getCachedCatchAll, cacheCatchAll } from './cache';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Hunter.io API integration
interface HunterEmailResult {
  email: string;
  confidence: number;
  type: string;
}

async function searchHunterDomain(domain: string): Promise<HunterEmailResult | null> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${apiKey}`
    );

    if (!response.ok) return null;

    const data = await response.json();

    if (data.data?.emails && data.data.emails.length > 0) {
      // Sort by confidence and prefer generic emails (info@, contact@)
      const emails = data.data.emails as Array<{
        value: string;
        confidence: number;
        type: string;
      }>;

      // First try to find generic emails
      const genericEmail = emails.find(e =>
        e.value.toLowerCase().startsWith('info@') ||
        e.value.toLowerCase().startsWith('contact@') ||
        e.value.toLowerCase().startsWith('hello@')
      );

      if (genericEmail) {
        return {
          email: genericEmail.value.toLowerCase(),
          confidence: genericEmail.confidence / 100,
          type: genericEmail.type
        };
      }

      // Otherwise return highest confidence email
      const sorted = emails.sort((a, b) => b.confidence - a.confidence);
      return {
        email: sorted[0].value.toLowerCase(),
        confidence: sorted[0].confidence / 100,
        type: sorted[0].type
      };
    }

    return null;
  } catch {
    return null;
  }
}

async function verifyWithHunter(email: string): Promise<{ valid: boolean; confidence: number } | null> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${apiKey}`
    );

    if (!response.ok) return null;

    const data = await response.json();

    if (data.data) {
      const status = data.data.status;
      const score = data.data.score || 0;

      return {
        valid: status === 'valid' || status === 'accept_all',
        confidence: score / 100
      };
    }

    return null;
  } catch {
    return null;
  }
}

// WhoisXML API integration for domain owner emails
interface WhoisEmailResult {
  email: string;
  type: 'registrant' | 'admin' | 'tech';
  confidence: number;
}

async function getWhoisEmails(domain: string): Promise<WhoisEmailResult | null> {
  const apiKey = process.env.WHOIS_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `https://www.whoisxmlapi.com/whoisserver/WhoisService?apiKey=${apiKey}&domainName=${encodeURIComponent(domain)}&outputFormat=JSON`
    );

    if (!response.ok) return null;

    const data = await response.json();
    const whoisRecord = data.WhoisRecord;

    if (!whoisRecord) return null;

    // Skip privacy-protected domains
    const skipPatterns = [
      'privacy', 'protect', 'proxy', 'guard', 'whois', 'redacted',
      'withheld', 'contact.gandi.net', 'domainsbyproxy', 'privacyguard'
    ];

    // Priority order: registrant > admin > tech
    const emailSources = [
      { email: whoisRecord.registrant?.email, type: 'registrant' as const },
      { email: whoisRecord.administrativeContact?.email, type: 'admin' as const },
      { email: whoisRecord.technicalContact?.email, type: 'tech' as const },
      { email: whoisRecord.contactEmail, type: 'registrant' as const },
    ];

    for (const source of emailSources) {
      if (source.email && typeof source.email === 'string') {
        const emailLower = source.email.toLowerCase();

        // Skip privacy-protected emails
        if (skipPatterns.some(pattern => emailLower.includes(pattern))) {
          continue;
        }

        // Skip generic provider emails for WHOIS (these are usually not the business)
        if (['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'].some(d => emailLower.includes(d))) {
          continue;
        }

        // Validate email format
        if (emailLower.includes('@') && emailLower.includes('.')) {
          return {
            email: emailLower,
            type: source.type,
            confidence: source.type === 'registrant' ? 0.75 : 0.70
          };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

// Email permutation patterns for name-based email guessing
function generateEmailPermutations(firstName: string, lastName: string, domain: string): string[] {
  const f = firstName.toLowerCase().trim();
  const l = lastName.toLowerCase().trim();
  if (!f || !l) return [];

  return [
    `${f}.${l}@${domain}`,           // john.smith@
    `${f}${l}@${domain}`,            // johnsmith@
    `${f}_${l}@${domain}`,           // john_smith@
    `${f[0]}${l}@${domain}`,         // jsmith@
    `${f}${l[0]}@${domain}`,         // johns@
    `${f[0]}.${l}@${domain}`,        // j.smith@
    `${f}@${domain}`,                // john@
    `${l}@${domain}`,                // smith@
    `${l}.${f}@${domain}`,           // smith.john@
    `${l}${f}@${domain}`,            // smithjohn@
    `${l}${f[0]}@${domain}`,         // smithj@
    `${f[0]}${l[0]}@${domain}`,      // js@
  ];
}

// Extract potential owner/staff names from page content
async function extractNamesFromPage(page: Page): Promise<Array<{first: string, last: string}>> {
  const names: Array<{first: string, last: string}> = [];

  try {
    const extractedNames = await page.evaluate(() => {
      const found: Array<{first: string, last: string}> = [];

      // Common patterns for owner/staff names
      const namePatterns = [
        /(?:owner|founder|ceo|president|director|manager|dr\.?|doctor)[\s:]+([A-Z][a-z]+)\s+([A-Z][a-z]+)/gi,
        /(?:meet|about)\s+([A-Z][a-z]+)\s+([A-Z][a-z]+)/gi,
        /([A-Z][a-z]+)\s+([A-Z][a-z]+)[\s,]+(?:DDS|DMD|MD|DO|DC|PT|OD|DPM|owner|founder)/gi,
      ];

      const text = document.body?.innerText || '';

      for (const pattern of namePatterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          const first = match[1];
          const last = match[2];
          // Filter out common false positives
          if (first.length > 1 && last.length > 1 &&
              !['The', 'Our', 'Your', 'This', 'That', 'Meet', 'About', 'Contact'].includes(first)) {
            found.push({ first, last });
          }
        }
      }

      // Also check meta tags and structured data
      const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
      ldScripts.forEach(script => {
        try {
          const data = JSON.parse(script.textContent || '');
          const findNames = (obj: any) => {
            if (typeof obj === 'object' && obj !== null) {
              if (obj.name && typeof obj.name === 'string' && obj['@type']?.includes('Person')) {
                const parts = obj.name.split(' ');
                if (parts.length >= 2) {
                  found.push({ first: parts[0], last: parts[parts.length - 1] });
                }
              }
              Object.values(obj).forEach(findNames);
            }
          };
          findNames(data);
        } catch {}
      });

      return found.slice(0, 5); // Limit to 5 names
    });

    names.push(...extractedNames);
  } catch {}

  return names;
}

// Test email permutations and return first verified one
// Uses pattern learning to prioritize likely email formats
async function tryEmailPermutations(
  names: Array<{first: string, last: string}>,
  domain: string,
  isCatchAll: boolean = false
): Promise<{email: string, confidence: number} | null> {
  for (const name of names) {
    // Use pattern learning for smarter permutation ordering
    const permutations = getEmailVariations(name.first, name.last, domain);
    const patternBoost = getPatternMatchBoost(domain);

    for (const email of permutations) {
      try {
        // Try premium verification first if available
        const apiVerification = await verifyEmailWithApi(email).catch(() => null);
        if (apiVerification) {
          if (apiVerification.valid) {
            const confidence = adjustConfidenceForCatchAll(
              apiVerification.confidence + patternBoost,
              isCatchAll || apiVerification.isCatchAll || false,
              true
            );
            // Learn this pattern for future use
            learnPattern(domain, [{ email, firstName: name.first, lastName: name.last }]);
            return { email, confidence: Math.min(confidence, 0.95) };
          }
          continue; // Skip invalid emails
        }

        // Fall back to MX/SMTP check
        const mxCheck = await quickVerify(email);
        if (mxCheck.hasMx && mxCheck.confidence >= 0.8) {
          // Try SMTP verification for higher confidence
          const smtpResult = await verifyEmail(email);
          if (smtpResult.smtpCheck === 'passed') {
            const baseConfidence = 0.90 + patternBoost;
            const adjustedConfidence = adjustConfidenceForCatchAll(baseConfidence, isCatchAll, true);
            // Learn this pattern for future use
            learnPattern(domain, [{ email, firstName: name.first, lastName: name.last }]);
            return { email, confidence: Math.min(adjustedConfidence, 0.95) };
          }
          // If SMTP times out but MX is valid, still return with good confidence
          if (smtpResult.smtpCheck === 'timeout' && smtpResult.hasMxRecords) {
            const baseConfidence = 0.82 + patternBoost;
            const adjustedConfidence = adjustConfidenceForCatchAll(baseConfidence, isCatchAll, true);
            return { email, confidence: Math.min(adjustedConfidence, 0.90) };
          }
        }
      } catch {}
    }
  }

  return null;
}

// Expanded list of pages to check
const CONTACT_PATHS = [
  '/',
  '/contact',
  '/contact-us',
  '/contactus',
  '/about',
  '/about-us',
  '/aboutus',
  '/team',
  '/our-team',
  '/staff',
  '/meet-the-team',
  '/meet-us',
  '/get-in-touch',
  '/reach-us',
  '/connect',
  '/location',
  '/locations',
  '/office',
  '/info',
  '/support',
  '/help',
  '/footer', // Sometimes exposed
];

const SKIP_EMAIL_DOMAINS = [
  'example.com', 'sentry.io', 'wixpress.com', 'wix.com', 'squarespace.com',
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'googlemail.com', 'mail.com', 'email.com', 'test.com', 'domain.com',
  'yoursite.com', 'yourdomain.com', 'company.com', 'website.com',
  'sentry-next.wixpress.com', 'static.wixstatic.com'
];

export interface EmailResult {
  email: string | null;
  source: string | null;
  confidence: number;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
}

function isValidBusinessEmail(email: string, websiteDomain: string): boolean {
  const emailDomain = email.split('@')[1]?.toLowerCase();
  if (!emailDomain) return false;

  // Skip generic email providers and platform domains
  if (SKIP_EMAIL_DOMAINS.some(d => emailDomain.includes(d))) return false;

  // Check for obviously fake/placeholder emails
  const localPart = email.split('@')[0].toLowerCase();
  if (['test', 'example', 'user', 'email', 'your', 'name', 'admin', 'webmaster', 'noreply', 'no-reply', 'donotreply'].includes(localPart)) return false;

  // Check for image/file extensions that got matched as emails
  if (emailDomain.match(/\.(png|jpg|jpeg|gif|svg|css|js)$/i)) return false;

  // Accept ANY legitimate-looking business email - don't require domain match
  // Many businesses use different domains for email vs website
  return true;
}

function getPriority(email: string): number {
  const lower = email.toLowerCase();
  // Highest priority - common business contact emails
  if (lower.startsWith('info@') || lower.startsWith('contact@') || lower.startsWith('hello@')) return 1;
  if (lower.startsWith('office@') || lower.startsWith('mail@') || lower.startsWith('enquiries@')) return 1;
  if (lower.startsWith('appointments@') || lower.startsWith('schedule@') || lower.startsWith('booking@')) return 1;
  // Medium priority - department emails
  if (lower.startsWith('support@') || lower.startsWith('help@') || lower.startsWith('service@')) return 2;
  if (lower.startsWith('sales@') || lower.startsWith('admin@') || lower.startsWith('reception@')) return 2;
  // Lower priority - could be personal or less useful
  return 3;
}

async function extractEmailsFromPage(page: Page): Promise<string[]> {
  try {
    const emails = new Set<string>();

    // Pre-step: Expand hidden content (accordions, tabs, collapsibles)
    try {
      await page.evaluate(() => {
        // Click accordion headers/triggers
        const accordionSelectors = [
          '[data-toggle="collapse"]',
          '[data-bs-toggle="collapse"]',
          '.accordion-button',
          '.accordion-header',
          '.accordion-trigger',
          '[class*="accordion"] button',
          '[class*="expand"]',
          '[class*="collapsible"]',
          'details summary',
          '[aria-expanded="false"]',
          '.faq-question',
          '.toggle-content',
          '.expandable',
        ];

        accordionSelectors.forEach(selector => {
          document.querySelectorAll(selector).forEach(el => {
            try { (el as HTMLElement).click(); } catch {}
          });
        });

        // Open all <details> elements
        document.querySelectorAll('details').forEach(el => {
          el.setAttribute('open', 'true');
        });

        // Click tab buttons that might contain contact info
        const tabSelectors = [
          '[role="tab"]',
          '.tab-button',
          '.nav-tab',
          '[data-toggle="tab"]',
          '[data-bs-toggle="tab"]',
        ];

        tabSelectors.forEach(selector => {
          document.querySelectorAll(selector).forEach(el => {
            const text = (el.textContent || '').toLowerCase();
            if (text.includes('contact') || text.includes('email') || text.includes('reach') || text.includes('info')) {
              try { (el as HTMLElement).click(); } catch {}
            }
          });
        });

        // Expand "show more" or "read more" buttons
        const showMoreSelectors = [
          'button[class*="show-more"]',
          'button[class*="read-more"]',
          'a[class*="show-more"]',
          'a[class*="read-more"]',
          '[class*="see-more"]',
          '[class*="view-more"]',
        ];

        showMoreSelectors.forEach(selector => {
          document.querySelectorAll(selector).forEach(el => {
            try { (el as HTMLElement).click(); } catch {}
          });
        });
      });

      // Wait a moment for content to expand
      await humanWait(page, 500, 50);
    } catch {}

    // Method 1: Raw HTML content
    const content = await page.content();
    const htmlEmails = content.match(EMAIL_REGEX) || [];
    htmlEmails.forEach(e => emails.add(e.toLowerCase()));

    // Method 2: Mailto links
    const mailtoEmails = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href^="mailto:"]'))
        .map(link => (link.getAttribute('href') || '').replace('mailto:', '').split('?')[0])
        .filter(e => e.includes('@'))
    );
    mailtoEmails.forEach(e => emails.add(e.toLowerCase()));

    // Method 3: All visible text content (catches dynamically rendered emails)
    const textContent = await page.evaluate(() => document.body?.innerText || '');
    const textEmails = textContent.match(EMAIL_REGEX) || [];
    textEmails.forEach(e => emails.add(e.toLowerCase()));

    // Method 4: Check JSON-LD structured data
    const jsonLdEmails = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      const foundEmails: string[] = [];
      scripts.forEach(script => {
        try {
          const data = JSON.parse(script.textContent || '');
          const searchObj = (obj: any) => {
            if (typeof obj === 'string' && obj.includes('@') && obj.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)) {
              foundEmails.push(obj);
            } else if (typeof obj === 'object' && obj !== null) {
              Object.values(obj).forEach(searchObj);
            }
          };
          searchObj(data);
        } catch {}
      });
      return foundEmails;
    });
    jsonLdEmails.forEach(e => emails.add(e.toLowerCase()));

    // Method 5: Check meta tags and data attributes
    const metaEmails = await page.evaluate(() => {
      const found: string[] = [];
      // Check meta tags
      document.querySelectorAll('meta').forEach(meta => {
        const content = meta.getAttribute('content') || '';
        const matches = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
        if (matches) found.push(...matches);
      });
      // Check data attributes
      document.querySelectorAll('[data-email], [data-mail], [data-contact]').forEach(el => {
        const email = el.getAttribute('data-email') || el.getAttribute('data-mail') || el.getAttribute('data-contact') || '';
        if (email.includes('@')) found.push(email);
      });
      return found;
    });
    metaEmails.forEach(e => emails.add(e.toLowerCase()));

    // Method 6: Decode common email obfuscation patterns
    const obfuscatedEmails = await page.evaluate(() => {
      const found: string[] = [];
      const text = document.body?.innerHTML || '';
      // Pattern: email [at] domain [dot] com
      const atPattern = text.match(/[a-zA-Z0-9._%+-]+\s*\[?\s*(?:at|AT)\s*\]?\s*[a-zA-Z0-9.-]+\s*\[?\s*(?:dot|DOT)\s*\]?\s*[a-zA-Z]{2,}/g);
      if (atPattern) {
        atPattern.forEach(match => {
          const cleaned = match.replace(/\s*\[?\s*(?:at|AT)\s*\]?\s*/g, '@').replace(/\s*\[?\s*(?:dot|DOT)\s*\]?\s*/g, '.');
          found.push(cleaned);
        });
      }
      return found;
    });
    obfuscatedEmails.forEach(e => emails.add(e.toLowerCase()));

    // Method 7: Specifically target footer elements (high-value location for contact info)
    const footerEmails = await page.evaluate(() => {
      const found: string[] = [];
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

      // Find footer elements by tag, class, or id
      const footerSelectors = [
        'footer',
        '[class*="footer"]',
        '[id*="footer"]',
        '[class*="Footer"]',
        '[id*="Footer"]',
        '[role="contentinfo"]',
        '.site-footer',
        '.page-footer',
        '.main-footer',
        '#site-footer',
        '#page-footer',
        '#main-footer'
      ];

      footerSelectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(el => {
            // Get text content
            const text = el.textContent || '';
            const matches = text.match(emailRegex);
            if (matches) found.push(...matches);

            // Get mailto links in footer
            el.querySelectorAll('a[href^="mailto:"]').forEach(link => {
              const href = link.getAttribute('href') || '';
              const email = href.replace('mailto:', '').split('?')[0];
              if (email.includes('@')) found.push(email);
            });
          });
        } catch {}
      });

      return found;
    });
    footerEmails.forEach(e => emails.add(e.toLowerCase()));

    // Method 8: Check header/nav area (sometimes has contact info)
    const headerEmails = await page.evaluate(() => {
      const found: string[] = [];
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

      const headerSelectors = [
        'header',
        '[class*="header"]',
        '[id*="header"]',
        'nav',
        '.topbar',
        '.top-bar',
        '#topbar'
      ];

      headerSelectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(el => {
            const text = el.textContent || '';
            const matches = text.match(emailRegex);
            if (matches) found.push(...matches);

            el.querySelectorAll('a[href^="mailto:"]').forEach(link => {
              const href = link.getAttribute('href') || '';
              const email = href.replace('mailto:', '').split('?')[0];
              if (email.includes('@')) found.push(email);
            });
          });
        } catch {}
      });

      return found;
    });
    headerEmails.forEach(e => emails.add(e.toLowerCase()));

    // Method 9: Check contact form action URLs and hidden fields
    const formEmails = await page.evaluate(() => {
      const found: string[] = [];
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

      // Check form action attributes (some forms use mailto: action)
      document.querySelectorAll('form').forEach(form => {
        const action = form.getAttribute('action') || '';
        if (action.startsWith('mailto:')) {
          const email = action.replace('mailto:', '').split('?')[0];
          if (email.includes('@')) found.push(email);
        }
        // Check for email in action URL (some services encode it)
        const actionMatches = action.match(emailRegex);
        if (actionMatches) found.push(...actionMatches);
      });

      // Check hidden input fields (often contain recipient email)
      document.querySelectorAll('input[type="hidden"]').forEach(input => {
        const name = (input.getAttribute('name') || '').toLowerCase();
        const value = input.getAttribute('value') || '';

        // Common field names for email recipients
        if (name.includes('email') || name.includes('recipient') ||
            name.includes('to') || name.includes('contact') ||
            name === '_replyto' || name === '_to') {
          if (value.includes('@')) found.push(value);
        }

        // Also check for encoded emails
        const matches = value.match(emailRegex);
        if (matches) {
          matches.forEach(m => {
            if (!m.includes('example.com') && !m.includes('domain.com')) {
              found.push(m);
            }
          });
        }
      });

      // Check data attributes on forms
      document.querySelectorAll('form[data-email], form[data-recipient], form[data-to]').forEach(form => {
        const email = form.getAttribute('data-email') ||
                      form.getAttribute('data-recipient') ||
                      form.getAttribute('data-to') || '';
        if (email.includes('@')) found.push(email);
      });

      return found;
    });
    formEmails.forEach(e => emails.add(e.toLowerCase()));

    // Method 10: Check iframes for contact information
    try {
      // Get all iframe srcs and check if they contain emails or contact forms
      const iframeData = await page.evaluate(() => {
        const found: string[] = [];
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

        document.querySelectorAll('iframe').forEach(iframe => {
          // Check src attribute for email patterns
          const src = iframe.getAttribute('src') || '';
          const srcMatches = src.match(emailRegex);
          if (srcMatches) found.push(...srcMatches);

          // Try to access same-origin iframe content
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (iframeDoc) {
              const iframeText = iframeDoc.body?.textContent || '';
              const textMatches = iframeText.match(emailRegex);
              if (textMatches) found.push(...textMatches);

              // Check mailto links in iframe
              iframeDoc.querySelectorAll('a[href^="mailto:"]').forEach(link => {
                const href = link.getAttribute('href') || '';
                const email = href.replace('mailto:', '').split('?')[0];
                if (email.includes('@')) found.push(email);
              });
            }
          } catch {
            // Cross-origin iframe, can't access content
          }
        });

        return found;
      });
      iframeData.forEach(e => emails.add(e.toLowerCase()));

      // Also check frames inside the page (Playwright frames)
      const frames = page.frames();
      for (const frame of frames) {
        if (frame === page.mainFrame()) continue;
        try {
          const frameContent = await frame.content().catch(() => '');
          const frameEmails = frameContent.match(EMAIL_REGEX) || [];
          frameEmails.forEach(e => emails.add(e.toLowerCase()));
        } catch {}
      }
    } catch {}

    return [...emails];
  } catch {
    return [];
  }
}

async function findLinkedInEmail(page: Page, baseUrl: string): Promise<string | null> {
  try {
    // Look for LinkedIn company page link
    const linkedInLink = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="linkedin.com"]');
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        // Match company pages like linkedin.com/company/name
        if (href.includes('linkedin.com/company/') ||
            href.includes('linkedin.com/in/')) {
          return href;
        }
      }
      return null;
    });

    if (!linkedInLink) return null;

    // Visit LinkedIn page
    await page.goto(linkedInLink, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await humanWait(page, 3000, 30);

    // Extract email from visible content
    const email = await page.evaluate(() => {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

      // Check about section and visible text
      const contentSelectors = [
        '[data-test-id="about-us-section"]',
        '.org-top-card-summary-info-list',
        '.org-about-company-module',
        'section.org-about-module',
        '.pv-contact-info',
        'main section'
      ];

      for (const selector of contentSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const text = el.textContent || '';
          const matches = text.match(emailRegex);
          if (matches && matches.length > 0) {
            for (const match of matches) {
              const lower = match.toLowerCase();
              if (!lower.includes('linkedin') &&
                  !lower.includes('example.com') &&
                  !lower.includes('email.com')) {
                return lower;
              }
            }
          }
        }
      }

      // Check full page text as fallback
      const pageText = document.body?.innerText || '';
      const allMatches = pageText.match(emailRegex) || [];
      for (const match of allMatches) {
        const lower = match.toLowerCase();
        if (!lower.includes('linkedin') &&
            !lower.includes('example.com') &&
            !lower.includes('email.com') &&
            !lower.includes('yourname@') &&
            !lower.includes('domain.com')) {
          return lower;
        }
      }

      return null;
    });

    return email;
  } catch {
    return null;
  }
}

async function findInstagramEmail(page: Page, baseUrl: string): Promise<string | null> {
  try {
    // Look for Instagram link on the page
    const igLink = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="instagram.com"]');
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        // Match profile URLs like instagram.com/username (not posts, reels, etc.)
        if (href.includes('instagram.com/') &&
            !href.includes('/p/') &&
            !href.includes('/reel/') &&
            !href.includes('/stories/') &&
            !href.includes('/explore/')) {
          return href;
        }
      }
      return null;
    });

    if (!igLink) return null;

    // Visit Instagram profile page
    await page.goto(igLink, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await humanWait(page, 3000, 30);

    // Extract email from visible bio content
    const email = await page.evaluate(() => {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

      // Check the bio/description area
      const bioSelectors = [
        'header section span',
        'header section div',
        '[data-testid="user-bio"]',
        'article header div',
        'main header section'
      ];

      for (const selector of bioSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const text = el.textContent || '';
          const matches = text.match(emailRegex);
          if (matches && matches.length > 0) {
            // Filter out Instagram-related emails
            for (const match of matches) {
              if (!match.toLowerCase().includes('instagram') &&
                  !match.toLowerCase().includes('facebook') &&
                  !match.toLowerCase().includes('meta.com')) {
                return match.toLowerCase();
              }
            }
          }
        }
      }

      // Also check full page content as fallback
      const pageText = document.body?.innerText || '';
      const allMatches = pageText.match(emailRegex) || [];
      for (const match of allMatches) {
        const lower = match.toLowerCase();
        if (!lower.includes('instagram') &&
            !lower.includes('facebook') &&
            !lower.includes('meta.com') &&
            !lower.includes('example.com')) {
          return lower;
        }
      }

      return null;
    });

    return email;
  } catch {
    return null;
  }
}

async function findFacebookEmail(page: Page, baseUrl: string): Promise<string | null> {
  try {
    // Look for Facebook link on the page
    const fbLink = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="facebook.com"]');
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        if (href.includes('facebook.com/') && !href.includes('/sharer')) {
          return href;
        }
      }
      return null;
    });

    if (!fbLink) return null;

    // Visit Facebook page and look for email in About section
    await page.goto(fbLink, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await humanWait(page, 2000, 35);

    const content = await page.content();
    const emails = content.match(EMAIL_REGEX) || [];

    // Return first non-facebook email found
    for (const email of emails) {
      if (!email.toLowerCase().includes('facebook.com')) {
        return email.toLowerCase();
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function searchGoogleForEmail(page: Page, businessName: string, domain: string): Promise<string | null> {
  try {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

    // Try different search queries
    const queries = [
      `"${businessName}" email`,
      `"${businessName}" contact email`,
      `site:${domain} email`,
      `"@${domain}"`,
    ];

    for (const query of queries) {
      try {
        await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`, {
          waitUntil: 'domcontentloaded',
          timeout: 10000
        });
        await humanWait(page, 1500, 40);

        // Extract all text from search results
        const pageText = await page.evaluate(() => {
          const results = document.querySelectorAll('.g, .tF2Cxc, [data-sokoban-container]');
          let text = '';
          results.forEach(r => text += ' ' + (r.textContent || ''));
          return text;
        });

        const foundEmails = pageText.match(emailRegex) || [];

        // Filter for emails matching the domain or business
        for (const email of foundEmails) {
          const emailLower = email.toLowerCase();
          const emailDomain = emailLower.split('@')[1];

          // Skip generic providers
          if (['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com'].includes(emailDomain)) continue;

          // Prefer emails that match the domain
          if (emailDomain === domain || domain.includes(emailDomain) || emailDomain.includes(domain.replace('www.', ''))) {
            return emailLower;
          }
        }
      } catch {}
    }

    return null;
  } catch {
    return null;
  }
}

async function parseSitemap(page: Page, baseUrl: string): Promise<string[]> {
  const contactPaths: string[] = [];
  const sitemapUrls = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml', '/sitemap1.xml'];
  const contactKeywords = ['contact', 'about', 'team', 'staff', 'reach', 'email', 'get-in-touch', 'connect', 'location', 'office', 'support', 'help', 'info'];

  for (const sitemapPath of sitemapUrls) {
    try {
      const response = await page.goto(new URL(sitemapPath, baseUrl).href, {
        waitUntil: 'domcontentloaded',
        timeout: 8000
      });

      if (!response || !response.ok()) continue;

      const contentType = response.headers()['content-type'] || '';
      const content = await page.content();

      // Check if it's XML content
      if (!contentType.includes('xml') && !content.includes('<?xml') && !content.includes('<urlset')) {
        continue;
      }

      // Parse sitemap XML to extract URLs
      const urlMatches = content.match(/<loc>([^<]+)<\/loc>/gi) || [];

      for (const match of urlMatches) {
        const url = match.replace(/<\/?loc>/gi, '');
        try {
          const parsedUrl = new URL(url);
          const pathname = parsedUrl.pathname.toLowerCase();

          // Check if this URL might contain contact info
          if (contactKeywords.some(kw => pathname.includes(kw))) {
            contactPaths.push(parsedUrl.pathname);
          }
        } catch {}
      }

      // If we found URLs from first sitemap, break
      if (contactPaths.length > 0) break;

      // Check for sitemap index (contains links to other sitemaps)
      const sitemapLinks = content.match(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi) || [];
      for (const sitemapMatch of sitemapLinks.slice(0, 2)) { // Check max 2 sub-sitemaps
        const subSitemapUrl = sitemapMatch.match(/<loc>([^<]+)<\/loc>/i)?.[1];
        if (subSitemapUrl) {
          try {
            await page.goto(subSitemapUrl, { waitUntil: 'domcontentloaded', timeout: 5000 });
            const subContent = await page.content();
            const subUrlMatches = subContent.match(/<loc>([^<]+)<\/loc>/gi) || [];

            for (const match of subUrlMatches) {
              const url = match.replace(/<\/?loc>/gi, '');
              try {
                const parsedUrl = new URL(url);
                const pathname = parsedUrl.pathname.toLowerCase();
                if (contactKeywords.some(kw => pathname.includes(kw))) {
                  contactPaths.push(parsedUrl.pathname);
                }
              } catch {}
            }
          } catch {}
        }
      }

      if (contactPaths.length > 0) break;
    } catch {}
  }

  // Return unique paths, limited to 10
  return [...new Set(contactPaths)].slice(0, 10);
}

async function searchLicensingBoards(page: Page, businessName: string, state: string): Promise<string | null> {
  try {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

    // Common state licensing board search queries
    const queries = [
      `"${businessName}" ${state} license board email`,
      `"${businessName}" ${state} professional license`,
      `"${businessName}" ${state} business registration contact`,
    ];

    for (const query of queries) {
      try {
        await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`, {
          waitUntil: 'domcontentloaded',
          timeout: 10000
        });
        await humanWait(page, 1500, 40);

        // Extract text from search results
        const pageText = await page.evaluate(() => {
          const results = document.querySelectorAll('.g, .tF2Cxc, [data-sokoban-container]');
          let text = '';
          results.forEach(r => text += ' ' + (r.textContent || ''));
          return text;
        });

        const foundEmails = pageText.match(emailRegex) || [];

        // Filter for valid business emails
        for (const email of foundEmails) {
          const lower = email.toLowerCase();
          const domain = lower.split('@')[1];

          // Skip generic providers and common non-business domains
          if (['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'google.com'].includes(domain)) continue;
          // Skip government domains (we want the business email, not the board's email)
          if (domain.endsWith('.gov') || domain.endsWith('.state.')) continue;

          return lower;
        }
      } catch {}
    }

    return null;
  } catch {
    return null;
  }
}

// PDF extraction disabled due to ESM compatibility issues with pdf-parse
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function extractEmailsFromPDFs(_page: Page, _baseUrl: string): Promise<string[]> {
  // TODO: Re-enable when pdf-parse ESM support improves
  return [];
}

async function findInternalContactLinks(page: Page, baseUrl: string): Promise<string[]> {
  try {
    const links = await page.evaluate((base) => {
      const found: string[] = [];
      const contactKeywords = ['contact', 'about', 'team', 'staff', 'reach', 'email', 'get-in-touch', 'connect'];
      document.querySelectorAll('a[href]').forEach(link => {
        const href = link.getAttribute('href') || '';
        const text = link.textContent?.toLowerCase() || '';
        // Check if link text or href suggests contact info
        if (contactKeywords.some(kw => href.toLowerCase().includes(kw) || text.includes(kw))) {
          try {
            const url = new URL(href, base);
            if (url.hostname === new URL(base).hostname) {
              found.push(url.pathname);
            }
          } catch {}
        }
      });
      return [...new Set(found)];
    }, baseUrl);
    return links;
  } catch {
    return [];
  }
}

export async function findEmail(website: string, browser: Browser): Promise<EmailResult> {
  let context;
  try {
    const domain = extractDomain(website);

    // Check email cache first
    try {
      const cachedEmail = await getCachedEmail(domain);
      if (cachedEmail && cachedEmail.confidence >= 0.7) {
        const cacheAge = Date.now() - cachedEmail.cachedAt;
        const cacheAgeDays = Math.round(cacheAge / (1000 * 60 * 60 * 24));
        console.log(`[Cache] Found cached email for ${domain} (${cacheAgeDays}d old): ${cachedEmail.email}`);
        return {
          email: cachedEmail.email,
          source: `cached:${cachedEmail.source}`,
          confidence: cachedEmail.confidence,
        };
      }
    } catch (cacheError) {
      console.warn('[Cache] Error reading email cache:', cacheError);
    }

    context = await createStealthContext(browser);
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const config = loadConfig();

    const baseUrl = website.startsWith('http') ? website : `https://${website}`;
    const foundEmails: Map<string, { source: string; priority: number }> = new Map();
    const visitedPaths = new Set<string>();
    const pathsToCheck = [...CONTACT_PATHS]; // Create a copy to avoid modifying global

    // Phase 0: Run API searches and catch-all detection in parallel
    // Also check cached catch-all status
    const cachedCatchAll = await getCachedCatchAll(domain).catch(() => null);
    const [hunterResult, allApisResult, detectedCatchAll] = await Promise.all([
      searchHunterDomain(domain).catch(() => null),
      searchAllApis(domain).catch(() => null),
      cachedCatchAll !== null ? Promise.resolve(cachedCatchAll) : detectCatchAll(domain).catch(() => false),
    ]);
    const isCatchAll = detectedCatchAll;

    // Cache catch-all result if we detected it fresh
    if (cachedCatchAll === null) {
      cacheCatchAll(domain, isCatchAll).catch(() => {});
    }

    // Check Hunter.io result
    if (hunterResult && hunterResult.confidence >= 0.7) {
      // Verify with Hunter if confidence is not perfect
      if (hunterResult.confidence < 0.95) {
        const verification = await verifyWithHunter(hunterResult.email);
        if (verification && verification.valid) {
          const adjustedConfidence = adjustConfidenceForCatchAll(
            Math.max(hunterResult.confidence, verification.confidence),
            isCatchAll,
            false
          );
          return {
            email: hunterResult.email,
            source: 'hunter-api',
            confidence: adjustedConfidence
          };
        }
      } else {
        return {
          email: hunterResult.email,
          source: 'hunter-api',
          confidence: hunterResult.confidence
        };
      }
    }

    // Check other API results (Apollo, Clearbit, RocketReach, Snov)
    if (allApisResult && allApisResult.confidence >= 0.8) {
      // Optionally verify with premium verification service
      const verification = await verifyEmailWithApi(allApisResult.email).catch(() => null);
      let finalConfidence = allApisResult.confidence;

      if (verification) {
        finalConfidence = verification.confidence;
        if (!verification.valid) {
          // Skip invalid emails, continue to web scraping
          console.log(`[Email] API result ${allApisResult.email} failed verification, continuing search`);
        } else {
          return {
            email: allApisResult.email,
            source: allApisResult.source,
            confidence: adjustConfidenceForCatchAll(finalConfidence, isCatchAll || verification.isCatchAll || false, false)
          };
        }
      } else {
        return {
          email: allApisResult.email,
          source: allApisResult.source,
          confidence: adjustConfidenceForCatchAll(finalConfidence, isCatchAll, false)
        };
      }
    }

    // Phase 1: Check predefined contact paths
    // First, load homepage and discover high-priority contact pages
    try {
      if (config.rateLimit.enabled) {
        await acquireRateLimit(baseUrl);
      }
      await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 15000 });
      await humanWait(page, 1500, 30);

      // Discover contact pages dynamically from homepage links
      const discoveredPaths = await discoverContactPages(page, baseUrl);
      for (const path of discoveredPaths) {
        if (!pathsToCheck.includes(path)) {
          // Insert at beginning since these are discovered high-priority pages
          pathsToCheck.unshift(path);
        }
      }
    } catch {}

    for (const path of pathsToCheck) {
      if (visitedPaths.has(path)) continue;
      visitedPaths.add(path);

      try {
        const targetUrl = new URL(path, baseUrl).href;
        if (config.rateLimit.enabled) {
          await acquireRateLimit(targetUrl);
        }
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 15000 });
        await humanWait(page, 2000, 35); // Extra wait for JS rendering with variance
        if (config.stealth.humanBehavior) {
          await simulateHumanBehavior(page);
        }

        for (const email of await extractEmailsFromPage(page)) {
          if (isValidBusinessEmail(email, domain)) {
            const priority = getPriority(email);
            if (!foundEmails.has(email) || foundEmails.get(email)!.priority > priority) {
              foundEmails.set(email, { source: path, priority });
            }
          }
        }

        // If we found multiple high-priority emails, we can stop
        const highPriorityCount = [...foundEmails.values()].filter(e => e.priority === 1).length;
        if (highPriorityCount >= 2) break;

        // Discover additional contact links from any page (not just homepage)
        if (pathsToCheck.length < 25) { // Limit total paths to check
          const additionalLinks = await findInternalContactLinks(page, baseUrl);
          for (const link of additionalLinks.slice(0, 3)) {
            if (!visitedPaths.has(link) && !pathsToCheck.includes(link)) {
              pathsToCheck.push(link);
            }
          }
        }
      } catch {}
    }

    // Phase 1.5: Full-site crawl if no high-priority emails found
    const hasHighPriorityEmail = [...foundEmails.values()].some(e => e.priority === 1);
    if (!hasHighPriorityEmail) {
      try {
        // Crawl up to 20 pages (less aggressive than max to save time)
        const crawlResults = await crawlSiteForEmails(page, baseUrl, visitedPaths, {
          maxPages: 20,
          prioritizeContactPages: true,
          timeout: 8000
        });

        for (const [crawlUrl, emails] of crawlResults) {
          for (const email of emails) {
            if (isValidBusinessEmail(email, domain)) {
              const priority = getPriority(email);
              if (!foundEmails.has(email) || foundEmails.get(email)!.priority > priority) {
                foundEmails.set(email, { source: `crawl:${new URL(crawlUrl).pathname}`, priority });
              }
            }
          }

          // If we found a high-priority email, we can stop crawling
          if ([...foundEmails.values()].some(e => e.priority === 1)) break;
        }
      } catch {}
    }

    // Phase 2: If no email found, parse sitemap.xml for additional pages
    if (foundEmails.size === 0) {
      try {
        const sitemapPaths = await parseSitemap(page, baseUrl);
        for (const path of sitemapPaths) {
          if (visitedPaths.has(path)) continue;
          visitedPaths.add(path);

          try {
            const sitemapTargetUrl = new URL(path, baseUrl).href;
            if (config.rateLimit.enabled) {
              await acquireRateLimit(sitemapTargetUrl);
            }
            await page.goto(sitemapTargetUrl, { waitUntil: 'networkidle', timeout: 10000 });
            await humanWait(page, 1500, 40);

            for (const email of await extractEmailsFromPage(page)) {
              if (isValidBusinessEmail(email, domain)) {
                const priority = getPriority(email);
                if (!foundEmails.has(email) || foundEmails.get(email)!.priority > priority) {
                  foundEmails.set(email, { source: `sitemap:${path}`, priority });
                }
              }
            }

            // If we found a high-priority email, stop searching sitemap
            if ([...foundEmails.values()].some(e => e.priority === 1)) break;
          } catch {}
        }
      } catch {}
    }

    // Phase 2.5: If no email found, check linked PDF files
    if (foundEmails.size === 0) {
      try {
        if (config.rateLimit.enabled) {
          await acquireRateLimit(baseUrl);
        }
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
        const pdfEmails = await extractEmailsFromPDFs(page, baseUrl);
        for (const email of pdfEmails) {
          if (isValidBusinessEmail(email, domain)) {
            const priority = getPriority(email);
            if (!foundEmails.has(email) || foundEmails.get(email)!.priority > priority) {
              foundEmails.set(email, { source: 'pdf-document', priority });
            }
          }
        }
      } catch {}
    }

    // Phase 3: If no email found, try Facebook page
    if (foundEmails.size === 0) {
      try {
        if (config.rateLimit.enabled) {
          await acquireRateLimit(baseUrl);
        }
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
        const fbEmail = await findFacebookEmail(page, baseUrl);
        if (fbEmail && isValidBusinessEmail(fbEmail, domain)) {
          foundEmails.set(fbEmail, { source: 'facebook', priority: 2 });
        }
      } catch {}
    }

    // Phase 3.5: If no email found, try Instagram profile
    if (foundEmails.size === 0) {
      try {
        if (config.rateLimit.enabled) {
          await acquireRateLimit(baseUrl);
        }
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
        const igEmail = await findInstagramEmail(page, baseUrl);
        if (igEmail && isValidBusinessEmail(igEmail, domain)) {
          foundEmails.set(igEmail, { source: 'instagram', priority: 2 });
        }
      } catch {}
    }

    // Phase 3.6: If no email found, try LinkedIn company page
    if (foundEmails.size === 0) {
      try {
        if (config.rateLimit.enabled) {
          await acquireRateLimit(baseUrl);
        }
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
        const liEmail = await findLinkedInEmail(page, baseUrl);
        if (liEmail && isValidBusinessEmail(liEmail, domain)) {
          foundEmails.set(liEmail, { source: 'linkedin', priority: 2 });
        }
      } catch {}
    }

    // Phase 4: If still no email, try Google search
    if (foundEmails.size === 0) {
      try {
        // Extract business name from domain or page title
        const businessName = domain.split('.')[0].replace(/-/g, ' ');
        const googleEmail = await searchGoogleForEmail(page, businessName, domain);
        if (googleEmail && isValidBusinessEmail(googleEmail, domain)) {
          foundEmails.set(googleEmail, { source: 'google-search', priority: 2 });
        }
      } catch {}
    }

    // Phase 4.5: If still no email, try state licensing board search
    if (foundEmails.size === 0) {
      try {
        // Get business name from page title
        if (config.rateLimit.enabled) {
          await acquireRateLimit(baseUrl);
        }
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
        const pageTitle = await page.title().catch(() => '');
        const businessName = pageTitle.split('|')[0].split('-')[0].trim() || domain.split('.')[0].replace(/-/g, ' ');

        // Try to extract state from address or use common abbreviations
        const pageContent = await page.content();
        const stateMatch = pageContent.match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\s*\d{5}/i);
        const state = stateMatch ? stateMatch[1].toUpperCase() : '';

        if (state) {
          const licensingEmail = await searchLicensingBoards(page, businessName, state);
          if (licensingEmail && isValidBusinessEmail(licensingEmail, domain)) {
            foundEmails.set(licensingEmail, { source: 'licensing-board', priority: 2 });
          }
        }
      } catch {}
    }

    // Phase 5: Try email permutations based on owner/staff names
    if (foundEmails.size === 0) {
      try {
        if (config.rateLimit.enabled) {
          await acquireRateLimit(baseUrl);
        }
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
        const names = await extractNamesFromPage(page);

        if (names.length > 0) {
          // Pass isCatchAll flag for proper confidence adjustment
          const permResult = await tryEmailPermutations(names, domain, isCatchAll);
          if (permResult) {
            foundEmails.set(permResult.email, { source: 'name-permutation', priority: 2 });
          }
        }
      } catch {}
    }

    // Phase 6: Try WhoisXML API for domain owner email
    if (foundEmails.size === 0) {
      try {
        const whoisResult = await getWhoisEmails(domain);
        if (whoisResult && isValidBusinessEmail(whoisResult.email, domain)) {
          foundEmails.set(whoisResult.email, { source: `whois-${whoisResult.type}`, priority: 3 });
        }
      } catch {}
    }

    await context.close();

    if (foundEmails.size > 0) {
      const sorted = [...foundEmails.entries()].sort((a, b) => a[1].priority - b[1].priority);
      const email = sorted[0][0];
      const source = sorted[0][1].source;
      // Adjust confidence based on source - all found emails get high confidence
      // since we actually discovered them (vs generating/guessing)
      let confidence = 0.90;
      if (source === 'facebook' || source === 'instagram' || source === 'linkedin') confidence = 0.85;
      if (source === 'google-search' || source === 'licensing-board' || source === 'name-permutation') confidence = 0.82;
      if (source.startsWith('whois-')) confidence = 0.80;

      // Cache the discovered email
      cacheEmail(domain, email, confidence, source, isCatchAll).catch(() => {});

      return { email, source, confidence };
    }

    // Fallback: generate and verify common email patterns
    // Try multiple patterns in parallel for speed
    const patternsToTry = ['info', 'contact', 'hello', 'office', 'mail'];
    const patternResults = await Promise.allSettled(
      patternsToTry.map(async (prefix) => {
        const testEmail = `${prefix}@${domain}`;

        // Try premium verification first if available
        const apiVerification = await verifyEmailWithApi(testEmail).catch(() => null);
        if (apiVerification && apiVerification.valid) {
          const confidence = adjustConfidenceForCatchAll(
            apiVerification.confidence,
            isCatchAll || apiVerification.isCatchAll || false,
            true
          );
          return { email: testEmail, source: 'api-verified-pattern', confidence };
        }

        // Try Hunter.io verification
        const hunterVerification = await verifyWithHunter(testEmail);
        if (hunterVerification && hunterVerification.valid && hunterVerification.confidence >= 0.7) {
          const confidence = adjustConfidenceForCatchAll(hunterVerification.confidence, isCatchAll, true);
          return { email: testEmail, source: 'hunter-verified-pattern', confidence };
        }

        // Fall back to SMTP verification
        const verification = await verifyEmail(testEmail);
        if (verification.smtpCheck === 'passed') {
          const confidence = adjustConfidenceForCatchAll(0.85, isCatchAll, true);
          return { email: testEmail, source: 'verified-pattern', confidence };
        }

        return null;
      })
    );

    // Find best verified pattern
    for (const result of patternResults) {
      if (result.status === 'fulfilled' && result.value) {
        const { email, source, confidence } = result.value;
        // Cache the verified pattern
        cacheEmail(domain, email, confidence, source, isCatchAll).catch(() => {});
        return result.value;
      }
    }

    // Last resort: quick MX check on info@
    const infoEmail = `info@${domain}`;
    try {
      const mxCheck = await quickVerify(infoEmail);
      const confidence = adjustConfidenceForCatchAll(mxCheck.confidence, isCatchAll, true);
      const source = mxCheck.hasMx ? (isCatchAll ? 'generated-catchall' : 'generated-mx-valid') : 'generated';
      // Only cache if confidence is reasonable
      if (confidence >= 0.6) {
        cacheEmail(domain, infoEmail, confidence, source, isCatchAll).catch(() => {});
      }
      return { email: infoEmail, source, confidence };
    } catch {
      const confidence = adjustConfidenceForCatchAll(0.5, isCatchAll, true);
      return { email: infoEmail, source: 'generated', confidence };
    }

  } catch (error) {
    const fallbackDomain = extractDomain(website);
    try {
      const mxCheck = await quickVerify(`info@${fallbackDomain}`);
      return {
        email: `info@${fallbackDomain}`,
        source: mxCheck.hasMx ? 'generated-mx-valid' : 'generated',
        confidence: mxCheck.confidence
      };
    } catch {
      return { email: `info@${fallbackDomain}`, source: 'generated', confidence: 0.5 };
    }
  } finally {
    if (context) {
      try { await context.close(); } catch {}
    }
  }
}
