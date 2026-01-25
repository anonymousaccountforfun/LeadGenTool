import { NextRequest, NextResponse } from 'next/server';
import { getJob, getBusinessesByJobId } from '@/lib/db';
import { generateExcel } from '@/lib/excel';

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  if (job.status !== 'completed') return NextResponse.json({ error: 'Job not completed yet' }, { status: 400 });
  const businesses = await getBusinessesByJobId(job.id);
  if (businesses.length === 0) return NextResponse.json({ error: 'No results to download' }, { status: 400 });
  const excelBuffer = await generateExcel(businesses, job.query);
  const filename = `leads-${job.query.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30)}-${new Date().toISOString().split('T')[0]}.xlsx`;
  return new NextResponse(new Uint8Array(excelBuffer), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${filename}"` } });
}
