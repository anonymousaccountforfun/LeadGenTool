import * as dns from 'dns';
import * as net from 'net';

export interface VerificationResult {
  email: string;
  isValid: boolean;
  hasMxRecords: boolean;
  smtpCheck: 'passed' | 'failed' | 'skipped' | 'timeout';
  confidence: number;
}

/**
 * Look up MX records for a domain
 */
async function getMxRecords(domain: string): Promise<string[]> {
  return new Promise((resolve) => {
    dns.resolveMx(domain, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        resolve([]);
      } else {
        // Sort by priority and return hostnames
        const sorted = addresses.sort((a, b) => a.priority - b.priority);
        resolve(sorted.map(mx => mx.exchange));
      }
    });
  });
}

/**
 * Perform basic SMTP verification
 * Connects to mail server and checks if recipient is accepted
 */
async function smtpVerify(email: string, mxHost: string): Promise<'passed' | 'failed' | 'timeout'> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve('timeout');
    }, 5000); // 5 second timeout (port 25 often blocked)

    const socket = net.createConnection(25, mxHost);
    let step = 0;
    let response = '';

    socket.on('data', (data) => {
      response += data.toString();

      // Check for complete response (ends with \r\n)
      if (!response.includes('\r\n')) return;

      const code = parseInt(response.substring(0, 3));

      if (step === 0 && code === 220) {
        // Server ready, send HELO
        step = 1;
        response = '';
        socket.write('HELO verify.local\r\n');
      } else if (step === 1 && code === 250) {
        // HELO accepted, send MAIL FROM
        step = 2;
        response = '';
        socket.write('MAIL FROM:<verify@verify.local>\r\n');
      } else if (step === 2 && code === 250) {
        // MAIL FROM accepted, send RCPT TO
        step = 3;
        response = '';
        socket.write(`RCPT TO:<${email}>\r\n`);
      } else if (step === 3) {
        // Check RCPT TO response
        clearTimeout(timeout);
        socket.write('QUIT\r\n');
        socket.end();

        if (code === 250 || code === 251) {
          resolve('passed');
        } else {
          resolve('failed');
        }
      } else {
        // Unexpected response
        clearTimeout(timeout);
        socket.destroy();
        resolve('failed');
      }
    });

    socket.on('error', () => {
      clearTimeout(timeout);
      resolve('timeout'); // Treat connection errors as timeout/skip
    });

    socket.on('timeout', () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve('timeout');
    });

    socket.setTimeout(5000);
  });
}

/**
 * Verify an email address
 * Returns verification result with confidence score
 */
export async function verifyEmail(email: string): Promise<VerificationResult> {
  const domain = email.split('@')[1]?.toLowerCase();

  if (!domain) {
    return {
      email,
      isValid: false,
      hasMxRecords: false,
      smtpCheck: 'skipped',
      confidence: 0
    };
  }

  // Step 1: Check MX records
  const mxRecords = await getMxRecords(domain);
  const hasMxRecords = mxRecords.length > 0;

  if (!hasMxRecords) {
    return {
      email,
      isValid: false,
      hasMxRecords: false,
      smtpCheck: 'skipped',
      confidence: 0.1 // Very low confidence - domain can't receive email
    };
  }

  // Step 2: Try SMTP verification
  let smtpResult: 'passed' | 'failed' | 'timeout' | 'skipped' = 'skipped';

  // Try first 2 MX servers
  for (const mxHost of mxRecords.slice(0, 2)) {
    try {
      smtpResult = await smtpVerify(email, mxHost);
      if (smtpResult === 'passed') break;
      if (smtpResult === 'failed') break; // Definitively rejected
    } catch {
      continue;
    }
  }

  // Determine final confidence
  let confidence: number;
  let isValid: boolean;

  // Check if this is a common business email pattern
  const localPart = email.split('@')[0].toLowerCase();
  const isCommonBusinessPrefix = ['info', 'contact', 'hello', 'office', 'mail', 'admin', 'support', 'reception'].includes(localPart);

  if (smtpResult === 'passed') {
    confidence = 0.95;
    isValid = true;
  } else if (smtpResult === 'failed') {
    confidence = 0.2;
    isValid = false;
  } else {
    // Timeout or skipped - can't verify but MX exists
    // Port 25 is commonly blocked, so timeout doesn't mean invalid
    // Give higher confidence to common business patterns
    confidence = isCommonBusinessPrefix ? 0.85 : 0.7;
    isValid = true; // Assume valid if we can't verify
  }

  return {
    email,
    isValid,
    hasMxRecords,
    smtpCheck: smtpResult,
    confidence
  };
}

/**
 * Quick MX-only check (faster, always works)
 */
export async function quickVerify(email: string): Promise<{ hasMx: boolean; confidence: number }> {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return { hasMx: false, confidence: 0 };

  const mxRecords = await getMxRecords(domain);
  // MX-validated emails for common business prefixes get high confidence
  // because these patterns (info@, contact@) are standard for businesses
  const localPart = email.split('@')[0].toLowerCase();
  const isCommonBusinessPrefix = ['info', 'contact', 'hello', 'office', 'mail', 'admin', 'support'].includes(localPart);

  return {
    hasMx: mxRecords.length > 0,
    confidence: mxRecords.length > 0 ? (isCommonBusinessPrefix ? 0.85 : 0.75) : 0.2
  };
}
