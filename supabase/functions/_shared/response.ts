import { getCorsHeaders } from './cors.ts';

export type ApiSuccess<TData> = {
  ok: true;
  data: TData;
};

export type ApiFailure = {
  ok: false;
  error: string;
  message: string;
};

export type ApiResponse<TData> = ApiSuccess<TData> | ApiFailure;

export function successResponse<TData>(request: Request, data: TData, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, data } satisfies ApiSuccess<TData>), {
    status,
    headers: {
      ...getCorsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export function errorResponse(request: Request, error: string, message: string, status = 400): Response {
  return new Response(JSON.stringify({ ok: false, error, message } satisfies ApiFailure), {
    status,
    headers: {
      ...getCorsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}
