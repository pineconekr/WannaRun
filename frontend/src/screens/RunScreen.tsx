import React, { useEffect, useState } from 'react';
import MapScreen, { type RunResult } from './MapScreen';
import { useAuth } from '../components/AuthProvider';
import { recordKey, saveRecord } from '../services/runRecords';
import { RunStats } from '../components/RunStats';

export default function RunScreen({ onHistory }: { onHistory: () => void }) {
  const { user } = useAuth();
  const [result, setResult] = useState<RunResult | null>(null);
  const [title, setTitle] = useState('오늘의 러닝');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [serverStatus, setServerStatus] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [session, setSession] = useState(0);
  useEffect(() => {
    if (!result || saved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [result, saved]);
  function reset() {
    setResult(null); setServerStatus(''); setSaved(false); setError(''); setConfirmDiscard(false);
    setTitle('오늘의 러닝'); setNote(''); setSession(value => value + 1);
  }
  return <section className="wr-run-page" aria-labelledby="run-title">
    <p className="wr-eyebrow">YOUR PACE, YOUR RUN</p>
    <h1 id="run-title">{result ? '오늘도 한 걸음 더.' : '나만의 러닝'}</h1>
    <p className="wr-description">{result ? '수고했어요. 오늘의 움직임을 남겨 보세요.' : '기록보다 중요한 건, 오늘의 시작.'}</p>
    <p className="wr-notice">브라우저가 열린 동안 GPS로 측정해요. 화면 잠금·백그라운드에서는 위치 수집을 보장하지 않아요. 일시정지 시간과 이동은 제외해요.</p>
    <div hidden={Boolean(result)} className="wr-map-card wr-running-map">
      <MapScreen key={session} onServerStatus={setServerStatus} onFinish={value => { setResult(value); setSaved(false); }} />
    </div>
    {result && <div className="wr-result">
      <span className="wr-map-badge">{result.source === 'demo' ? '데모 · 환산 시간' : 'GPS 측정'} · 러닝 종료</span>
      <RunStats record={result} />
      {serverStatus && <p className="wr-notice" role="status">{serverStatus}</p>}
      <p className="wr-description">{new Date(result.startedAt).toLocaleString('ko-KR')} 시작<br />{result.source === 'demo' ? '데모 재생' : '위치 수신'} {result.points}회 · {result.source === 'demo' ? '지정 경로와 환산 시간으로 만든 결과예요.' : result.distanceMeters === 0 ? '이동 거리가 측정되지 않았어요.' : 'GPS 오차가 포함될 수 있어요.'}</p>
      <form className="wr-form" onSubmit={event => {
        event.preventDefault();
        try { saveRecord(recordKey(user?.id), { ...result, title: title.trim() || '오늘의 러닝', note: note.trim() }); setSaved(true); setError(''); }
        catch { setError('기록을 저장하지 못했어요. 저장 공간 또는 기존 기록을 확인하고 다시 시도해 주세요.'); }
      }}>
        <fieldset disabled={saved}>
          <label htmlFor="run-name">러닝 이름</label>
          <input id="run-name" value={title} maxLength={60} onChange={event => setTitle(event.target.value)} />
          <label htmlFor="run-note">오늘의 한 줄 <span className="wr-muted">선택</span></label>
          <textarea id="run-note" value={note} maxLength={300} rows={3} placeholder="오늘 달리기는 어땠나요?" onChange={event => setNote(event.target.value)} />
          <small>이 기기의 현재 브라우저에 저장해요. 서버·다른 기기와 동기화되지 않으며, 브라우저 데이터 삭제 시 사라져요.</small>
          {!saved && <button className="wr-primary-button" type="submit">이 브라우저에 기록 저장 <span aria-hidden="true">↗</span></button>}
        </fieldset>
      </form>
      {error && <p className="wr-error" role="alert">{error}</p>}
      {saved && <><p className="wr-success" role="status">기록이 이 브라우저에 저장됐어요.</p><button className="wr-primary-button" onClick={onHistory}>내 기록 보기 →</button></>}
      <button className="wr-secondary-button" onClick={() => saved ? reset() : setConfirmDiscard(true)}>새 러닝 준비</button>
      {confirmDiscard && <div className="wr-notice" role="alert"><p>저장하지 않은 결과를 버리고 새로 시작할까요?</p><div className="wr-actions"><button className="wr-secondary-button" onClick={() => setConfirmDiscard(false)}>계속 작성</button><button className="wr-secondary-button" onClick={reset}>결과 버리기</button></div></div>}
    </div>}
  </section>;
}
