import { Capacitor } from '@capacitor/core';

// Android 앱은 자체 WebView origin에서 배포 API로 접속. 웹은 같은 origin의 /api 사용.
const API_BASE = Capacitor.isNativePlatform()
  ? (import.meta.env.VITE_API_URL || 'https://wannarun-drab.vercel.app').replace(/\/$/, '')
  : '';

export type User = {
  id: string;
  username: string;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** 서버에 닿지 못한 실패(오프라인 등). ApiError와 구분합니다. */
export class NetworkError extends Error {
  constructor() { super('인터넷에 연결할 수 없어요. 연결을 확인하고 다시 시도해 주세요.'); }
}

export const UNAUTHORIZED_EVENT = 'wannarun:unauthorized';

export async function authRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } catch {
    throw new NetworkError();
  }
  if (response.status === 401 && token) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = response.status >= 500
      ? '잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요.'
      : typeof body?.detail === 'string' ? body.detail
      : response.status === 422 ? '입력 형식을 확인해 주세요.'
      : '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
    throw new ApiError(response.status, message);
  }
  return response.status === 204 ? undefined as T : response.json();
}
