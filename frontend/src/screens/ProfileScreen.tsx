import React, { useState } from 'react';
import AuthScreen from './AuthScreen';
import { useAuth } from '../components/AuthProvider';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function signOut() {
    if (busy) return;
    setBusy(true); setError('');
    try { await logout(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  if (!user) return <AuthScreen />;
  return <section className="wr-account" aria-labelledby="profile-title">
    <p className="wr-eyebrow">MY PROFILE</p>
    <h1 id="profile-title">내 프로필</h1>
    <div className="wr-profile-card">
      <div className="wr-avatar" aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</div>
      <h2>{user.username}</h2>
      <span className="wr-map-badge">오늘도 한 걸음씩</span>
    </div>
    {error && <p className="wr-error" role="alert">{error}</p>}
    <button type="button" className="wr-text-button" disabled={busy} onClick={() => void signOut()}>로그아웃</button>
  </section>;
}
