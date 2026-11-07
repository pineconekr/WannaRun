export type BusanEvent = {
  id: string;
  name: string;
  date: string;
  location: string;
  distances: string[];
  registration: string;
  sourceUrl: string;
};

// KorMarathon 부산 2026 일정 페이지를 2026-11-07 기준으로 정리한 목록입니다.
export const busanEvents: BusanEvent[] = [
  {
    id: 'sasang-eco-2026',
    name: '2026 전국사상에코마라톤',
    date: '2026-11-08',
    location: '사상구 삼락생태공원 일원',
    distances: ['5km', '10km'],
    registration: '접수 마감',
    sourceUrl: 'https://www.kormarathon.com/ko/races/2026-national-sasang-eco-marathon',
  },
  {
    id: 'heritage-run-2026',
    name: '2026 부산 헤리티지 런',
    date: '2026-11-08',
    location: '다대포 해수욕장',
    distances: ['5km', '10km'],
    registration: '접수 마감',
    sourceUrl: 'https://www.kormarathon.com/ko/races/2026-busan-heritage-run',
  },
  {
    id: 'busan-international-2026',
    name: '제28회 부산국제마라톤대회',
    date: '2026-11-15',
    location: '다대포해수욕장',
    distances: ['5km', '10km', '하프'],
    registration: '접수 마감',
    sourceUrl: 'https://www.kormarathon.com/ko/races/the-28th-busan-kookje-marathon',
  },
  {
    id: 'give-run-2026',
    name: 'GIVE RUN 2026 부산',
    date: '2026-11-21',
    location: '부산 삼락생태공원',
    distances: ['5km', '10km'],
    registration: '접수 정보 확인',
    sourceUrl: 'https://www.kormarathon.com/ko/races/give-run-2026-busan',
  },
  {
    id: 'busan-bridge-2026',
    name: '2026 부산브릿지마라톤대회',
    date: '2026-12-06',
    location: '벡스코 일대',
    distances: ['10km', '풀코스'],
    registration: '접수 마감',
    sourceUrl: 'https://www.kormarathon.com/ko/races/2026-busan-international-marathon',
  },
  {
    id: 'gijang-2026',
    name: '제5회 기장군육상연맹 마라톤대회',
    date: '2026-12-13',
    location: '기장해안로 대변항 멸치광장',
    distances: ['10km'],
    registration: '접수 정보 확인',
    sourceUrl: 'https://www.kormarathon.com/ko/races/5th-gijang-county-athletics-federation-marathon',
  },
];

export function eventDate(event: BusanEvent) {
  const [year, month, day] = event.date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function getUpcomingBusanEvents(today = new Date()) {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return busanEvents
    .filter((event) => eventDate(event).getTime() >= todayStart)
    .sort((left, right) => eventDate(left).getTime() - eventDate(right).getTime());
}

export function daysUntilEvent(event: BusanEvent, today = new Date()) {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((eventDate(event).getTime() - todayStart) / 86_400_000);
}
