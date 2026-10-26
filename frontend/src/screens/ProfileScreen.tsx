import React, { useState } from 'react';
import AuthScreen from './AuthScreen';
import { useAuth } from '../components/AuthProvider';

export default function ProfileScreen() {
  const { user, updateNickname, logout } = useAuth();
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function perform(action: () => Promise<void>, success: string) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await action(); setMessage(success); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  if (!user) return <AuthScreen />;
  return <section className="wr-account" aria-labelledby="profile-title">
    <p className="wr-eyebrow">MY PROFILE</p>
    <h1 id="profile-title">내 프로필</h1>
    <div className="wr-profile-card">
      <div className="wr-avatar" aria-hidden="true">{(user?.nickname || user?.email || 'R').slice(0, 1).toUpperCase()}</div>
      <h2>{user?.nickname || 'WannaRun 러너'}</h2>
      <p>{user?.email}</p>
      <span className="wr-map-badge">오늘도 한 걸음씩</span>
    </div>
    <form className="wr-form" onSubmit={event => {
      event.preventDefault();
      if (!nickname.trim()) { setError('닉네임을 입력해 주세요.'); return; }
      void perform(() => updateNickname(nickname.trim()), '닉네임을 저장했어요.');
    }}>
      <fieldset disabled={busy}>
        <label htmlFor="profile-nickname">닉네임</label>
        <input id="profile-nickname" autoComplete="nickname" required maxLength={30} value={nickname} onChange={e => setNickname(e.target.value)} />
        <small>최대 30자까지 입력할 수 있어요.</small>
        <button type="submit" className="wr-primary-button">{busy ? '처리 중…' : '프로필 저장'}</button>
      </fieldset>
    </form>
    {error && <p className="wr-error" role="alert">{error}</p>}
    {message && <p className="wr-success" role="status">{message}</p>}
    <button type="button" className="wr-text-button" disabled={busy} onClick={() => void perform(logout, '')}>로그아웃</button>
  </section>;
}
