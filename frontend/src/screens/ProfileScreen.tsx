import React, { useEffect, useMemo, useState } from 'react';
import AuthScreen from './AuthScreen';
import { useAuth } from '../components/AuthProvider';
import { authRequest } from '../services/auth';
import { clearTerritory, useTerritory, type Territory } from '../services/territory';
import { RunStats } from '../components/RunStats';
import TerritoryMap from '../components/map/TerritoryMap';
import { CellCount, InlineConfirm, RetryError } from '../components/ui';
import { territoryPitches } from '../services/format';
import BadgeSection, { type BadgeActivity } from '../components/BadgeSection';
import { getRunningRecords, type RunRecord } from '../services/api';
import { readRecords, recordKey, type SavedRun } from '../services/runRecords';

type PersonalStats = { total_distance_m: number; total_duration_s: number; run_count: number };

function TerritorySection({ territory }: { territory: Territory }) {
  const cells = Object.values(territory);
  const cellCount = cells.length;
  const latitude = cells[0]?.positions[0]?.[0];
  const pitches = latitude === undefined ? null : territoryPitches(cellCount, latitude);
  return <section aria-labelledby="territory-title">
    <h2 id="territory-title" className="wr-section-title">내 영토 <CellCount value={cellCount} className="wr-profile-cells" /></h2>
    {pitches && <p className="wr-muted wr-profile-pitches">{pitches}</p>}
    <p className="wr-description">영토는 이 기기에만 저장돼요.</p>
    {cellCount > 0
      ? <TerritoryMap className="wr-profile-map" cells={territory} label={`내 영토 ${cellCount}칸을 표시한 지도`} />
      : <p className="wr-description">러닝을 마치면 지나간 길 주변 칸이 여기에 쌓여요.</p>}
  </section>;
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function ProfileActivities({ userId, token }: { userId: string; token: string | null }) {
  const [records, setRecords] = useState<{ server: RunRecord[]; local: SavedRun[] } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [profileTab, setProfileTab] = useState<'attendance' | 'badges'>('attendance');
  const [displayedMonth, setDisplayedMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  useEffect(() => {
    let active = true;
    let request = 0;
    function refresh() {
      const current = ++request;
      setRecords(null);
      setError('');
      if (!token) return;
      let local: SavedRun[];
      try { local = readRecords(recordKey(userId)); }
      catch { setError('이 기기의 출석 기록을 읽지 못했어요. 기록은 지우지 않았어요.'); return; }
      getRunningRecords(token)
        .then(server => { if (active && current === request) setRecords({ server, local }); })
        .catch(reason => { if (active && current === request) setError(reason instanceof Error ? reason.message : '러닝 출석을 불러오지 못했어요.'); });
    }
    refresh();
    window.addEventListener('wannarun:records', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      active = false;
      window.removeEventListener('wannarun:records', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [userId, token, attempt]);

  const activities = useMemo<BadgeActivity[]>(() => {
    if (!records) return [];
    const serverIds = new Set(records.server.map(record => record.id));
    return [
      ...records.server.map(record => ({ startedAt: record.started_at, distanceMeters: record.distance_m })),
      ...records.local.filter(record => !serverIds.has(record.serverId ?? record.id))
        .map(record => ({ startedAt: record.startedAt, distanceMeters: record.distanceMeters })),
    ];
  }, [records]);
  const monthlyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const activity of activities) {
      const key = dateKey(new Date(activity.startedAt));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [activities]);

  if (error) return <RetryError message={error} onRetry={() => setAttempt(value => value + 1)} />;
  if (!records) return <p className="wr-notice" role="status">러닝 출석과 배지를 불러오고 있어요…</p>;

  const totalDistanceKm = activities.reduce((sum, activity) => sum + activity.distanceMeters, 0) / 1000;
  const firstRun = activities.reduce((first, activity) => Math.min(first, Date.parse(activity.startedAt)), Date.now());
  const days = Math.max(1, Math.floor((Date.now() - firstRun) / 86_400_000) + 1);
  const averageRunsPerWeek = activities.length / Math.max(1, days / 7);
  const level = Math.max(1, Math.floor(totalDistanceKm / 20) + 1);
  const year = displayedMonth.getFullYear();
  const month = displayedMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const calendarRows = Math.ceil((firstDayOffset + daysInMonth) / 7);
  const calendarCells = Array.from({ length: calendarRows * 7 }, (_, index) => {
    const day = index - firstDayOffset + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });

  return <section className="wr-profile-activity" aria-label="러닝 출석과 배지">
    <div className="wr-profile-stats" aria-label="전체 운동 요약">
      <div><strong>{activities.length.toLocaleString('ko-KR')}</strong><span>총 운동 기록</span></div>
      <div><strong>{averageRunsPerWeek.toFixed(1)}</strong><span>평균 러닝 회/주</span></div>
      <div><strong>Lv.{level}</strong><span>러닝 레벨</span></div>
    </div>
    <p className="wr-muted">출석과 배지는 계정·이 기기 기록을 합쳐요. 저장한 데모도 포함해요.</p>
    <div className="wr-profile-tabs" role="group" aria-label="프로필 정보">
      <button id="profile-tab-attendance" type="button" aria-pressed={profileTab === 'attendance'}
        aria-controls="profile-panel-attendance" className={profileTab === 'attendance' ? 'is-active' : ''}
        onClick={() => setProfileTab('attendance')}>출석</button>
      <button id="profile-tab-badges" type="button" aria-pressed={profileTab === 'badges'}
        aria-controls="profile-panel-badges" className={profileTab === 'badges' ? 'is-active' : ''}
        onClick={() => setProfileTab('badges')}>배지</button>
    </div>
    <section className="wr-attendance" id="profile-panel-attendance" hidden={profileTab !== 'attendance'} aria-labelledby="profile-tab-attendance">
      <header className="wr-attendance-header">
        <h2>러닝 출석</h2>
        <div>
          <button type="button" aria-label="이전 달" onClick={() => setDisplayedMonth(new Date(year, month - 1, 1))}>‹</button>
          <strong>{year}년 {month + 1}월</strong>
          <button type="button" aria-label="다음 달"
            disabled={year === new Date().getFullYear() && month === new Date().getMonth()}
            onClick={() => setDisplayedMonth(new Date(year, month + 1, 1))}>›</button>
        </div>
      </header>
      <table className="wr-calendar">
        <caption className="wr-sr">{year}년 {month + 1}월 러닝 출석</caption>
        <thead><tr>{['월', '화', '수', '목', '금', '토', '일'].map(day => <th key={day} scope="col"><abbr title={`${day}요일`}>{day}</abbr></th>)}</tr></thead>
        <tbody>{Array.from({ length: calendarRows }, (_, row) => <tr key={row}>
          {calendarCells.slice(row * 7, row * 7 + 7).map((day, column) => {
            const count = day ? monthlyCounts.get(dateKey(new Date(year, month, day))) ?? 0 : 0;
            return <td key={column}>{day && <span className={`wr-calendar-day level-${Math.min(count, 3)}`} title={`${day}일 · 러닝 ${count}회`}>
              {day}<span className="wr-sr">일, 러닝 {count}회</span>
            </span>}</td>;
          })}
        </tr>)}</tbody>
      </table>
      <div className="wr-calendar-legend" aria-label="출석 색상 범례">
        <span><i className="level-0" /> 없음</span><span><i className="level-1" /> 1회</span>
        <span><i className="level-2" /> 2회</span><span><i className="level-3" /> 3회 이상</span>
      </div>
    </section>
    <div id="profile-panel-badges" hidden={profileTab !== 'badges'} aria-labelledby="profile-tab-badges">
      {profileTab === 'badges' && <BadgeSection activities={activities} />}
    </div>
    <p className="wr-profile-distance">누적 운동 거리 <strong>{totalDistanceKm.toFixed(1)} km</strong> · 레벨마다 20 km 필요</p>
  </section>;
}

export default function ProfileScreen() {
  const { user, token, logout, loading, error: authError, retry } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<PersonalStats | null>(null);
  const [statsError, setStatsError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const territory = useTerritory();
  const cellCount = Object.keys(territory).length;

  useEffect(() => {
    let active = true;
    let request = 0;
    function refresh() {
      const current = ++request;
      setStats(null);
      setStatsError('');
      if (!token) return;
      authRequest<PersonalStats>('/users/me/stats', {}, token)
        .then(value => { if (active && request === current) setStats(value); })
        .catch(reason => { if (active && request === current) setStatsError(reason instanceof Error ? reason.message : '개인 통계를 불러오지 못했어요. 다시 시도해 주세요.'); });
    }
    refresh();
    window.addEventListener('wannarun:records', refresh);
    return () => { active = false; window.removeEventListener('wannarun:records', refresh); };
  }, [token, attempt]);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await logout(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '로그아웃하지 못했어요. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }

  if (!user) {
    if (loading) return <section className="wr-account wr-page"><p className="wr-notice" role="status">로그인 정보를 확인하고 있어요…</p></section>;
    if (authError) return <section className="wr-account wr-page" aria-labelledby="auth-error-title">
      <h1 id="auth-error-title">계정을 확인하지 못했어요</h1>
      <p className="wr-error" role="alert">{authError}</p>
      <button type="button" className="wr-primary-button" onClick={retry}>다시 시도</button>
    </section>;
    return <>
      <div className="wr-page wr-profile wr-guest-territory"><TerritorySection territory={territory} /></div>
      <AuthScreen />
    </>;
  }
  const runs = stats?.run_count ?? 0;
  const tagline = cellCount > 0 || runs > 0
    ? `영토 ${cellCount.toLocaleString('ko-KR')}칸 · GPS 러닝 ${runs.toLocaleString('ko-KR')}회`
    : '첫 러닝을 기다려요';
  return <section className="wr-account wr-page wr-profile" aria-labelledby="profile-title">
    <h1 id="profile-title">내 프로필</h1>
    <div className="wr-profile-card">
      <div className="wr-avatar" aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</div>
      <div>
        <h2>{user.username}</h2>
        <p className="wr-muted">{tagline}</p>
      </div>
    </div>
    <TerritorySection territory={territory} />
    <section aria-labelledby="personal-stats-title">
      <h2 id="personal-stats-title" className="wr-section-title">나의 누적 러닝</h2>
      {statsError ? <RetryError message={statsError} onRetry={() => setAttempt(value => value + 1)} />
        : stats === null ? <p className="wr-notice" role="status">개인 통계를 불러오고 있어요…</p>
        : stats.run_count > 0 ? <div className="wr-personal-stats">
          <p className="wr-description">계정에 저장한 GPS 러닝 {stats.run_count.toLocaleString('ko-KR')}회를 모두 더했어요.</p>
          <RunStats digits={1} record={{ distanceMeters: stats.total_distance_m, durationSeconds: stats.total_duration_s }} />
        </div>
        : <p className="wr-description">아직 집계된 러닝이 없어요. GPS 러닝을 마치고 계정에 저장하면 여기에 쌓여요.</p>}
    </section>
    <ProfileActivities key={user.id} userId={user.id} token={token} />
    {error && <p className="wr-error" role="alert">{error}</p>}
    {confirmClear && <InlineConfirm tone="danger" message={`영토 ${cellCount.toLocaleString('ko-KR')}칸을 모두 지울까요? 되돌릴 수 없어요.`}
      cancelLabel="취소" confirmLabel="모두 지우기" onCancel={() => setConfirmClear(false)}
      onConfirm={() => { clearTerritory(); setConfirmClear(false); }} />}
    <div className="wr-profile-footer">
      <button type="button" className="wr-text-button" disabled={busy} onClick={() => void signOut()}>{busy ? '로그아웃 중…' : '로그아웃'}</button>
      {cellCount > 0 && !confirmClear && <button type="button" className="wr-text-button wr-clear-button" onClick={() => setConfirmClear(true)}>영토 기록 지우기</button>}
    </div>
  </section>;
}
