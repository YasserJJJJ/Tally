export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Calls the same-origin Next.js proxy, which forwards to the FastAPI service. */
export async function api<T = Record<string, unknown>>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    cache: 'no-store',
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json() as T & { detail?: unknown };
  if (!response.ok) {
    const detail = data.detail;
    const message = typeof detail === 'string' ? detail
      : Array.isArray(detail) ? detail.map((item: { msg?: string }) => item.msg?.replace(/^Value error, /, '')).filter(Boolean).join(' ')
      : 'Unable to save. Please try again.';
    throw new ApiError(message, response.status);
  }
  return data as T;
}
