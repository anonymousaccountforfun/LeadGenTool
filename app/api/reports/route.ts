import { NextRequest, NextResponse } from 'next/server';
import { submitDataReport, createDataReportsTable, type ReportType } from '@/lib/db';

const VALID_REPORT_TYPES: ReportType[] = [
  'wrong_email',
  'disconnected_phone',
  'wrong_address',
  'closed_business',
  'duplicate',
  'other',
];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, reportType, details } = body;

    // Validate input
    if (!businessId || typeof businessId !== 'number') {
      return NextResponse.json({ error: 'Invalid business ID' }, { status: 400 });
    }

    if (!reportType || !VALID_REPORT_TYPES.includes(reportType)) {
      return NextResponse.json(
        { error: 'Invalid report type', validTypes: VALID_REPORT_TYPES },
        { status: 400 }
      );
    }

    // Ensure table exists
    await createDataReportsTable();

    // Submit the report
    await submitDataReport(businessId, reportType, details);

    return NextResponse.json({
      success: true,
      message: 'Report submitted successfully',
    });
  } catch (error) {
    console.error('Failed to submit report:', error);
    return NextResponse.json(
      { error: 'Failed to submit report' },
      { status: 500 }
    );
  }
}
