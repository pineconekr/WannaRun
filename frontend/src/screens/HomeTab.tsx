// 홈: 이번 주 현황판. 이번 주 거리, 앞 순위까지 남은 거리, 최근 러닝, 내 영토를 보여줍니다.
import React, { forwardRef, useEffect, useState } from 'react';
import { useAuth } from '../components/AuthProvider';
import TerritoryMap from '../components/map/TerritoryMap';
import { RankingItem } from '../components/RankingItem';
import { CellCount, PlayIcon, RetryError, TerritoryRules } from '../components/ui';
import RecommendedCourses from '../components/RecommendedCourses';
import { getRunningRecords } from '../services/api';
import { authRequest } from '../services/auth';
import { formatGap, formatKm, formatRunDate, territoryPitches } from '../services/format';
import { pace, readRecords, recordKey } from '../services/runRecords';
import { useTerritory } from '../services/territory';
import { daysUntilEvent, eventDate, getUpcomingBusanEvents } from '../services/busanEvents';

export type RunStatus = 'ready' | 'active' | 'result';

type Entry = { rank: number; user_id: string; username: string; total_distance_m: number; run_count: number };
type Recent = { title: string; startedAt: string; distanceMeters: number; durationSeconds: number; source: 'gps' | 'demo' | 'legacy' };
type Week = { distanceMeters: number; runs: number; standings: Entry[] | null; recent: Recent | null };

const CHASE_WARNING_METERS = 500;

// 게스트 기록은 이 기기 시간 기준 월요일 0시부터 셉니다.
function startOfLocalWeek(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  return start.getTime();
}

function useWeek(): { week: Week | null; error: string; retry: () => void } {
  const { user, token } = useAuth();
  // 다시 불러오는 동안에도 이전 값을 유지해 화면이 접혔다 펴지지 않게 합니다.
  const [week, setWeek] = useState<Week | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let request = 0;
    function refresh() {
      const current = ++request;
      setError('');
      if (!token || !user) {
        try {
          const records = readRecords(recordKey()).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
          const since = startOfLocalWeek();
          const thisWeek = records.filter(record => record.source === 'gps' && Date.parse(record.startedAt) >= since);
          setWeek({
            distanceMeters: thisWeek.reduce((sum, record) => sum + record.distanceMeters, 0),
            runs: thisWeek.length,
            standings: null,
            recent: records[0] ?? null,
          });
        } catch {
          setWeek({ distanceMeters: 0, runs: 0, standings: null, recent: null });
        }
        return;
      }
      Promise.all([
        authRequest<{ entries: Entry[] }>('/leaderboard?period=week', {}, token),
        getRunningRecords(token),
      ]).then(([board, runs]) => {
        if (!active || request !== current) return;
        const me = board.entries.find(entry => entry.user_id === user.id);
        const latest = runs[0];
        setWeek({
          distanceMeters: me?.total_distance_m ?? 0,
          runs: me?.run_count ?? 0,
          standings: board.entries,
          recent: latest ? { title: latest.title, startedAt: latest.started_at, distanceMeters: latest.distance_m, durationSeconds: latest.duration_s, source: latest.source } : null,
        });
      }).catch(() => {
        if (active && request === current) setError('이번 주 기록을 불러오지 못했어요.');
      });
    }
    refresh();
    window.addEventListener('wannarun:records', refresh);
    window.addEventListener('online', refresh);
    return () => {
      active = false;
      window.removeEventListener('wannarun:records', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [token, user, attempt]);

  return { week, error, retry: () => setAttempt(value => value + 1) };
}

/** 내 순위 바로 위·아래 러너. 내가 랭킹에 없으면 null. */
function neighbours(standings: Entry[], userId: string) {
  const index = standings.findIndex(entry => entry.user_id === userId);
  if (index < 0) return null;
  const me = standings[index];
  const above = standings.slice(0, index).reverse().find(entry => entry.total_distance_m > me.total_distance_m);
  const below = standings[index + 1];
  return { me, above, below };
}

/** 최근 러닝 페이스로 거리를 달리는 데 걸릴 분. 페이스를 모르면 null. */
function minutesAtPace(meters: number, recent: Recent | null) {
  if (!recent || recent.distanceMeters <= 0 || recent.durationSeconds <= 0) return null;
  return Math.max(1, Math.ceil(meters / (recent.distanceMeters / recent.durationSeconds) / 60));
}

function Race({ standings, userId, recent }: { standings: Entry[]; userId: string; recent: Recent | null }) {
  const [openRunner, setOpenRunner] = useState<string | null>(null);
  const around = neighbours(standings, userId);
  if (!around) {
    const last = standings[standings.length - 1];
    return <p className="wr-race-headline">{last
      ? `${formatKm(last.total_distance_m)}km만 달리면 ${last.username}님을 제치고 ${last.rank}위예요.`
      : '한 번만 달려도 1위로 랭킹에 올라가요.'}</p>;
  }
  const { me, above, below } = around;
  const gapUp = above ? above.total_distance_m - me.total_distance_m : 0;
  const gapDown = below ? me.total_distance_m - below.total_distance_m : 0;
  const minutes = above ? minutesAtPace(gapUp, recent) : null;
  const headline = above
    ? <><span className="wr-race-gap">{formatGap(gapUp)}</span> 더 달리면 {above.rank}위예요</>
    : below ? <>1위를 지키고 있어요 · 2위와 <span className="wr-race-gap">{formatGap(gapDown)}</span> 차이</>
    : <>이번 주 1위예요</>;
  const meta = (entry: Entry) => entry === above ? `${formatGap(gapUp)} 앞`
    : entry === below ? `${formatGap(gapDown)} 뒤에서 추격 중` : undefined;
  return <>
    <p className="wr-race-headline">{headline}</p>
    {minutes !== null && recent && <p className="wr-muted wr-race-estimate">평소 페이스({pace(recent)}/km)로 약 {minutes}분</p>}
    {below && gapDown <= CHASE_WARNING_METERS && <p className="wr-race-chase">{below.rank}위 {below.username}님이 {formatGap(gapDown)} 뒤에 있어요</p>}
    <ol className="wr-ranking-list wr-race" aria-label="이번 주 내 주변 순위">
      {[above, me, below].filter((entry): entry is Entry => Boolean(entry)).map(entry =>
        <RankingItem key={entry.user_id} entry={entry} self={entry === me} meta={meta(entry)} open={openRunner === entry.user_id}
          onToggle={() => setOpenRunner(openRunner === entry.user_id ? null : entry.user_id)} />)}
    </ol>
  </>;
}

function RaceSkeleton() {
  return <div aria-busy="true">
    <p className="wr-race-headline"><span className="wr-sr">순위를 불러오고 있어요</span></p>
    <ol className="wr-ranking-list wr-race" aria-hidden="true">
      {[0, 1, 2].map(row => <li key={row} className="wr-race-ghost" />)}
    </ol>
  </div>;
}

function headline(week: Week | null, cellCount: number) {
  if (!week) return <>이번 주 <span className="wr-week-distance wr-pending">–.–</span>km 달렸어요</>;
  if (week.distanceMeters > 0) return <>이번 주 <span className="wr-week-distance">{formatKm(week.distanceMeters)}</span>km 달렸어요</>;
  if (week.runs > 0) return <>이번 주 <span className="wr-week-distance">{week.runs}</span>번 달렸어요</>;
  return cellCount === 0 ? '첫 러닝으로 첫 땅을 차지해 보세요' : '이번 주 첫 러닝을 기다려요';
}

type Props = {
  runStatus: RunStatus;
  onStart: () => void;
  onHistory: () => void;
  onLeaderboard: () => void;
  onLogin: () => void;
  onEvents: () => void;
  onPrepare: () => void;
};

const HomeTab = forwardRef<HTMLElement, Props>(function HomeTab({ runStatus, onStart, onHistory, onLeaderboard, onLogin, onEvents, onPrepare }, territoryRef) {
  const { user } = useAuth();
  const { week, error, retry } = useWeek();
  const territory = useTerritory();
  const cellIds = Object.keys(territory);
  const cellCount = cellIds.length;
  const pitches = cellCount > 0 ? territoryPitches(cellCount, territory[cellIds[0]].positions[0]?.[0] ?? 0) : null;
  const around = user && week?.standings ? neighbours(week.standings, user.id) : null;
  const nextBusanEvent = getUpcomingBusanEvents()[0];
  const startLabel = runStatus === 'active' ? '달리는 중 · 화면으로 돌아가기' : runStatus === 'result' ? '저장하지 않은 결과 보기' : 'GPS 러닝 시작';
  const description = error ? '이번 주 기록을 불러오지 못했어요.'
    : week === null ? '이번 주 기록을 불러오고 있어요…'
    : week.runs > 0 ? `GPS 러닝 ${week.runs}회 · 월요일부터 모은 거리예요.`
    : 'GPS로 달린 거리만 이번 주 랭킹에 쌓여요.';

  return <section className="wr-week" aria-labelledby="week-title">
    <h1 id="week-title">{headline(week, cellCount)}</h1>
    <p className="wr-description">{description}</p>

    <button className="wr-primary-button wr-start-button" type="button" onClick={onStart}>
      {startLabel}
      <PlayIcon />
    </button>

    <section className="wr-week-section" aria-labelledby="race-title">
      <div className="wr-week-heading">
        <h2 id="race-title">이번 주 순위</h2>
        {user && <button type="button" className="wr-link-button" onClick={onLeaderboard}>랭킹 더 보기</button>}
      </div>
      {!user ? <>
        <p className="wr-description">로그인하면 이번 주 랭킹에서 다른 러너와 거리를 겨룰 수 있어요.</p>
        <button type="button" className="wr-secondary-button" onClick={onLogin}>로그인하기</button>
      </> : error ? <RetryError message="이번 주 기록을 불러오지 못했어요." onRetry={retry} />
        : week?.standings ? <Race standings={week.standings} userId={user.id} recent={week.recent} />
        : <RaceSkeleton />}
    </section>

    {week?.recent && <section className="wr-week-section" aria-labelledby="recent-title">
      <h2 id="recent-title">최근 러닝</h2>
      <button type="button" className="wr-recent" onClick={onHistory}>
        <span>
          <strong>{week.recent.title || '오늘의 러닝'}{week.recent.source === 'demo' && <span className="wr-recent-badge">데모</span>}</strong>
          <span className="wr-muted">{formatRunDate(week.recent.startedAt)} · {pace(week.recent)}/km{week.recent.source === 'demo' ? ' · 순위 제외' : ''}</span>
        </span>
        <span className="wr-recent-distance">{formatKm(week.recent.distanceMeters, 2)}<small>km</small></span>
      </button>
    </section>}

    <section ref={territoryRef} className="wr-week-section wr-turf" aria-labelledby="turf-title">
      <h2 id="turf-title">내 영토 <CellCount className="wr-section-count" value={cellCount} /></h2>
      {pitches && <p className="wr-description">{pitches}</p>}
      {cellCount > 0
        ? <TerritoryMap className="wr-week-map" cells={territory} label={`내 영토 ${cellCount}칸을 표시한 지도`} />
        : <TerritoryRules />}
    </section>

    <section className="wr-week-section" aria-labelledby="busan-title">
      <div className="wr-week-heading">
        <h2 id="busan-title">부산에서 달리기</h2>
        <button type="button" className="wr-link-button" onClick={onEvents}>대회 일정 보기</button>
      </div>
      {nextBusanEvent && <button className="wr-event-highlight" type="button" onClick={onEvents}
        aria-label={`${nextBusanEvent.name}, ${daysUntilEvent(nextBusanEvent) === 0 ? '대회 당일' : `D-${daysUntilEvent(nextBusanEvent)}`}. 부산 대회 일정 보기`}>
        <span className="wr-event-highlight-copy">
          <small>다가오는 부산 대회</small>
          <strong>{nextBusanEvent.name}</strong>
          <span>{eventDate(nextBusanEvent).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} · {nextBusanEvent.location}</span>
        </span>
        <strong className="wr-event-dday">{daysUntilEvent(nextBusanEvent) === 0 ? 'D-Day' : `D-${daysUntilEvent(nextBusanEvent)}`}</strong>
      </button>}
      <RecommendedCourses onStart={onPrepare} />
    </section>
  </section>;
});

export default HomeTab;
