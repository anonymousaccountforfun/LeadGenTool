import { NextResponse } from 'next/server';
import { addBusiness, getBusinessesByJobId } from '@/lib/db';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get('jobId') || 'test-job-123';

  try {
    // Try to add a test business
    await addBusiness({
      job_id: jobId,
      name: 'Test Business',
      website: 'https://test.com',
      email: 'test@test.com',
      email_source: 'test',
      email_confidence: 0.9,
      phone: '555-1234',
      address: '123 Test St',
      instagram: null,
      rating: 4.5,
      review_count: 100,
      years_in_business: 5,
      source: 'test',
      employee_count: 10,
      industry_code: 'TEST',
      is_b2b: false,
    });

    // Fetch businesses for this job
    const businesses = await getBusinessesByJobId(jobId);

    return NextResponse.json({
      success: true,
      message: 'Database write successful',
      businessCount: businesses.length,
      businesses: businesses.slice(0, 5),
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
