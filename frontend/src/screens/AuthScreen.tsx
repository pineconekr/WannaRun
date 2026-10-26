import React, { useState } from 'react';
import { useAuth } from '../components/AuthProvider';
import { authRequest } from '../services/auth';

export default function AuthScreen({ onGuest }: { onGuest?: () => void }) {
  const { login } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(''); setMessage('');
    if (mode === 'signup' && password !== confirm) { setError('비밀번호가 일치하지 않아요.'); return; }
    setBusy(true);
    try {
      if (mode === 'signup') {
        await authRequest('/auth/signup', { method: 'POST', body: JSON.stringify({ username: username.trim(), password }) });
        setMode('login'); setPassword(''); setConfirm('');
        setMessage('회원가입이 완료됐어요. 가입한 계정으로 로그인해 주세요.');
      } else await login(username.trim(), password);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  return <section className="wr-account" aria-labelledby="auth-title">
    <p className="wr-eyebrow">YOUR RUN STARTS HERE</p>
    <h1 id="auth-title">{mode === 'login' ? '다시 만나 반가워요' : '함께 달려볼까요?'}</h1>
    <p className="wr-description">{mode === 'login' ? 'WannaRun 계정으로 로그인해 주세요.' : '아이디로 나만의 러닝 계정을 만들어 보세요.'}</p>
    <form onSubmit={submit} className="wr-form">
      <fieldset disabled={busy}>
        <label htmlFor="auth-username">아이디</label>
        <input id="auth-username" autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={mode === 'signup' ? 4 : 1} maxLength={20} pattern={mode === 'signup' ? '[A-Za-z0-9_]{4,20}' : undefined} required value={username} onChange={e => setUsername(e.target.value)} placeholder="runner_01" aria-describedby={mode === 'signup' ? 'username-help' : undefined} />
        {mode === 'signup' && <small id="username-help">영문·숫자·_ 4~20자. 대소문자는 구분하지 않아요.</small>}
        <label htmlFor="auth-password">비밀번호</label>
        <input id="auth-password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'signup' ? 8 : 1} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} aria-describedby={mode === 'signup' ? 'password-help' : undefined} />
        {mode === 'signup' && <>
          <small id="password-help">8~128자로 입력해 주세요.</small>
          <label htmlFor="auth-confirm">비밀번호 확인</label>
          <input id="auth-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} />
        </>}
        {error && <p className="wr-error" role="alert">{error}</p>}
        {message && <p className="wr-success" role="status">{message}</p>}
        <button className="wr-primary-button" type="submit">{busy ? '처리 중…' : mode === 'login' ? '로그인' : '회원가입'}</button>
      </fieldset>
    </form>
    <button className="wr-text-button" disabled={busy} onClick={() => {
      setMode(mode === 'login' ? 'signup' : 'login'); setPassword(''); setConfirm(''); setError(''); setMessage('');
    }}>{mode === 'login' ? '처음 오셨나요? 회원가입' : '이미 계정이 있나요? 로그인'}</button>
    {onGuest && <button type="button" className="wr-text-button" disabled={busy} onClick={onGuest}>로그인 없이 둘러보기</button>}
  </section>;
}
