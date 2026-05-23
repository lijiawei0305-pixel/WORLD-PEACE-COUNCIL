/**
 * CORS 配置：白名单从环境变量 ALLOWED_ORIGINS 读取（逗号分隔）；
 * origin 不在白名单则不返回 Access-Control-Allow-Origin header，让浏览器侧严格拒绝。
 *
 * 配置示例（supabase/.env.local 或部署平台的密钥配置）：
 *   ALLOWED_ORIGINS=http://localhost:5173,https://your-production-domain.com
 *
 * 不配置时回退到本地开发常用端口，方便首次跑起来。
 */

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://[::1]:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://[::1]:4173',
].join(',');

function readAllowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS')?.trim();
  return (raw && raw.length > 0 ? raw : DEFAULT_ALLOWED_ORIGINS)
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

const allowedOrigins = readAllowedOrigins();

export function getCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
    'Vary': 'Origin',
  };

  if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
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
