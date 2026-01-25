import { NextRequest, NextResponse } from 'next/server';
import { getJob, getBusinessesByJobId } from '@/lib/db';
import { exportBusinesses, ExportFormat, getAvailableFormats } from '@/lib/export';

/**
 * GET /api/jobs/[jobId]/download - Download leads in various formats
 *
 * Query params:
 *   - format: 'excel' | 'csv' | 'json' | 'tsv' (default: excel)
 *   - selected: comma-separated list of business IDs to export (optional)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params;
    const { searchParams } = new URL(request.url);

    // Get format from query params
    const formatParam = searchParams.get('format') || 'excel';
    const validFormats = getAvailableFormats().map(f => f.value);

    if (!validFormats.includes(formatParam as ExportFormat)) {
      return NextResponse.json({
        error: 'Invalid format',
        validFormats,
      }, { status: 400 });
    }

    const format = formatParam as ExportFormat;

    // Get selected IDs if specified
    const selectedParam = searchParams.get('selected');
    const selectedIds = selectedParam
      ? selectedParam.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id))
      : undefined;

    // Get job
    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.status !== 'completed') {
      return NextResponse.json({ error: 'Job not completed yet' }, { status: 400 });
    }

    // Get businesses
    const businesses = await getBusinessesByJobId(job.id);
    if (businesses.length === 0) {
      return NextResponse.json({ error: 'No results to download' }, { status: 400 });
    }

    // If selected IDs provided, validate they exist
    if (selectedIds && selectedIds.length > 0) {
      const businessIds = new Set(businesses.map(b => b.id));
      const invalidIds = selectedIds.filter(id => !businessIds.has(id));
      if (invalidIds.length > 0) {
        return NextResponse.json({
          error: 'Some selected IDs not found',
          invalidIds,
        }, { status: 400 });
      }
    }

    // Generate export
    const result = await exportBusinesses(businesses, format, job.query, {
      selectedIds,
    });

    // Return response with appropriate headers
    const headers: HeadersInit = {
      'Content-Type': result.mimeType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
    };

    // For text formats, return string directly
    if (typeof result.data === 'string') {
      return new NextResponse(result.data, { headers });
    }

    // For binary formats (Excel), return as Uint8Array
    return new NextResponse(new Uint8Array(result.data), { headers });
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json({
      error: 'Failed to generate download',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * OPTIONS - Return available formats
 */
export async function OPTIONS() {
  return NextResponse.json({
    formats: getAvailableFormats(),
  });
}
