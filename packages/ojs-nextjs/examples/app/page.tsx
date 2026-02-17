'use client';

import { useState } from 'react';
import { useJobStatus } from '@openjobspec/nextjs/client';
import { submitJob } from './actions';

export default function Home() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const { status, isPolling } = useJobStatus(jobId, '/api/jobs', {
    pollInterval: 2000,
    onComplete: () => setMessage('Job completed!'),
    onError: () => setMessage('Job failed.'),
  });

  async function handleSubmit(formData: FormData) {
    const type = formData.get('type') as string;
    const payload = formData.get('payload') as string;
    const args = payload ? [JSON.parse(payload)] : [];
    const id = await submitJob(type, args);
    setJobId(id);
    setMessage('');
  }

  return (
    <main style={{ maxWidth: 600, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>OpenJobSpec + Next.js</h1>

      <form action={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="type">Job Type</label>
          <br />
          <input id="type" name="type" defaultValue="email.send" required />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="payload">Payload (JSON)</label>
          <br />
          <textarea
            id="payload"
            name="payload"
            defaultValue='{"to": "user@example.com"}'
            rows={3}
            style={{ width: '100%' }}
          />
        </div>
        <button type="submit">Enqueue Job</button>
      </form>

      {jobId && (
        <div style={{ marginTop: '2rem' }}>
          <h2>Job Status</h2>
          <p><strong>ID:</strong> {jobId}</p>
          {status ? (
            <p><strong>State:</strong> {status.state}</p>
          ) : (
            <p>Loading...</p>
          )}
          {isPolling && <p>⏳ Polling for updates...</p>}
          {message && <p><strong>{message}</strong></p>}
        </div>
      )}
    </main>
  );
}
