/**
 * Test 5: Email Quality Audit
 *
 * Purpose: Verify found emails are real and deliverable
 * Target: Confidence scores accurately predict deliverability
 */
import * as dns from 'dns';
import * as net from 'net';
import { type TestResult } from './test-utils';

interface EmailValidation {
  email: string;
  source: string;
  confidence: number;
  hasMx: boolean;
  smtpResponds: boolean;
  smtpAccepts: boolean | null; // null if couldn't verify
  isRoleBased: boolean;
  isDisposable: boolean;
  validationScore: number;
  verdict: 'valid' | 'likely_valid' | 'uncertain' | 'likely_invalid' | 'invalid';
}

interface QualityAuditResult {
  totalSampled: number;
  validations: EmailValidation[];
  byConfidenceTier: {
    high: { count: number; validRate: number };
    medium: { count: number; validRate: number };
    low: { count: number; validRate: number };
  };
  bySource: Record<string, { count: number; validRate: number }>;
  overallValidRate: number;
  confidenceAccuracy: number; // How well confidence predicts validity
}

// Known disposable email domains
const DISPOSABLE_DOMAINS = [
  'tempmail.com', 'throwaway.com', 'mailinator.com', 'guerrillamail.com',
  'temp-mail.org', '10minutemail.com', 'fakeinbox.com', 'trashmail.com',
];

// Role-based prefixes (not personal emails)
const ROLE_PREFIXES = [
  'info', 'contact', 'sales', 'support', 'admin', 'hello', 'team',
  'office', 'mail', 'enquiries', 'inquiries', 'help', 'service',
];

/**
 * Check if domain has MX records
 */
async function hasMxRecords(domain: string): Promise<boolean> {
  return new Promise((resolve) => {
    dns.resolveMx(domain, (err, addresses) => {
      resolve(!err && addresses && addresses.length > 0);
    });
  });
}

/**
 * Check if SMTP server responds
 */
async function smtpResponds(domain: string): Promise<boolean> {
  return new Promise((resolve) => {
    dns.resolveMx(domain, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        resolve(false);
        return;
      }

      const mxHost = addresses.sort((a, b) => a.priority - b.priority)[0].exchange;
      const socket = new net.Socket();
      let responded = false;

      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 5000);

      socket.on('connect', () => {
        responded = true;
      });

      socket.on('data', (data) => {
        const response = data.toString();
        if (response.startsWith('220')) {
          clearTimeout(timeout);
          socket.write('QUIT\r\n');
          socket.destroy();
          resolve(true);
        }
      });

      socket.on('error', () => {
        clearTimeout(timeout);
        resolve(responded);
      });

      socket.connect(25, mxHost);
    });
  });
}

/**
 * Validate a single email
 */
async function validateEmail(email: string, source: string, confidence: number): Promise<EmailValidation> {
  const domain = email.split('@')[1]?.toLowerCase() || '';
  const localPart = email.split('@')[0]?.toLowerCase() || '';

  // Check if role-based
  const isRoleBased = ROLE_PREFIXES.some(p => localPart === p || localPart.startsWith(p + '.'));

  // Check if disposable
  const isDisposable = DISPOSABLE_DOMAINS.some(d => domain.includes(d));

  // Check MX records
  const hasMx = await hasMxRecords(domain);

  // Check SMTP
  let smtpOk = false;
  if (hasMx) {
    smtpOk = await smtpResponds(domain);
  }

  // Calculate validation score
  let validationScore = 0;
  if (hasMx) validationScore += 0.4;
  if (smtpOk) validationScore += 0.3;
  if (!isDisposable) validationScore += 0.2;
  if (!isRoleBased) validationScore += 0.1; // Slight bonus for personal emails

  // Determine verdict
  let verdict: EmailValidation['verdict'];
  if (validationScore >= 0.8) verdict = 'valid';
  else if (validationScore >= 0.6) verdict = 'likely_valid';
  else if (validationScore >= 0.4) verdict = 'uncertain';
  else if (validationScore >= 0.2) verdict = 'likely_invalid';
  else verdict = 'invalid';

  return {
    email,
    source,
    confidence,
    hasMx,
    smtpResponds: smtpOk,
    smtpAccepts: null, // Would require full RCPT TO check
    isRoleBased,
    isDisposable,
    validationScore,
    verdict,
  };
}

/**
 * Run quality audit on collected emails
 */
export async function runTest5(collectedResults: TestResult[]): Promise<QualityAuditResult> {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 5: EMAIL QUALITY AUDIT');
  console.log('═'.repeat(70));

  // Get emails with confidence scores
  const emailsWithScores = collectedResults
    .filter(r => r.email && r.emailConfidence !== null)
    .map(r => ({
      email: r.email!,
      source: r.emailSource || 'unknown',
      confidence: r.emailConfidence!,
    }));

  if (emailsWithScores.length === 0) {
    console.log('⚠️  No emails to audit from previous tests');
    return {
      totalSampled: 0,
      validations: [],
      byConfidenceTier: {
        high: { count: 0, validRate: 0 },
        medium: { count: 0, validRate: 0 },
        low: { count: 0, validRate: 0 },
      },
      bySource: {},
      overallValidRate: 0,
      confidenceAccuracy: 0,
    };
  }

  // Stratified sample: 50 emails across confidence tiers
  const highConf = emailsWithScores.filter(e => e.confidence >= 0.8);
  const medConf = emailsWithScores.filter(e => e.confidence >= 0.6 && e.confidence < 0.8);
  const lowConf = emailsWithScores.filter(e => e.confidence < 0.6);

  const sample: typeof emailsWithScores = [];

  // Take up to 15 from each tier
  const takeUpTo = (arr: typeof emailsWithScores, n: number) => {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, n);
  };

  sample.push(...takeUpTo(highConf, 15));
  sample.push(...takeUpTo(medConf, 20));
  sample.push(...takeUpTo(lowConf, 15));

  console.log(`\nSample distribution:`);
  console.log(`  High confidence (80%+): ${Math.min(highConf.length, 15)} of ${highConf.length}`);
  console.log(`  Medium confidence (60-80%): ${Math.min(medConf.length, 20)} of ${medConf.length}`);
  console.log(`  Low confidence (<60%): ${Math.min(lowConf.length, 15)} of ${lowConf.length}`);
  console.log(`  Total sample: ${sample.length}`);

  // Validate each email
  console.log('\n📧 Validating emails...');
  const validations: EmailValidation[] = [];

  for (let i = 0; i < sample.length; i++) {
    const { email, source, confidence } = sample[i];
    process.stdout.write(`\r  [${i + 1}/${sample.length}] ${email.slice(0, 40).padEnd(40)}`);

    const validation = await validateEmail(email, source, confidence);
    validations.push(validation);

    // Small delay to avoid overwhelming DNS/SMTP servers
    await new Promise(r => setTimeout(r, 200));
  }

  // Analyze by confidence tier
  const analyzeT = (v: EmailValidation[]) => ({
    count: v.length,
    validRate: v.length > 0 ? (v.filter(e => e.verdict === 'valid' || e.verdict === 'likely_valid').length / v.length) * 100 : 0,
  });

  const highValidations = validations.filter(v => v.confidence >= 0.8);
  const medValidations = validations.filter(v => v.confidence >= 0.6 && v.confidence < 0.8);
  const lowValidations = validations.filter(v => v.confidence < 0.6);

  const byConfidenceTier = {
    high: analyzeT(highValidations),
    medium: analyzeT(medValidations),
    low: analyzeT(lowValidations),
  };

  // Analyze by source
  const sources = [...new Set(validations.map(v => v.source))];
  const bySource: Record<string, { count: number; validRate: number }> = {};
  for (const source of sources) {
    const sourceValidations = validations.filter(v => v.source === source);
    bySource[source] = analyzeT(sourceValidations);
  }

  // Overall stats
  const validCount = validations.filter(v => v.verdict === 'valid' || v.verdict === 'likely_valid').length;
  const overallValidRate = (validCount / validations.length) * 100;

  // Calculate confidence accuracy (correlation between confidence and validity)
  // Simple: compare average confidence of valid vs invalid emails
  const validEmails = validations.filter(v => v.verdict === 'valid' || v.verdict === 'likely_valid');
  const invalidEmails = validations.filter(v => v.verdict === 'invalid' || v.verdict === 'likely_invalid');
  const avgValidConf = validEmails.length > 0 ? validEmails.reduce((s, v) => s + v.confidence, 0) / validEmails.length : 0;
  const avgInvalidConf = invalidEmails.length > 0 ? invalidEmails.reduce((s, v) => s + v.confidence, 0) / invalidEmails.length : 0;
  const confidenceAccuracy = avgValidConf > avgInvalidConf ? ((avgValidConf - avgInvalidConf) / avgValidConf) * 100 : 0;

  // Print results
  console.log('\n\n' + '='.repeat(70));
  console.log('QUALITY AUDIT RESULTS');
  console.log('='.repeat(70));

  console.log('\n📊 By Confidence Tier:');
  console.log('┌─────────────────┬─────────┬────────────┬────────────┐');
  console.log('│ Tier            │ Sampled │ Valid/LV   │ Valid Rate │');
  console.log('├─────────────────┼─────────┼────────────┼────────────┤');
  console.log(`│ High (80%+)     │ ${String(byConfidenceTier.high.count).padEnd(7)} │ ${String(Math.round(byConfidenceTier.high.count * byConfidenceTier.high.validRate / 100)).padEnd(10)} │ ${(byConfidenceTier.high.validRate.toFixed(0) + '%').padEnd(10)} │`);
  console.log(`│ Medium (60-80%) │ ${String(byConfidenceTier.medium.count).padEnd(7)} │ ${String(Math.round(byConfidenceTier.medium.count * byConfidenceTier.medium.validRate / 100)).padEnd(10)} │ ${(byConfidenceTier.medium.validRate.toFixed(0) + '%').padEnd(10)} │`);
  console.log(`│ Low (<60%)      │ ${String(byConfidenceTier.low.count).padEnd(7)} │ ${String(Math.round(byConfidenceTier.low.count * byConfidenceTier.low.validRate / 100)).padEnd(10)} │ ${(byConfidenceTier.low.validRate.toFixed(0) + '%').padEnd(10)} │`);
  console.log('└─────────────────┴─────────┴────────────┴────────────┘');

  console.log('\n📊 By Source:');
  for (const [source, stats] of Object.entries(bySource)) {
    console.log(`  ${source.padEnd(30)} ${stats.count} emails, ${stats.validRate.toFixed(0)}% valid`);
  }

  console.log('\n📊 Overall:');
  console.log(`  Total sampled: ${validations.length}`);
  console.log(`  Valid/Likely valid: ${validCount} (${overallValidRate.toFixed(1)}%)`);

  // Confidence accuracy check
  console.log('\n' + '-'.repeat(70));
  console.log('CONFIDENCE CALIBRATION');
  console.log('-'.repeat(70));
  console.log(`Average confidence of valid emails: ${(avgValidConf * 100).toFixed(1)}%`);
  console.log(`Average confidence of invalid emails: ${(avgInvalidConf * 100).toFixed(1)}%`);

  if (byConfidenceTier.high.validRate >= 90 && byConfidenceTier.low.validRate < byConfidenceTier.high.validRate) {
    console.log('\n✅ CONFIDENCE SCORES ARE WELL CALIBRATED');
    console.log('   Higher confidence = higher validity');
  } else if (byConfidenceTier.high.validRate < 80) {
    console.log('\n⚠️  HIGH CONFIDENCE EMAILS NOT MEETING EXPECTATIONS');
    console.log('   Consider recalibrating confidence scoring');
  } else if (byConfidenceTier.low.validRate > byConfidenceTier.high.validRate) {
    console.log('\n❌ CONFIDENCE SCORES ARE INVERTED');
    console.log('   Lower confidence performing better than higher - scoring is broken');
  }

  // Role-based analysis
  const roleBasedCount = validations.filter(v => v.isRoleBased).length;
  console.log(`\n📧 Email types:`);
  console.log(`  Role-based (info@, contact@, etc.): ${roleBasedCount} (${((roleBasedCount / validations.length) * 100).toFixed(0)}%)`);
  console.log(`  Personal/Named: ${validations.length - roleBasedCount} (${(((validations.length - roleBasedCount) / validations.length) * 100).toFixed(0)}%)`);

  return {
    totalSampled: validations.length,
    validations,
    byConfidenceTier,
    bySource,
    overallValidRate,
    confidenceAccuracy,
  };
}

// Run if executed directly (requires results from other tests)
if (require.main === module) {
  console.log('Test 5 requires results from Tests 1-4.');
  console.log('Run the full suite with: npx tsx scripts/scale-tests/run-all.ts');
}
