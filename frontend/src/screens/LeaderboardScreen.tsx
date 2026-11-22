import React, { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthProvider';
import { authRequest } from '../services/auth';
import { RankingItem } from '../components/RankingItem';
import { RetryError } from '../components/ui';
import { formatGap, formatHoursMinutes } from '../services/format';

type Period = 'all' | 'week' | 'month';
type Metric = 'distance' | 'territory';
type Entry = { rank: number; user_id: string; username: string; total_distance_m: number; total_duration_s: number; run_count: number };
type TerritoryEntry = { rank: number; user_id: string; username: string; cells: number };
type Result =
  | { metric: 'distance'; period: Period; entries: Entry[] }
  | { metric: 'territory'; entries: TerritoryEntry[] };
const periods: { value: Period; label: string }[] = [
  { value: 'week', label: '이번 주' }, { value: 'month', label: '이번 달' }, { value: 'all', label: '누적' },
];
const metrics: { value: Metric; label: string }[] = [{ value: 'distance', label: '거리' }, { value: 'territory', label: '영토' }];

function metaFor(entry: Entry, entries: Entry[], self: boolean) {
  const base = `${entry.run_count}회 · ${formatHoursMinutes(entry.total_duration_s)}`;
  if (!self) return base;
  const ahead = entries.filter(other => other.total_distance_m > entry.total_distance_m).pop();
  return ahead ? `${formatGap(ahead.total_distance_m - entry.total_distance_m)} 더 달리면 ${ahead.rank}위` : base;
}

function territoryMeta(entry: TerritoryEntry, entries: TerritoryEntry[], self: boolean) {
  if (!self) return undefined;
  const ahead = entries.filter(other => other.cells > entry.cells).pop();
  return ahead ? `${(ahead.cells - entry.cells).toLocaleString('ko-KR')}칸 더 차지하면 ${ahead.rank}위` : '영토 1위';
}

function cellsValue(cells: number) {
  return <>{cells.toLocaleString('ko-KR')}<small>칸</small></>;
}

export default function LeaderboardScreen({ onLogin }: { onLogin: () => void }) {
  const { token, user } = useAuth();
  const [metric, setMetric] = useState<Metric>('distance');
  const [period, setPeriod] = useState<Period>('week');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [openRunner, setOpenRunner] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let request = 0;
    function refresh() {
      const current = ++request;
      setResult(null);
      setError('');
      if (!token) return;
      const load: Promise<Result> = metric === 'territory'
        ? authRequest<{ entries: TerritoryEntry[] }>('/leaderboard/territory', {}, token).then(value => ({ metric: 'territory', ...value }))
        : authRequest<{ period: Period; entries: Entry[] }>(`/leaderboard?period=${period}`, {}, token).then(value => ({ metric: 'distance', ...value }));
      load
        .then(value => { if (active && request === current) setResult(value); })
        .catch(reason => { if (active && request === current) setError(reason instanceof Error ? reason.message : '랭킹을 불러오지 못했어요. 다시 시도해 주세요.'); });
    }
    refresh();
    window.addEventListener('wannarun:records', refresh);
    return () => { active = false; window.removeEventListener('wannarun:records', refresh); };
  }, [token, metric, period, attempt]);

  const periodLabel = periods.find(item => item.value === period)?.label;
  const selfListed = result?.entries.some(entry => entry.user_id === user?.id);
  const toggle = (id: string) => setOpenRunner(openRunner === id ? null : id);

  return <section className="wr-leaderboard wr-page" aria-labelledby="leaderboard-title">
    <h1 id="leaderboard-title">함께 달리는 랭킹</h1>
    {!token ? <div className="wr-gate">
      <h2>로그인하고 함께 달려요</h2>
      <p className="wr-description">다른 러너의 이동 경로는 공개하지 않아요. 영토 지도에는 누구의 칸인지 밝히지 않아요.</p>
      <button className="wr-primary-button" type="button" onClick={onLogin}>로그인하기</button>
    </div> : <>
      <div className="wr-filters" role="group" aria-label="랭킹 기준">
        {metrics.map(item => <button type="button" key={item.value} aria-pressed={metric === item.value} onClick={() => setMetric(item.value)}>{item.label}</button>)}
      </div>
      {metric === 'distance' && <div className="wr-filters" role="group" aria-label="랭킹 기간">
        {periods.map(item => <button type="button" key={item.value} aria-pressed={period === item.value} onClick={() => setPeriod(item.value)}>{item.label}</button>)}
      </div>}
      {error ? <RetryError message={error} onRetry={() => setAttempt(value => value + 1)} />
        : result === null || result.metric !== metric ? <p className="wr-notice" role="status">랭킹을 불러오고 있어요…</p>
        : result.metric === 'territory' ? result.entries.length === 0
          ? <p className="wr-description" role="status">아직 영토를 가진 러너가 없어요. 첫 칸의 주인이 되어 보세요.</p>
          : <>
            <p className="wr-muted" role="status">지금 가진 칸 수 · 다른 러너가 지나가면 빼앗겨요 · {result.entries.length.toLocaleString('ko-KR')}명</p>
            <ol className="wr-ranking-list" aria-label="영토 랭킹">
              {result.entries.map(entry => {
                const self = entry.user_id === user?.id;
                return <RankingItem key={entry.user_id} entry={entry} value={cellsValue(entry.cells)} self={self}
                  meta={territoryMeta(entry, result.entries, self)} open={openRunner === entry.user_id} onToggle={() => toggle(entry.user_id)} />;
              })}
            </ol>
            {!selfListed && <p className="wr-muted wr-ranking-footer">나는 아직 가진 칸이 없어요 · 한 번 달리면 올라가요</p>}
          </>
        : result.entries.length === 0 ? <p className="wr-description" role="status">{period === 'all' ? '아직 랭킹에 오른 러너가 없어요.' : `${periodLabel} 달린 러너가 아직 없어요.`} 첫 기록의 주인공이 되어 보세요.</p>
        : <>
          <p className="wr-muted" role="status">GPS 거리 합계 · {result.entries.length.toLocaleString('ko-KR')}명</p>
          <ol className="wr-ranking-list" aria-label={`${periodLabel} 거리 랭킹`}>
            {result.entries.map(entry => {
              const self = entry.user_id === user?.id;
              return <RankingItem key={entry.user_id} entry={entry} self={self} meta={metaFor(entry, result.entries, self)}
                open={openRunner === entry.user_id} onToggle={() => toggle(entry.user_id)} />;
            })}
          </ol>
          {!selfListed && <p className="wr-muted wr-ranking-footer">나는 아직 순위에 없어요 · GPS로 한 번 달리면 올라가요</p>}
        </>}
    </>}
  </section>;
}
