import React, { useEffect, useMemo, useState } from 'react';
import AuthScreen from './AuthScreen';
import { useAuth } from '../components/AuthProvider';
import { getRunningRecords, type RunRecord } from '../services/api';
import { readRecords, recordKey, type SavedRun } from '../services/runRecords';
import BadgeSection from '../components/BadgeSection';

type Activity = { startedAt: string; distanceMeters: number };

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftMonth(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function mergeActivities(serverRecords: RunRecord[], localRecords: SavedRun[]): Activity[] {
  const activities: Activity[] = serverRecords.map((record) => ({
    startedAt: record.started_at,
    distanceMeters: record.distance_m,
  }));

  for (const record of localRecords) {
    const time = Date.parse(record.startedAt);
    const duplicate = activities.some((activity) =>
      Math.abs(Date.parse(activity.startedAt) - time) < 60_000 &&
      Math.abs(activity.distanceMeters - record.distanceMeters) < 2,
    );
    if (!duplicate) activities.push({ startedAt: record.startedAt, distanceMeters: record.distanceMeters });
  }
  return activities;
}

export default function ProfileScreen() {
  const { user, token, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [serverRecords, setServerRecords] = useState<RunRecord[]>([]);
  const [localRecords, setLocalRecords] = useState<SavedRun[]>([]);
  const [profileTab, setProfileTab] = useState<'attendance' | 'badges'>('attendance');
  const [displayedMonth, setDisplayedMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  useEffect(() => {
    if (!user) return;
    const refreshLocal = () => {
      try { setLocalRecords(readRecords(recordKey(user.id))); }
      catch { setLocalRecords([]); }
    };
    refreshLocal();
    window.addEventListener('wannarun:records', refreshLocal);
    window.addEventListener('storage', refreshLocal);
    return () => {
      window.removeEventListener('wannarun:records', refreshLocal);
      window.removeEventListener('storage', refreshLocal);
    };
  }, [user]);

  useEffect(() => {
    let active = true;
    if (!token) { setServerRecords([]); return; }
    getRunningRecords(token)
      .then((records) => { if (active) setServerRecords(records); })
      .catch(() => { if (active) setServerRecords([]); });
    return () => { active = false; };
  }, [token]);

  const activities = useMemo(
    () => mergeActivities(serverRecords, localRecords),
    [serverRecords, localRecords],
  );
  const workoutCount = activities.length;
  const totalDistanceKm = activities.reduce((total, activity) => total + activity.distanceMeters, 0) / 1000;
  const averageRunsPerWeek = useMemo(() => {
    if (activities.length === 0) return 0;
    const firstRun = Math.min(...activities.map((activity) => Date.parse(activity.startedAt)));
    const days = Math.max(1, Math.floor((Date.now() - firstRun) / 86_400_000) + 1);
    return activities.length / Math.max(1, days / 7);
  }, [activities]);
  const level = Math.max(1, Math.floor(totalDistanceKm / 20) + 1);
  const monthlyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const activity of activities) {
      const key = dateKey(new Date(activity.startedAt));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [activities]);

  const daysInMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 0).getDate();
  const firstDayOffset = (new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), 1).getDay() + 6) % 7;
  const calendarCells = [
    ...Array.from({ length: firstDayOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  const calendarRows = Math.ceil(calendarCells.length / 7);
  while (calendarCells.length < calendarRows * 7) calendarCells.push(null);

  async function signOut() {
    if (busy) return;
    setBusy(true); setError('');
    try { await logout(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }

  if (!user) return <AuthScreen />;

  return (
    <section className="wr-account" aria-labelledby="profile-title">
      <p className="wr-eyebrow">MY PROFILE</p>
      <h1 id="profile-title">좋은 아침이에요! {user.username}님</h1>
      <div className="wr-profile-card">
        <div className="wr-avatar" aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</div>
        <h2>{user.username}</h2>
        <span className="wr-map-badge">오늘도 한 걸음씩</span>
      </div>

      <div className="wr-profile-stats" aria-label="러닝 요약">
        <div><strong>{workoutCount}</strong><span>총 운동 기록</span></div>
        <div><strong>{averageRunsPerWeek.toFixed(1)}</strong><span>평균 러닝 회/주</span></div>
        <div><strong>Lv.{level}</strong><span>러닝 레벨</span></div>
      </div>

      <div className="wr-profile-tabs" role="tablist" aria-label="프로필 정보">
        <button
          id="profile-tab-attendance"
          type="button"
          role="tab"
          aria-selected={profileTab === 'attendance'}
          aria-controls="profile-panel-attendance"
          className={profileTab === 'attendance' ? 'is-active' : ''}
          onClick={() => setProfileTab('attendance')}
        >출석</button>
        <button
          id="profile-tab-badges"
          type="button"
          role="tab"
          aria-selected={profileTab === 'badges'}
          aria-controls="profile-panel-badges"
          className={profileTab === 'badges' ? 'is-active' : ''}
          onClick={() => setProfileTab('badges')}
        >배지</button>
      </div>

      {profileTab === 'attendance' ? (
      <section className="wr-attendance" id="profile-panel-attendance" role="tabpanel" aria-labelledby="profile-tab-attendance">
        <header className="wr-attendance-header">
          <h2 id="attendance-title">러닝 출석</h2>
          <div>
            <button type="button" aria-label="이전 달" onClick={() => setDisplayedMonth((month) => shiftMonth(month, -1))}>‹</button>
            <strong>{displayedMonth.getFullYear()}년 {displayedMonth.getMonth() + 1}월</strong>
            <button
              type="button"
              aria-label="다음 달"
              disabled={displayedMonth.getFullYear() === new Date().getFullYear() && displayedMonth.getMonth() === new Date().getMonth()}
              onClick={() => setDisplayedMonth((month) => shiftMonth(month, 1))}
            >›</button>
          </div>
        </header>
        <table className="wr-calendar">
          <caption className="wr-visually-hidden">{displayedMonth.getFullYear()}년 {displayedMonth.getMonth() + 1}월 러닝 출석</caption>
          <thead>
            <tr>{['월', '화', '수', '목', '금', '토', '일'].map((day) => <th key={day} scope="col"><abbr title={`${day}요일`}>{day}</abbr></th>)}</tr>
          </thead>
          <tbody>
            {Array.from({ length: calendarRows }, (_, row) => (
              <tr key={`${displayedMonth.getMonth()}-${row}`}>
                {calendarCells.slice(row * 7, row * 7 + 7).map((day, column) => {
                  const count = day ? monthlyCounts.get(dateKey(new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), day))) ?? 0 : 0;
                  return (
                    <td key={column}>
                      {day && (
                        <span className={`wr-calendar-day level-${Math.min(count, 3)}`} title={`${day}일 · 러닝 ${count}회`}>
                          {day}<span className="wr-visually-hidden">일, 러닝 {count}회</span>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="wr-calendar-legend" aria-label="출석 색상 범례">
          <span><i className="level-0" /> 없음</span>
          <span><i className="level-1" /> 1회</span>
          <span><i className="level-2" /> 2회</span>
          <span><i className="level-3" /> 3회 이상</span>
        </div>
      </section>
      ) : (
        <div id="profile-panel-badges" role="tabpanel" aria-labelledby="profile-tab-badges">
          <BadgeSection
            activities={activities}
          />
        </div>
      )}

      <p className="wr-profile-distance">누적 러닝 거리 <strong>{totalDistanceKm.toFixed(1)} km</strong> · 레벨마다 20 km 필요</p>
      {error && <p className="wr-error" role="alert">{error}</p>}
      <button type="button" className="wr-text-button" disabled={busy} onClick={() => void signOut()}>
        {busy ? '로그아웃 중…' : '로그아웃'}
      </button>
    </section>
  );
}
