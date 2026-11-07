// 화면 전체에서 같은 사실을 같은 모양으로 보여주기 위한 표기 도우미.

/** 거리(m)를 km 숫자 문자열로. 단일 러닝은 소수 2자리, 누적·합계는 1자리. 천 단위 쉼표 포함. */
export function formatKm(meters: number, digits: 1 | 2 = 1): string {
  return (meters / 1000).toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 남은 거리처럼 짧을 수 있는 거리: 1km 미만은 m, 이상은 km(소수 1자리). 단위 포함. */
export function formatGap(meters: number): string {
  return meters < 1000 ? `${Math.max(1, Math.round(meters / 10) * 10).toLocaleString('ko-KR')}m` : `${formatKm(meters)}km`;
}

/** 러닝 시각: "11월 7일 (토) 오후 2:54". 올해가 아니면 연도를 붙입니다. */
export function formatRunDate(iso: string): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString('ko-KR', {
    ...(sameYear ? {} : { year: 'numeric' }),
    month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit',
  });
}

/** 합계 시간: "5시간 54분", 1시간 미만은 "42분". */
export function formatHoursMinutes(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return hours ? `${hours}시간 ${minutes}분` : `${minutes}분`;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 시작 시각으로 만든 기본 러닝 이름: "토요일 오후 러닝". */
export function runTitle(iso: string): string {
  const date = new Date(iso);
  const hour = date.getHours();
  const slot = hour >= 5 && hour < 9 ? '아침' : hour < 11 && hour >= 9 ? '오전' : hour >= 11 && hour < 14 ? '점심'
    : hour >= 14 && hour < 18 ? '오후' : hour >= 18 && hour < 22 ? '저녁' : '밤';
  return `${WEEKDAYS[date.getDay()]}요일 ${slot} 러닝`;
}

// 영토 칸은 웹 메르카토르에서 반경 35m 육각형이라 실제 넓이는 위도에 따라 cos²(위도)만큼 줄어듭니다.
const HEX_RADIUS_METERS = 35;
const HEX_MERCATOR_AREA_M2 = (3 * Math.sqrt(3) / 2) * HEX_RADIUS_METERS ** 2;
const FOOTBALL_PITCH_M2 = 105 * 68;

/** 영토 넓이를 축구장 개수로: "축구장 약 12개 넓이". 1개 미만이면 null. */
export function territoryPitches(cellCount: number, latitude: number): string | null {
  const area = cellCount * HEX_MERCATOR_AREA_M2 * Math.cos(latitude * Math.PI / 180) ** 2;
  const pitches = Math.round(area / FOOTBALL_PITCH_M2);
  return pitches >= 1 ? `축구장 약 ${pitches.toLocaleString('ko-KR')}개 넓이` : null;
}
