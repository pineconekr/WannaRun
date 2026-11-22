// 영토를 서버와 맞춥니다. 화면에 보이는 영토 자체는 territory.ts가 들고 있습니다.
import { authRequest } from './auth';
import { clearLocalTerritory, enterAccountMode, enterGuestMode, replaceRivalArea, setAccountCells, type Area } from './territory';

/** 서버의 MAX_AREA_SPAN_DEG와 같아야 합니다. 이보다 넓은 지도에서는 다른 러너의 칸을 받지 않습니다. */
export const MAX_AREA_SPAN_DEG = 0.25;

let latest = 0;
// 계정이 바뀌면 늘어나, 이전 계정으로 보낸 영역 요청의 응답을 버리게 합니다.
let generation = 0;
let lastToken: string | null = null;

/**
 * 로그인 상태에 맞춰 영토를 맞춥니다. token이 있으면 서버의 내 영토를 불러오고, 없으면 게스트 영토로 돌아갑니다.
 * 러닝을 계정에 저장한 뒤에도 불러서 서버가 확정한 값과 화면을 일치시킵니다.
 */
export async function syncTerritory(token: string | null): Promise<void> {
  const request = ++latest;
  if (token !== lastToken) {
    lastToken = token;
    generation++;
  }
  if (!token) {
    enterGuestMode();
    return;
  }
  enterAccountMode();
  const result = await authRequest<{ cells: string[]; lost?: number }>('/users/me/territory', {}, token);
  // 더 늦게 시작한 요청(로그아웃·다른 계정 포함)이 있으면 이 응답은 버립니다.
  if (request === latest) setAccountCells(result.cells, result.lost ?? 0);
}

/** 지도 영역 안의 다른 러너 칸을 받아 옵니다. 너무 넓은 영역이면 아무것도 하지 않습니다. */
export async function loadRivalArea(token: string, area: Area): Promise<void> {
  if (area.north - area.south > MAX_AREA_SPAN_DEG || area.east - area.west > MAX_AREA_SPAN_DEG) return;
  const started = generation;
  const query = new URLSearchParams(Object.entries(area).map(([key, value]) => [key, value.toFixed(6)]));
  const result = await authRequest<{ others: string[] }>(`/territory?${query}`, {}, token);
  if (started === generation) replaceRivalArea(area, result.others);
}

/** 영토만 지웁니다. 계정이면 서버의 영토를 지우고 러닝 기록은 그대로 둡니다. 서버가 실패하면 화면도 그대로 둡니다. */
export async function clearTerritory(token: string | null): Promise<void> {
  if (token) await authRequest('/users/me/territory', { method: 'DELETE' }, token);
  clearLocalTerritory();
}
