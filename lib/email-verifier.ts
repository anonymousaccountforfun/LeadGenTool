import * as dns from 'dns';
import * as net from 'net';

/**
 * Enhanced Email Verification System
 * Provides comprehensive email deliverability checking with:
 * - MX record validation
 * - SMTP mailbox verification
 * - Catch-all domain detection
 * - Disposable email detection
 * - Deliverability scoring (0-100)
 */

// ============ Disposable Email Domains ============
// Comprehensive list of known disposable/temporary email providers
const DISPOSABLE_DOMAINS = new Set([
  // Major disposable providers
  '10minutemail.com', '10minutemail.net', 'tempmail.com', 'temp-mail.org',
  'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamail.biz',
  'mailinator.com', 'mailinator.net', 'mailinator.org', 'mailinator2.com',
  'maildrop.cc', 'getairmail.com', 'fakeinbox.com', 'tempinbox.com',
  'throwaway.email', 'throwawaymail.com', 'yopmail.com', 'yopmail.fr',
  'sharklasers.com', 'spam4.me', 'grr.la', 'guerrillamailblock.com',
  'pokemail.net', 'dispostable.com', 'trashmail.com', 'trashmail.net',
  'mailnesia.com', 'mailcatch.com', 'tempmailaddress.com', 'emailondeck.com',
  'getnada.com', 'nada.email', 'tempail.com', 'fakemailgenerator.com',
  // Additional providers
  'mohmal.com', 'emailfake.com', 'crazymailing.com', 'tempmailo.com',
  'burnermail.io', 'mytemp.email', 'disposablemail.com', 'mailsac.com',
  'inboxkitten.com', 'tempr.email', 'discard.email', 'mailnull.com',
  'spamgourmet.com', 'mintemail.com', 'mailforspam.com', 'spamfree24.org',
  'jetable.org', 'filzmail.com', 'dontemail.com', 'emailthe.net',
  'bumpymail.com', 'centermail.com', 'chammy.info', 'devnullmail.com',
  'dodgeit.com', 'dodgit.com', 'e4ward.com', 'email60.com',
  'emailias.com', 'emailmiser.com', 'emailsensei.com', 'emailtemporario.com.br',
  'emailwarden.com', 'enterto.com', 'ephemail.net', 'etranquil.com',
  'everywhere.is', 'explodemail.com', 'fastacura.com', 'fastchevy.com',
  'fastchrysler.com', 'fastkawasaki.com', 'fastmazda.com', 'fastmitsubishi.com',
  'fastnissan.com', 'fastsubaru.com', 'fastsuzuki.com', 'fasttoyota.com',
  'fastyamaha.com', 'gishpuppy.com', 'great-host.in', 'haltospam.com',
  'hatespam.org', 'hidemail.de', 'hochsitze.com', 'hotpop.com',
  'ieatspam.eu', 'ieatspam.info', 'ihateyoualot.info', 'imails.info',
  'incognitomail.com', 'incognitomail.net', 'ipoo.org', 'irish2me.com',
  'jetable.com', 'kasmail.com', 'killmail.com', 'killmail.net',
  'klassmaster.com', 'klzlv.com', 'kulturbetrieb.info', 'lhsdv.com',
  'lookugly.com', 'lopl.co.cc', 'lr78.com', 'maboard.com',
  'mail-hierarchie.net', 'mail2rss.org', 'mailbidon.com', 'mailblocks.com',
  'mailexpire.com', 'mailin8r.com', 'mailmate.com', 'mailme.ir',
  'mailme.lv', 'mailmetrash.com', 'mailmoat.com', 'mailshell.com',
  'mailsiphon.com', 'mailslite.com', 'mailzilla.com', 'mbx.cc',
  'mega.zik.dj', 'meltmail.com', 'messagebeamer.de', 'mierdamail.com',
  'mmmmail.com', 'moncourrier.fr.nf', 'monemail.fr.nf', 'monmail.fr.nf',
  'mypartyclip.de', 'myphantomemail.com', 'myspaceinc.com', 'myspaceinc.net',
  'myspacepimpedup.com', 'mytrashmail.com', 'neomailbox.com', 'nervmich.net',
  'nervtmansen.net', 'netmails.com', 'netmails.net', 'netzidiot.de',
  'neverbox.com', 'no-spam.ws', 'nobulk.com', 'noclickemail.com',
  'nogmailspam.info', 'nomail.xl.cx', 'nomail2me.com', 'nomorespamemails.com',
  'notmailinator.com', 'nowmymail.com', 'nurfuerspam.de', 'nus.edu.sg',
  'nwldx.com', 'objectmail.com', 'obobbo.com', 'odnorazovoe.ru',
  'oneoffemail.com', 'onewaymail.com', 'online.ms', 'oopi.org',
  'opayq.com', 'ordinaryamerican.net', 'otherinbox.com', 'ourklips.com',
  'outlawspam.com', 'ovpn.to', 'owlpic.com', 'pancakemail.com',
  'pjjkp.com', 'plexolan.de', 'poczta.onet.pl', 'politikerclub.de',
  'poofy.org', 'pookmail.com', 'privacy.net', 'privy-mail.com',
  'privymail.de', 'proxymail.eu', 'prtnx.com', 'punkass.com',
  'putthisinyourspamdatabase.com', 'pwrby.com', 'q314.net', 'qisdo.com',
  'qisoa.com', 'quickinbox.com', 'quickmail.nl', 'rainmail.biz',
  'rcpt.at', 'reallymymail.com', 'realtyalerts.ca', 'recode.me',
  'recursor.net', 'recyclemail.dk', 'regbypass.com', 'regbypass.comsafe-mail.net',
  'rejectmail.com', 'reliable-mail.com', 'remail.cf', 'remail.ga',
  'rhyta.com', 'rklips.com', 'rmqkr.net', 'royal.net',
  'rppkn.com', 'rtrtr.com', 's0ny.net', 'safe-mail.net',
  'safersignup.de', 'safetymail.info', 'safetypost.de', 'sandelf.de',
  'saynotospams.com', 'schafmail.de', 'schrott-email.de', 'secretemail.de',
  'secure-mail.biz', 'selfdestructingmail.com', 'senseless-entertainment.com',
  'server.ms.selfip.net', 'sharedmailbox.org', 'sharklasers.com', 'shieldedmail.com',
  'shiftmail.com', 'shitmail.me', 'shortmail.net', 'shut.name',
  'sibmail.com', 'sinnlos-mail.de', 'siteposter.net', 'skeefmail.com',
  'slaskpost.se', 'slave-auctions.net', 'slopsbox.com', 'slowfoodfoothills.xyz',
  'smashmail.de', 'smellfear.com', 'snakemail.com', 'sneakemail.com',
  'snkmail.com', 'sofimail.com', 'sofort-mail.de', 'softpls.asia',
  'sogetthis.com', 'sohu.com', 'solvemail.info', 'soodonims.com',
  'spam.la', 'spam.su', 'spam4.me', 'spamavert.com',
  'spambob.com', 'spambob.net', 'spambob.org', 'spambog.com',
  'spambog.de', 'spambog.net', 'spambog.ru', 'spambox.info',
  'spambox.irishspringrealty.com', 'spambox.us', 'spamcannon.com', 'spamcannon.net',
  'spamcero.com', 'spamcon.org', 'spamcorptastic.com', 'spamcowboy.com',
  'spamcowboy.net', 'spamcowboy.org', 'spamday.com', 'spamex.com',
  'spamfree.eu', 'spamfree24.com', 'spamfree24.de', 'spamfree24.eu',
  'spamfree24.info', 'spamfree24.net', 'spamgoes.in', 'spamherelots.com',
  'spamhereplease.com', 'spamhole.com', 'spamify.com', 'spaminator.de',
  'spamkill.info', 'spaml.com', 'spaml.de', 'spammotel.com',
  'spamobox.com', 'spamoff.de', 'spamsalad.in', 'spamslicer.com',
  'spamspot.com', 'spamthis.co.uk', 'spamthisplease.com', 'spamtroll.net',
  'speed.1s.fr', 'spoofmail.de', 'squizzy.de', 'ssoia.com',
  'startkeys.com', 'stinkefinger.net', 'stop-my-spam.cf', 'stop-my-spam.com',
  'stop-my-spam.ga', 'stop-my-spam.ml', 'stop-my-spam.tk', 'streetwisemail.com',
  'stuffmail.de', 'super-auswahl.de', 'supergreatmail.com', 'supermailer.jp',
  'superrito.com', 'superstachel.de', 'suremail.info', 'svk.jp',
  'sweetxxx.de', 'tafmail.com', 'taglead.com', 'tagmymedia.com',
  'tagyourself.com', 'talkinator.com', 'tapchicuoihoi.com', 'techemail.com',
  'techgroup.me', 'teewars.org', 'teleosaurs.xyz', 'teleworm.com',
  'teleworm.us', 'temp.emeraldwebmail.com', 'temp.headstrong.de', 'tempail.com',
  'tempalias.com', 'tempe-mail.com', 'tempemail.biz', 'tempemail.co.za',
  'tempemail.com', 'tempemail.net', 'tempinbox.co.uk', 'tempinbox.com',
  'tempmail.co', 'tempmail.de', 'tempmail.eu', 'tempmail.it',
  'tempmail.net', 'tempmail.us', 'tempmail2.com', 'tempmaildemo.com',
  'tempmailer.com', 'tempmailer.de', 'tempomail.fr', 'temporarily.de',
  'temporarioemail.com.br', 'temporaryemail.net', 'temporaryemail.us', 'temporaryforwarding.com',
  'temporaryinbox.com', 'temporarymailaddress.com', 'tempthe.net', 'tempymail.com',
  'tfwno.gf', 'thanksnospam.info', 'thankyou2010.com', 'thecloudindex.com',
  'thisisnotmyrealemail.com', 'throam.com', 'throwam.com', 'throwawayemailaddress.com',
  'tilien.com', 'tittbit.in', 'tmailinator.com', 'toiea.com',
  'toomail.biz', 'topranklist.de', 'tradermail.info', 'trash-amil.com',
  'trash-mail.at', 'trash-mail.com', 'trash-mail.de', 'trash-mail.ga',
  'trash-mail.gq', 'trash-mail.ml', 'trash-mail.tk', 'trash2009.com',
  'trash2010.com', 'trash2011.com', 'trashbox.eu', 'trashdevil.com',
  'trashdevil.de', 'trashemail.de', 'trashmail.at', 'trashmail.com',
  'trashmail.de', 'trashmail.me', 'trashmail.net', 'trashmail.org',
  'trashmail.ws', 'trashmailer.com', 'trashymail.com', 'trashymail.net',
  'trbvm.com', 'trickmail.net', 'trillianpro.com', 'tryalert.com',
  'ttszuo.xyz', 'tualias.com', 'turoid.com', 'turual.com',
  'tvchd.com', 'twinmail.de', 'tyldd.com', 'ubismail.net',
  'uggsrock.com', 'umail.net', 'upliftnow.com', 'uplipht.com',
  'uroid.com', 'us.af', 'username.e4ward.com', 'valemail.net',
  'venompen.com', 'veryrealemail.com', 'viditag.com', 'viewcastmedia.com',
  'viewcastmedia.net', 'viewcastmedia.org', 'viralplays.com', 'vkcode.ru',
  'vmani.com', 'vomoto.com', 'vpn.st', 'vsimcard.com',
  'vubby.com', 'wasteland.rfc822.org', 'webemail.me', 'webm4il.info',
  'webuser.in', 'wee.my', 'weg-werf-email.de', 'wegwerf-email-addressen.de',
  'wegwerf-emails.de', 'wegwerfadresse.de', 'wegwerfemail.com', 'wegwerfemail.de',
  'wegwerfmail.de', 'wegwerfmail.info', 'wegwerfmail.net', 'wegwerfmail.org',
  'wetrainbayarea.com', 'wetrainbayarea.org', 'wh4f.org', 'whatiaas.com',
  'whatpaas.com', 'whopy.com', 'whtjddn.33mail.com', 'whyspam.me',
  'willhackforfood.biz', 'willselfdestruct.com', 'winemaven.info', 'wolfsmail.tk',
  'worldspace.link', 'wronghead.com', 'wuzup.net', 'wuzupmail.net',
  'wwwnew.eu', 'x.ip6.li', 'xagloo.co', 'xagloo.com',
  'xcompress.com', 'xemaps.com', 'xents.com', 'xmaily.com',
  'xoxy.net', 'yapped.net', 'yep.it', 'yogamaven.com',
  'yomail.info', 'yopmail.com', 'yopmail.fr', 'yopmail.gq',
  'yopmail.net', 'yourdomain.com', 'ypmail.webarnak.fr.eu.org', 'yuurok.com',
  'z1p.biz', 'za.com', 'zehnminuten.de', 'zehnminutenmail.de',
  'zetmail.com', 'zippymail.info', 'zoaxe.com', 'zoemail.com',
  'zoemail.net', 'zoemail.org', 'zomg.info', 'zxcv.com',
  'zxcvbnm.com', 'zzz.com',
]);

// ============ Types ============

export interface VerificationResult {
  email: string;
  isValid: boolean;
  isDeliverable: boolean;
  score: number; // 0-100 deliverability score
  checks: {
    formatValid: boolean;
    mxRecords: boolean;
    smtpValid: 'passed' | 'failed' | 'timeout' | 'skipped';
    isCatchAll: boolean;
    isDisposable: boolean;
    isRoleAccount: boolean;
  };
  details: {
    domain: string;
    localPart: string;
    mxHost: string | null;
    verificationSource: string;
    reason: string;
  };
  // Legacy compatibility
  hasMxRecords: boolean;
  smtpCheck: 'passed' | 'failed' | 'skipped' | 'timeout';
  confidence: number; // 0-1 for backwards compatibility
}

export interface QuickVerifyResult {
  hasMx: boolean;
  confidence: number;
  isDisposable: boolean;
  score: number;
}

// ============ Helper Functions ============

/**
 * Validate email format using regex
 */
function isValidEmailFormat(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

/**
 * Check if email is from a disposable domain
 */
export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return DISPOSABLE_DOMAINS.has(domain);
}

/**
 * Check if email is a role-based account (info@, support@, etc.)
 */
export function isRoleAccount(email: string): boolean {
  const localPart = email.split('@')[0]?.toLowerCase();
  if (!localPart) return false;

  const roleAccounts = [
    'info', 'contact', 'support', 'help', 'sales', 'admin', 'webmaster',
    'postmaster', 'hostmaster', 'abuse', 'noc', 'security', 'mailer-daemon',
    'nobody', 'marketing', 'team', 'office', 'hello', 'mail', 'enquiries',
    'billing', 'accounts', 'hr', 'jobs', 'careers', 'press', 'media',
    'legal', 'privacy', 'compliance', 'feedback', 'suggestions', 'newsletter',
    'subscribe', 'unsubscribe', 'no-reply', 'noreply', 'donotreply',
    'notifications', 'alerts', 'updates', 'news', 'promotions',
  ];

  return roleAccounts.includes(localPart);
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
 * Perform SMTP verification to check if mailbox exists
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
        socket.write('HELO verify.leadgentool.com\r\n');
      } else if (step === 1 && code === 250) {
        // HELO accepted, send MAIL FROM
        step = 2;
        response = '';
        socket.write('MAIL FROM:<verify@leadgentool.com>\r\n');
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
 * Detect if domain is catch-all (accepts any email address)
 */
async function detectCatchAll(domain: string, mxHost: string): Promise<boolean> {
  // Generate random email that definitely doesn't exist
  const randomLocal = `nonexistent_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const testEmail = `${randomLocal}@${domain}`;

  const result = await smtpVerify(testEmail, mxHost);

  // If random email is accepted, it's catch-all
  return result === 'passed';
}

/**
 * Calculate deliverability score (0-100) based on verification results
 */
function calculateScore(checks: VerificationResult['checks'], smtpResult: string): number {
  let score = 0;

  // Format valid: +10
  if (checks.formatValid) score += 10;

  // MX records exist: +25
  if (checks.mxRecords) score += 25;

  // SMTP verification
  if (smtpResult === 'passed') {
    score += 40; // Strong signal
  } else if (smtpResult === 'timeout') {
    score += 20; // Inconclusive, but MX exists
  }
  // 'failed' adds nothing

  // Deductions
  if (checks.isCatchAll) {
    score -= 15; // Catch-all reduces confidence
  }

  if (checks.isDisposable) {
    score -= 30; // Disposable is very bad
  }

  // Role accounts are neutral for businesses
  // (info@, contact@ are often the right address)

  // Ensure score is in valid range
  return Math.max(0, Math.min(100, score));
}

// ============ Main Verification Functions ============

/**
 * Comprehensive email verification
 * Returns detailed verification result with 0-100 score
 */
export async function verifyEmail(email: string): Promise<VerificationResult> {
  const emailLower = email.toLowerCase().trim();
  const [localPart, domain] = emailLower.split('@');

  // Initialize result structure
  const result: VerificationResult = {
    email: emailLower,
    isValid: false,
    isDeliverable: false,
    score: 0,
    checks: {
      formatValid: false,
      mxRecords: false,
      smtpValid: 'skipped',
      isCatchAll: false,
      isDisposable: false,
      isRoleAccount: false,
    },
    details: {
      domain: domain || '',
      localPart: localPart || '',
      mxHost: null,
      verificationSource: 'internal',
      reason: '',
    },
    // Legacy fields
    hasMxRecords: false,
    smtpCheck: 'skipped',
    confidence: 0,
  };

  // Step 1: Format validation
  if (!isValidEmailFormat(emailLower)) {
    result.details.reason = 'Invalid email format';
    return result;
  }
  result.checks.formatValid = true;

  // Step 2: Check disposable
  result.checks.isDisposable = isDisposableEmail(emailLower);
  if (result.checks.isDisposable) {
    result.score = 10;
    result.confidence = 0.1;
    result.details.reason = 'Disposable email domain';
    return result;
  }

  // Step 3: Check role account
  result.checks.isRoleAccount = isRoleAccount(emailLower);

  // Step 4: MX record lookup
  const mxRecords = await getMxRecords(domain);
  result.checks.mxRecords = mxRecords.length > 0;
  result.hasMxRecords = result.checks.mxRecords;

  if (!result.checks.mxRecords) {
    result.score = 15;
    result.confidence = 0.15;
    result.details.reason = 'No MX records found - domain cannot receive email';
    return result;
  }

  result.details.mxHost = mxRecords[0];

  // Step 5: SMTP verification
  let smtpResult: 'passed' | 'failed' | 'timeout' | 'skipped' = 'skipped';

  for (const mxHost of mxRecords.slice(0, 2)) {
    try {
      smtpResult = await smtpVerify(emailLower, mxHost);
      result.details.mxHost = mxHost;

      if (smtpResult === 'passed' || smtpResult === 'failed') {
        break; // Definitive result
      }
    } catch {
      continue;
    }
  }

  result.checks.smtpValid = smtpResult;
  result.smtpCheck = smtpResult;

  // Step 6: Catch-all detection (only if SMTP passed)
  if (smtpResult === 'passed' && result.details.mxHost) {
    try {
      result.checks.isCatchAll = await detectCatchAll(domain, result.details.mxHost);
    } catch {
      result.checks.isCatchAll = false;
    }
  }

  // Step 7: Calculate final score
  result.score = calculateScore(result.checks, smtpResult);

  // Determine validity
  result.isValid = result.score >= 50;
  result.isDeliverable = smtpResult === 'passed' && !result.checks.isCatchAll;

  // Calculate legacy confidence (0-1)
  result.confidence = result.score / 100;

  // Set reason
  if (smtpResult === 'passed') {
    if (result.checks.isCatchAll) {
      result.details.reason = 'SMTP verified but domain is catch-all (accepts any address)';
    } else {
      result.details.reason = 'SMTP verified - mailbox exists';
    }
  } else if (smtpResult === 'failed') {
    result.details.reason = 'SMTP rejected - mailbox does not exist';
  } else {
    result.details.reason = 'MX valid but SMTP verification timed out (port 25 may be blocked)';
  }

  return result;
}

/**
 * Quick verification (MX-only, faster)
 * Use when you need fast results and can accept lower confidence
 */
export async function quickVerify(email: string): Promise<QuickVerifyResult> {
  const emailLower = email.toLowerCase().trim();
  const domain = emailLower.split('@')[1];

  if (!domain) {
    return { hasMx: false, confidence: 0, isDisposable: false, score: 0 };
  }

  // Check disposable first (fast, no network)
  const disposable = isDisposableEmail(emailLower);
  if (disposable) {
    return { hasMx: true, confidence: 0.1, isDisposable: true, score: 10 };
  }

  // Check MX records
  const mxRecords = await getMxRecords(domain);
  const hasMx = mxRecords.length > 0;

  if (!hasMx) {
    return { hasMx: false, confidence: 0.15, isDisposable: false, score: 15 };
  }

  // Calculate confidence based on email pattern
  const localPart = emailLower.split('@')[0];
  const isCommonBusinessPrefix = [
    'info', 'contact', 'hello', 'office', 'mail', 'admin', 'support', 'reception'
  ].includes(localPart);

  const confidence = isCommonBusinessPrefix ? 0.85 : 0.75;
  const score = isCommonBusinessPrefix ? 85 : 75;

  return { hasMx, confidence, isDisposable: false, score };
}

/**
 * Batch verify multiple emails
 * More efficient than calling verifyEmail() in a loop
 */
export async function batchVerify(
  emails: string[],
  options: { concurrency?: number; quickMode?: boolean } = {}
): Promise<Map<string, VerificationResult | QuickVerifyResult>> {
  const { concurrency = 5, quickMode = false } = options;
  const results = new Map<string, VerificationResult | QuickVerifyResult>();

  // Process in batches
  for (let i = 0; i < emails.length; i += concurrency) {
    const batch = emails.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(email =>
        quickMode ? quickVerify(email) : verifyEmail(email)
      )
    );

    batch.forEach((email, index) => {
      results.set(email.toLowerCase(), batchResults[index]);
    });
  }

  return results;
}

/**
 * Get human-readable verification status
 */
export function getVerificationStatus(result: VerificationResult): {
  status: 'verified' | 'likely' | 'risky' | 'invalid';
  label: string;
  color: string;
} {
  if (result.score >= 80 && result.isDeliverable) {
    return { status: 'verified', label: 'Verified', color: '22C55E' };
  }
  if (result.score >= 60) {
    return { status: 'likely', label: 'Likely Valid', color: 'EAB308' };
  }
  if (result.score >= 40) {
    return { status: 'risky', label: 'Risky', color: 'F97316' };
  }
  return { status: 'invalid', label: 'Invalid', color: 'EF4444' };
}
