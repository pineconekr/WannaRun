import React, { useState } from 'react';
import { useAuth } from '../components/AuthProvider';
import { authRequest } from '../services/auth';
import { TerritoryRules } from '../components/ui';

type FieldErrors = { username?: string; password?: string; confirm?: string };

export default function AuthScreen({ onGuest }: { onGuest?: () => void }) {
  const { login } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState('');
  const signup = mode === 'signup';

  function validate(name: string): FieldErrors {
    const errors: FieldErrors = {};
    if (!name) errors.username = '아이디를 입력해 주세요.';
    else if (signup && !/^[a-z0-9_]{4,20}$/.test(name)) errors.username = '영문 소문자·숫자·_로 4~20자를 입력해 주세요.';
    if (!password) errors.password = '비밀번호를 입력해 주세요.';
    else if (signup && password.length < 8) errors.password = '비밀번호는 8자 이상이어야 해요.';
    if (signup && password !== confirm) errors.confirm = '비밀번호가 일치하지 않아요.';
    return errors;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(''); setMessage('');
    const name = username.trim();
    const errors = validate(name);
    setFieldErrors(errors);
    const firstInvalid = (['username', 'password', 'confirm'] as const).find(field => errors[field]);
    if (firstInvalid) { document.getElementById(`auth-${firstInvalid}`)?.focus(); return; }
    setBusy(true);
    try {
      if (signup) {
        await authRequest('/auth/signup', { method: 'POST', body: JSON.stringify({ username: name, password }) });
        try { await login(name, password); }
        catch {
          // 가입은 됐으니 로그인 화면으로 넘겨 다시 시도하게 합니다.
          setMode('login'); setPassword(''); setConfirm('');
          setMessage('회원가입이 완료됐어요. 가입한 계정으로 로그인해 주세요.');
        }
      } else await login(name, password);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }

  const describedBy = (...ids: (string | false)[]) => ids.filter(Boolean).join(' ') || undefined;
  const title = signup ? '함께 달려볼까요?' : onGuest ? '달린 길이 내 땅이 돼요' : '로그인하고 랭킹에 올라가요';
  const description = signup ? '아이디로 나만의 러닝 계정을 만들어 보세요.'
    : onGuest ? 'GPS로 달리면 지나간 길 주변 육각형 칸을 차지해요. 이번 주 거리로 이웃 러너와 순위도 겨뤄요.'
    : '계정이 있으면 기록이 계정에 남고 이번 주 랭킹에 올라가요.';

  return <section className="wr-account" aria-labelledby="auth-title">
    <h1 id="auth-title">{title}</h1>
    <p className="wr-description">{description}</p>
    {onGuest && !signup && <>
      <TerritoryRules />
      <div className="wr-guest-start">
        <button type="button" className="wr-secondary-button" disabled={busy} onClick={onGuest} aria-describedby="guest-note">로그인 없이 먼저 달려보기</button>
        <small id="guest-note">기록과 영토는 이 기기에만 저장돼요</small>
      </div>
    </>}
    <form onSubmit={submit} className="wr-form" noValidate>
      <fieldset disabled={busy}>
        <label htmlFor="auth-username">아이디</label>
        <input id="auth-username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={20}
          value={username} onChange={e => setUsername(e.target.value.toLowerCase())} placeholder="runner_01"
          aria-invalid={Boolean(fieldErrors.username)}
          aria-describedby={describedBy(signup && 'username-help', Boolean(fieldErrors.username) && 'username-error')} />
        {signup && <small id="username-help">영문 소문자·숫자·_ 4~20자</small>}
        {fieldErrors.username && <small id="username-error" className="wr-field-error">{fieldErrors.username}</small>}
        <label htmlFor="auth-password">비밀번호</label>
        <input id="auth-password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} maxLength={128}
          value={password} onChange={e => setPassword(e.target.value)}
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={describedBy(signup && 'password-help', Boolean(fieldErrors.password) && 'password-error')} />
        {signup && <small id="password-help">8~128자로 입력해 주세요.</small>}
        {fieldErrors.password && <small id="password-error" className="wr-field-error">{fieldErrors.password}</small>}
        {signup && <>
          <label htmlFor="auth-confirm">비밀번호 확인</label>
          <input id="auth-confirm" type="password" autoComplete="new-password" maxLength={128} value={confirm}
            onChange={e => setConfirm(e.target.value)} aria-invalid={Boolean(fieldErrors.confirm)}
            aria-describedby={fieldErrors.confirm ? 'confirm-error' : undefined} />
          {fieldErrors.confirm && <small id="confirm-error" className="wr-field-error">{fieldErrors.confirm}</small>}
        </>}
        {error && <p className="wr-error" role="alert">{error}</p>}
        {message && <p className="wr-success" role="status">{message}</p>}
        <button className="wr-primary-button" type="submit">
          {busy ? (signup ? '계정 만드는 중…' : '로그인 중…') : signup ? '회원가입' : '로그인'}
        </button>
      </fieldset>
    </form>
    <button type="button" className="wr-text-button" disabled={busy} onClick={() => {
      setMode(signup ? 'login' : 'signup'); setPassword(''); setConfirm(''); setError(''); setFieldErrors({}); setMessage('');
    }}>{signup ? '이미 계정이 있나요? 로그인' : '처음 오셨나요? 회원가입'}</button>
  </section>;
}
