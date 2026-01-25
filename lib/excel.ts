import ExcelJS from 'exceljs';
import { Business } from './db';

function getEmailStatus(email: string | null, confidence: number) {
  if (!email) return { text: 'None', color: 'A0A0A0' };
  if (confidence >= 0.8) return { text: 'Verified', color: '22C55E' };
  if (confidence >= 0.5) return { text: 'Likely', color: 'EAB308' };
  return { text: 'Check', color: 'F97316' };
}

function getBusinessTypeLabel(isB2B: boolean | null | undefined): string {
  if (isB2B === null || isB2B === undefined) return 'Unknown';
  return isB2B ? 'B2B' : 'B2C';
}

function getEmployeeSizeRange(count: number | null | undefined): string {
  if (!count) return 'Unknown';
  if (count <= 10) return '1-10';
  if (count <= 50) return '11-50';
  if (count <= 200) return '51-200';
  if (count <= 500) return '201-500';
  return '500+';
}

function formatSourceName(source: string): string {
  const sourceNames: Record<string, string> = {
    'google_maps': 'Google Maps',
    'google_search': 'Google Search',
    'google_places_api': 'Google Places API',
    'google_serp': 'Google SERP',
    'yelp': 'Yelp',
    'yelp_fusion_api': 'Yelp API',
    'foursquare_api': 'Foursquare',
    'here_api': 'HERE',
    'tomtom_api': 'TomTom',
    'yellow_pages': 'Yellow Pages',
    'bbb': 'BBB',
    'manta': 'Manta',
    'healthgrades': 'Healthgrades',
    'zocdoc': 'Zocdoc',
    'angi': 'Angi',
    'homeadvisor': 'HomeAdvisor',
    'thumbtack': 'Thumbtack',
    'tripadvisor': 'TripAdvisor',
    'instagram': 'Instagram',
  };
  return sourceNames[source] || source;
}

function getIndustryLabel(code: string | null | undefined): string {
  if (!code) return '';
  const industries: Record<string, string> = {
    'restaurant_food': 'Restaurant & Food',
    'beauty_wellness': 'Beauty & Wellness',
    'retail': 'Retail',
    'home_services': 'Home Services',
    'medical': 'Medical & Healthcare',
    'automotive': 'Automotive',
    'professional_services': 'Professional Services',
    'entertainment': 'Entertainment',
    'education': 'Education',
    'pet_services': 'Pet Services',
  };
  return industries[code] || code;
}

export async function generateExcel(businesses: Business[], query: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LeadGenTool';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Leads', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // Define columns with new B2C targeting fields
  worksheet.columns = [
    { header: 'Name', key: 'name', width: 35 },
    { header: 'Website', key: 'website', width: 40 },
    { header: 'Email', key: 'email', width: 35 },
    { header: 'Email Status', key: 'status', width: 12 },
    { header: 'Phone', key: 'phone', width: 18 },
    { header: 'Address', key: 'address', width: 45 },
    { header: 'Instagram', key: 'instagram', width: 20 },
    { header: 'Rating', key: 'rating', width: 8 },
    { header: 'Reviews', key: 'reviews', width: 10 },
    { header: 'Years in Business', key: 'years_in_business', width: 16 },
    // New B2C targeting columns
    { header: 'Employee Count', key: 'employee_count', width: 14 },
    { header: 'Company Size', key: 'company_size', width: 12 },
    { header: 'Industry', key: 'industry', width: 20 },
    { header: 'Business Type', key: 'business_type', width: 12 },
    { header: 'Data Source', key: 'source', width: 18 },
  ];

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  // Add data rows
  for (const business of businesses) {
    const status = getEmailStatus(business.email, business.email_confidence);

    const row = worksheet.addRow({
      name: business.name,
      website: business.website || '',
      email: business.email || '',
      status: status.text,
      phone: business.phone || '',
      address: business.address || '',
      instagram: business.instagram || '',
      rating: business.rating?.toFixed(1) || '',
      reviews: business.review_count || '',
      years_in_business: business.years_in_business || '',
      // New columns
      employee_count: business.employee_count || '',
      company_size: getEmployeeSizeRange(business.employee_count),
      industry: getIndustryLabel(business.industry_code),
      business_type: getBusinessTypeLabel(business.is_b2b),
      source: formatSourceName(business.source),
    });

    // Style email status cell
    const statusCell = row.getCell('status');
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${status.color}` } };
    statusCell.font = { bold: true, color: { argb: status.color === 'A0A0A0' ? 'FF333333' : 'FFFFFFFF' } };
    statusCell.alignment = { horizontal: 'center' };

    // Style business type cell (B2C = green, B2B = blue, Unknown = gray)
    const businessTypeCell = row.getCell('business_type');
    const btValue = businessTypeCell.value?.toString();
    if (btValue === 'B2C') {
      businessTypeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF22C55E' } };
      businessTypeCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    } else if (btValue === 'B2B') {
      businessTypeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
      businessTypeCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    } else {
      businessTypeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA0A0A0' } };
      businessTypeCell.font = { color: { argb: 'FF333333' } };
    }
    businessTypeCell.alignment = { horizontal: 'center' };

    // Add hyperlinks
    if (business.website) {
      row.getCell('website').value = { text: business.website, hyperlink: business.website };
      row.getCell('website').font = { color: { argb: 'FF0066CC' }, underline: true };
    }
    if (business.email) {
      row.getCell('email').value = { text: business.email, hyperlink: `mailto:${business.email}` };
      row.getCell('email').font = { color: { argb: 'FF0066CC' }, underline: true };
    }
  }

  // Add summary sheet
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 25 },
    { header: 'Value', key: 'value', width: 20 },
  ];

  // Style summary header
  const summaryHeader = summarySheet.getRow(1);
  summaryHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summaryHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };

  // Calculate summary stats
  const totalLeads = businesses.length;
  const withEmail = businesses.filter(b => b.email).length;
  const verifiedEmail = businesses.filter(b => b.email && b.email_confidence >= 0.8).length;
  const b2cCount = businesses.filter(b => b.is_b2b === false).length;
  const withEmployeeCount = businesses.filter(b => b.employee_count).length;

  // Count by source
  const sourceCounts = businesses.reduce((acc, b) => {
    const src = formatSourceName(b.source);
    acc[src] = (acc[src] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Add summary rows
  summarySheet.addRow({ metric: 'Search Query', value: query });
  summarySheet.addRow({ metric: 'Total Leads', value: totalLeads });
  summarySheet.addRow({ metric: 'With Email', value: withEmail });
  summarySheet.addRow({ metric: 'Verified Emails', value: verifiedEmail });
  summarySheet.addRow({ metric: 'B2C Businesses', value: b2cCount });
  summarySheet.addRow({ metric: 'With Employee Data', value: withEmployeeCount });
  summarySheet.addRow({ metric: '', value: '' });
  summarySheet.addRow({ metric: 'Data Sources', value: '' });

  for (const [source, count] of Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])) {
    summarySheet.addRow({ metric: `  ${source}`, value: count });
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
