/**
 * Scraper Debug Utilities
 *
 * Provides screenshot capture and logging for debugging scraper failures.
 */
import { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const DEBUG_DIR = '/tmp/scraper-debug';

// Ensure debug directory exists
function ensureDebugDir(): void {
  if (!fs.existsSync(DEBUG_DIR)) {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
  }
}

/**
 * Generate a filename for debug artifacts
 */
function generateFilename(source: string, query: string, type: 'screenshot' | 'html'): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sanitizedQuery = query.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
  const ext = type === 'screenshot' ? 'png' : 'html';
  return `${timestamp}_${source}_${sanitizedQuery}.${ext}`;
}

/**
 * Capture a debug screenshot when a scraper fails
 */
export async function captureDebugScreenshot(
  page: Page,
  source: string,
  query: string,
  reason: string
): Promise<string | null> {
  try {
    ensureDebugDir();
    const filename = generateFilename(source, query, 'screenshot');
    const filepath = path.join(DEBUG_DIR, filename);

    await page.screenshot({ path: filepath, fullPage: true });

    console.log(`[${source}] Debug screenshot saved: ${filepath}`);
    console.log(`[${source}] Failure reason: ${reason}`);

    return filepath;
  } catch (err) {
    console.log(`[${source}] Failed to capture debug screenshot: ${err}`);
    return null;
  }
}

/**
 * Capture page HTML for debugging
 */
export async function captureDebugHtml(
  page: Page,
  source: string,
  query: string
): Promise<string | null> {
  try {
    ensureDebugDir();
    const filename = generateFilename(source, query, 'html');
    const filepath = path.join(DEBUG_DIR, filename);

    const html = await page.content();
    fs.writeFileSync(filepath, html);

    console.log(`[${source}] Debug HTML saved: ${filepath}`);

    return filepath;
  } catch (err) {
    console.log(`[${source}] Failed to capture debug HTML: ${err}`);
    return null;
  }
}

/**
 * Log selector attempts for debugging
 */
export function logSelectorAttempt(
  source: string,
  selectorName: string,
  selector: string,
  found: boolean,
  count?: number
): void {
  if (found) {
    console.log(`[${source}] ✓ Selector "${selectorName}" matched: ${selector} (${count ?? '?'} elements)`);
  } else {
    console.log(`[${source}] ✗ Selector "${selectorName}" failed: ${selector}`);
  }
}

/**
 * Debug wrapper that captures state on failure
 */
export async function withDebugCapture<T>(
  page: Page,
  source: string,
  query: string,
  operation: string,
  fn: () => Promise<T>
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.log(`[${source}] Operation "${operation}" failed: ${err}`);
    await captureDebugScreenshot(page, source, query, `${operation} failed: ${err}`);
    return null;
  }
}

/**
 * Inspect page state for debugging - logs useful info about current page
 */
export async function inspectPageState(
  page: Page,
  source: string
): Promise<void> {
  try {
    const url = page.url();
    const title = await page.title();

    console.log(`[${source}] Page state:`);
    console.log(`[${source}]   URL: ${url}`);
    console.log(`[${source}]   Title: ${title}`);

    // Check for common blocking indicators
    const bodyText = await page.textContent('body') || '';

    if (bodyText.includes('captcha') || bodyText.includes('CAPTCHA')) {
      console.log(`[${source}]   ⚠️ CAPTCHA detected on page`);
    }
    if (bodyText.includes('blocked') || bodyText.includes('denied')) {
      console.log(`[${source}]   ⚠️ Possible block/denial detected`);
    }
    if (bodyText.includes('rate limit') || bodyText.includes('too many requests')) {
      console.log(`[${source}]   ⚠️ Rate limiting detected`);
    }

    // Log page size
    const htmlLength = (await page.content()).length;
    console.log(`[${source}]   HTML size: ${(htmlLength / 1024).toFixed(1)} KB`);

  } catch (err) {
    console.log(`[${source}] Failed to inspect page state: ${err}`);
  }
}

/**
 * List all debug files
 */
export function listDebugFiles(): string[] {
  try {
    ensureDebugDir();
    return fs.readdirSync(DEBUG_DIR)
      .filter(f => f.endsWith('.png') || f.endsWith('.html'))
      .map(f => path.join(DEBUG_DIR, f))
      .sort()
      .reverse(); // Most recent first
  } catch {
    return [];
  }
}

/**
 * Clean old debug files (keep last N)
 */
export function cleanOldDebugFiles(keepCount: number = 50): void {
  try {
    const files = listDebugFiles();
    if (files.length > keepCount) {
      const toDelete = files.slice(keepCount);
      for (const file of toDelete) {
        fs.unlinkSync(file);
      }
      console.log(`[Debug] Cleaned ${toDelete.length} old debug files`);
    }
  } catch (err) {
    console.log(`[Debug] Failed to clean old files: ${err}`);
  }
}
