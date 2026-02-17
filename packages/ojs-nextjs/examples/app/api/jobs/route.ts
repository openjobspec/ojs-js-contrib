import { NextResponse } from 'next/server';
import { enqueueJob, getJob } from '@openjobspec/nextjs/server';

export async function POST(request: Request) {
  const { type, args, options } = await request.json();
  const job = await enqueueJob(type, args, options);
  return NextResponse.json(job, { status: 201 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('id');

  if (!jobId) {
    return NextResponse.json({ error: 'Missing job id' }, { status: 400 });
  }

  const job = await getJob(jobId);
  return NextResponse.json(job);
}
