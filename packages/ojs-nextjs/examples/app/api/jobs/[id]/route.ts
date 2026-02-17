import { NextResponse } from 'next/server';
import { getJob } from '@openjobspec/nextjs/server';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const job = await getJob(params.id);
  return NextResponse.json(job);
}
