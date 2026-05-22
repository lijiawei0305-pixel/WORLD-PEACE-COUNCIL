const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]);

export function getCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('origin');
  const allowOrigin = origin && allowedOrigins.has(origin) ? origin : '*';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Vary': 'Origin',
  };
}

export function handleOptions(request: Request): Response | null {
  if (request.method !== 'OPTIONS') {
    return null;
  }

  return new Response('ok', {
    status: 200,
    headers: getCorsHeaders(request),
  });
}
