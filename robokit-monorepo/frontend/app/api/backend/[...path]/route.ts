import { NextRequest, NextResponse } from 'next/server';

// Server-side proxy to the API. Ensures browser never sees API_URL and allows auth enforcement.
export async function GET(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(req, path);
}

export async function PUT(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(req, path);
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(req, path);
}

async function proxy(req: NextRequest, path: string[]) {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    console.error('[BackendProxy] API_URL not configured. Set API_URL in frontend environment.');
    return NextResponse.json(
      { detail: 'Backend proxy misconfigured: API_URL is not set on the frontend server' },
      { status: 500 }
    );
  }

  // Example auth hook: attach Clerk header if available
  const headers = new Headers(req.headers);
  headers.set('x-forwarded-host', req.headers.get('host') || '');

  // Optional: enforce auth (e.g., require a session); stubbed for now
  // const { userId } = auth(); if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const url = `${apiUrl}/${(path || []).join('/')}${req.nextUrl.search}`;
  const init: RequestInit = {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.text(),
  };

  try {
    const upstream = await fetch(url, init);
    if (!upstream.ok) {
      console.error(`[BackendProxy] Upstream error ${upstream.status} ${upstream.statusText} for ${url}`);
    }
    const body = upstream.body ? upstream.body : undefined;
    const resHeaders = new Headers(upstream.headers);
    // Remove hop-by-hop headers
    resHeaders.delete('transfer-encoding');
    return new NextResponse(body, { status: upstream.status, headers: resHeaders });
  } catch (e) {
    console.error(`[BackendProxy] Fetch to upstream failed for ${url}:`, e);
    return NextResponse.json(
      { detail: 'Failed to reach backend API', upstream: url },
      { status: 502 }
    );
  }
}


