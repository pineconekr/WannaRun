export type User = {
  id: string;
  username: string;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function authRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } catch {
    throw new Error('서버에 연결할 수 없어요. 인터넷 연결과 API 서버 실행 상태를 확인해 주세요.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = response.status >= 500
      ? '인증 서버에 연결하지 못했어요. 백엔드 서버 실행 상태와 DB 설정을 확인해 주세요.'
      : typeof body?.detail === 'string' ? body.detail
      : response.status === 422 ? '입력 형식을 확인해 주세요.'
      : '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
    throw new ApiError(response.status, message);
  }
  return response.status === 204 ? undefined as T : response.json();
}
