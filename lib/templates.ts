/**
 * Email Outreach Templates Library
 *
 * Provides industry-specific email templates with personalization tokens
 */

export interface EmailTemplate {
  id: string;
  name: string;
  industry: string;
  subject: string;
  body: string;
  tips: string[];
  bestFor: string;
}

// Available personalization tokens
export const PERSONALIZATION_TOKENS = {
  '{business_name}': 'The business name',
  '{first_name}': 'Owner/contact first name (if available)',
  '{city}': 'Business city',
  '{industry}': 'Business industry/type',
  '{your_name}': 'Your name',
  '{your_company}': 'Your company name',
  '{your_service}': 'Your service/product',
};

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  // Restaurant & Food Service
  {
    id: 'restaurant-intro',
    name: 'Restaurant Introduction',
    industry: 'restaurant_food',
    subject: 'Quick question for {business_name}',
    body: `Hi {first_name},

I came across {business_name} while researching restaurants in {city} and wanted to reach out.

I help local restaurants like yours {your_service}. I noticed you have great reviews and thought this might be valuable for you.

Would you be open to a quick 10-minute call this week to see if it's a fit?

Best,
{your_name}
{your_company}`,
    tips: [
      'Mention specific reviews or dishes if possible',
      'Best sent Tuesday-Thursday, 10am-2pm',
      'Follow up after 3-4 days if no response',
      'Keep subject lines under 50 characters',
    ],
    bestFor: 'Initial outreach to restaurant owners',
  },
  {
    id: 'restaurant-value',
    name: 'Restaurant Value Proposition',
    industry: 'restaurant_food',
    subject: 'Idea for {business_name} to increase orders',
    body: `{first_name},

I work with restaurants in {city} to {your_service}.

One of my clients, a similar {industry} spot, saw a 30% increase in orders within the first month.

I'd love to share how they did it and see if it could work for {business_name}.

Free to chat for 15 minutes this week?

{your_name}`,
    tips: [
      'Use specific numbers when possible',
      'Reference a similar business success story',
      'Keep the email under 100 words',
      'Make the CTA easy to respond to',
    ],
    bestFor: 'Following up or second touch',
  },

  // Beauty & Wellness
  {
    id: 'salon-intro',
    name: 'Salon Introduction',
    industry: 'beauty_wellness',
    subject: 'Quick question about {business_name}',
    body: `Hi {first_name},

I found {business_name} while looking for top salons in {city} and your reviews really stood out.

I help salons and spas {your_service}. Given your strong reputation, I think you might find this valuable.

Would you have 10 minutes for a quick call this week?

Thanks,
{your_name}
{your_company}`,
    tips: [
      'Mention their positive reviews specifically',
      'Best sent Monday-Wednesday morning',
      'Salon owners often check email before the day gets busy',
      'Keep it personal - they value relationships',
    ],
    bestFor: 'Reaching salon and spa owners',
  },
  {
    id: 'wellness-booking',
    name: 'Wellness Booking Focus',
    industry: 'beauty_wellness',
    subject: 'Fill more appointment slots at {business_name}?',
    body: `{first_name},

I noticed {business_name} has great reviews in {city}. Keeping your schedule full is probably a top priority.

I help wellness businesses {your_service}, and many of my clients have reduced their no-shows by 40%.

Would you be interested in a quick conversation about how this could work for you?

Best,
{your_name}`,
    tips: [
      'Focus on solving the no-show problem',
      'Wellness professionals value work-life balance - respect their time',
      'Offer flexible meeting times',
    ],
    bestFor: 'Salons struggling with bookings',
  },

  // Medical & Healthcare
  {
    id: 'dental-intro',
    name: 'Dental Practice Introduction',
    industry: 'medical',
    subject: 'Serving dental practices like {business_name}',
    body: `Dr. {first_name},

I work with dental practices in {city} to help them {your_service}.

I understand your time is valuable, so I'll keep this brief: I'd love to share how practices like yours are seeing results with our approach.

Would a 15-minute call work this week? I'm happy to work around your patient schedule.

Respectfully,
{your_name}
{your_company}`,
    tips: [
      'Always use their professional title (Dr.)',
      'Be respectful of their limited time',
      'Best sent early morning or after 5pm',
      'Mention HIPAA compliance if relevant to your service',
    ],
    bestFor: 'Reaching dental practices',
  },
  {
    id: 'healthcare-compliance',
    name: 'Healthcare Compliance Focus',
    industry: 'medical',
    subject: 'HIPAA-compliant solution for {business_name}',
    body: `Dear Dr. {first_name},

I specialize in helping healthcare providers in {city} {your_service} while maintaining full HIPAA compliance.

Many practices similar to {business_name} have found this valuable for streamlining their operations.

I'd welcome the opportunity to discuss how we might support your practice. Would you have time for a brief call?

Best regards,
{your_name}
{your_company}`,
    tips: [
      'Emphasize compliance and security',
      'Healthcare providers are skeptical - be direct and professional',
      'Mention any relevant certifications',
    ],
    bestFor: 'Healthcare providers with compliance concerns',
  },

  // Home Services
  {
    id: 'contractor-intro',
    name: 'Contractor Introduction',
    industry: 'home_services',
    subject: 'Question for {business_name}',
    body: `Hi {first_name},

I found {business_name} while looking for contractors in {city}. Your work looks great.

I help contractors like you {your_service}. Many of my clients have grown their business significantly using these strategies.

Got 10 minutes this week to chat?

{your_name}`,
    tips: [
      'Keep it casual - contractors prefer direct communication',
      'Best sent early morning (6-8am) or evening',
      'They often check phones between jobs',
      'Text follow-up can work well',
    ],
    bestFor: 'Plumbers, electricians, roofers, etc.',
  },
  {
    id: 'landscaping-seasonal',
    name: 'Landscaping Seasonal Pitch',
    industry: 'home_services',
    subject: 'Getting ready for spring at {business_name}?',
    body: `{first_name},

Spring is around the corner and I know landscaping businesses in {city} are about to get busy.

I help landscapers {your_service}. This could help {business_name} handle the seasonal rush more effectively.

Want to chat before things get hectic?

{your_name}`,
    tips: [
      'Time emails based on seasonal demand',
      'Spring: Feb-March, Fall: Aug-September',
      'Mention weather-related services if relevant',
    ],
    bestFor: 'Landscaping and lawn care businesses',
  },

  // Professional Services
  {
    id: 'accountant-intro',
    name: 'Accountant Introduction',
    industry: 'professional_services',
    subject: 'Helping accounting firms like {business_name}',
    body: `Dear {first_name},

I work with accounting firms in {city} to help them {your_service}.

Given that {business_name} has built a strong reputation, I thought you might be interested in what we've helped similar firms achieve.

Would you be available for a brief conversation this week?

Best regards,
{your_name}
{your_company}`,
    tips: [
      'Avoid tax season (January-April 15)',
      'Best time to reach out: May-November',
      'Be professional and data-driven',
      'Accountants appreciate efficiency',
    ],
    bestFor: 'CPAs and accounting firms',
  },
  {
    id: 'lawyer-intro',
    name: 'Law Firm Introduction',
    industry: 'professional_services',
    subject: 'For {business_name} - quick question',
    body: `{first_name},

I help law firms in {city} {your_service}.

I noticed {business_name} focuses on [their practice area] and thought this might be particularly relevant for your practice.

Would you have 15 minutes this week to discuss?

Regards,
{your_name}
{your_company}`,
    tips: [
      'Research their practice area before reaching out',
      'Be direct and professional',
      'Lawyers are busy - respect their time',
      'Follow up with a LinkedIn connection',
    ],
    bestFor: 'Law firms and attorneys',
  },

  // Automotive
  {
    id: 'auto-repair-intro',
    name: 'Auto Repair Shop Introduction',
    industry: 'automotive',
    subject: 'Quick question for {business_name}',
    body: `Hi {first_name},

I came across {business_name} and saw you have great reviews in {city}.

I help auto repair shops {your_service}. Many shops I work with have seen real results.

Got a few minutes to chat this week?

{your_name}`,
    tips: [
      'Best sent Monday-Thursday morning',
      'Auto shops are busy in the morning',
      'Keep messages short and direct',
      'Mention specific review highlights',
    ],
    bestFor: 'Auto repair and service shops',
  },

  // Retail
  {
    id: 'retail-intro',
    name: 'Retail Store Introduction',
    industry: 'retail',
    subject: 'Idea for {business_name}',
    body: `Hi {first_name},

I found {business_name} while researching local shops in {city}.

I help retail businesses {your_service}. Given your store's presence in the community, I thought this might interest you.

Would you be open to a quick call to learn more?

Best,
{your_name}`,
    tips: [
      'Avoid holiday seasons (Nov-Dec)',
      'Best time: January-February, June-August',
      'Mention foot traffic or local presence',
    ],
    bestFor: 'Local retail stores and boutiques',
  },

  // Generic/Universal
  {
    id: 'generic-intro',
    name: 'Universal Introduction',
    industry: 'general',
    subject: 'Quick question for {business_name}',
    body: `Hi {first_name},

I came across {business_name} in {city} and wanted to reach out.

I help businesses like yours {your_service}. I think this could be valuable for you.

Would you have a few minutes this week to chat?

Best,
{your_name}
{your_company}`,
    tips: [
      'Personalize as much as possible',
      'Research the business before sending',
      'Keep it short and to the point',
      'Make your CTA clear and easy',
    ],
    bestFor: 'Any business type',
  },
  {
    id: 'generic-followup',
    name: 'Universal Follow-up',
    industry: 'general',
    subject: 'Following up - {business_name}',
    body: `{first_name},

I reached out last week about {your_service} and wanted to follow up.

I know you're busy, so I'll keep this brief: I think {business_name} could really benefit from what we offer.

Is there a better time to connect?

{your_name}`,
    tips: [
      'Wait 3-5 business days before following up',
      'Keep follow-ups shorter than the original',
      'After 3 follow-ups, move on',
      'Change your angle with each follow-up',
    ],
    bestFor: 'Second or third outreach attempt',
  },
];

// Industry mappings for template selection
export const INDUSTRY_MAP: Record<string, string> = {
  'restaurant': 'restaurant_food',
  'cafe': 'restaurant_food',
  'bakery': 'restaurant_food',
  'food': 'restaurant_food',
  'salon': 'beauty_wellness',
  'spa': 'beauty_wellness',
  'gym': 'beauty_wellness',
  'fitness': 'beauty_wellness',
  'wellness': 'beauty_wellness',
  'dentist': 'medical',
  'doctor': 'medical',
  'medical': 'medical',
  'healthcare': 'medical',
  'clinic': 'medical',
  'plumber': 'home_services',
  'electrician': 'home_services',
  'contractor': 'home_services',
  'landscaper': 'home_services',
  'roofer': 'home_services',
  'lawyer': 'professional_services',
  'accountant': 'professional_services',
  'attorney': 'professional_services',
  'cpa': 'professional_services',
  'auto': 'automotive',
  'car': 'automotive',
  'mechanic': 'automotive',
  'retail': 'retail',
  'store': 'retail',
  'shop': 'retail',
  'boutique': 'retail',
};

/**
 * Get templates for a specific industry
 */
export function getTemplatesForIndustry(industry: string): EmailTemplate[] {
  const normalizedIndustry = INDUSTRY_MAP[industry.toLowerCase()] || 'general';
  return EMAIL_TEMPLATES.filter(
    t => t.industry === normalizedIndustry || t.industry === 'general'
  );
}

/**
 * Get all unique industries
 */
export function getAvailableIndustries(): { value: string; label: string }[] {
  const industries = new Set(EMAIL_TEMPLATES.map(t => t.industry));
  const labels: Record<string, string> = {
    'restaurant_food': 'Restaurant & Food',
    'beauty_wellness': 'Beauty & Wellness',
    'medical': 'Medical & Healthcare',
    'home_services': 'Home Services',
    'professional_services': 'Professional Services',
    'automotive': 'Automotive',
    'retail': 'Retail',
    'general': 'General',
  };

  return Array.from(industries).map(i => ({
    value: i,
    label: labels[i] || i,
  }));
}

/**
 * Replace personalization tokens in a template
 */
export function personalizeTemplate(
  template: string,
  values: Record<string, string>
): string {
  let result = template;
  for (const [token, value] of Object.entries(values)) {
    const regex = new RegExp(token.replace(/[{}]/g, '\\$&'), 'g');
    result = result.replace(regex, value || token);
  }
  return result;
}

/**
 * Detect industry from search query
 */
export function detectIndustryFromQuery(query: string): string {
  const lowerQuery = query.toLowerCase();
  for (const [keyword, industry] of Object.entries(INDUSTRY_MAP)) {
    if (lowerQuery.includes(keyword)) {
      return industry;
    }
  }
  return 'general';
}
