import React, { useState } from 'react';
import { emptyProfile, profileErrors, type RunnerProfile } from '../services/profile';
import '../styles/profile-setup.css';

type Props = { initial?: RunnerProfile; busy?: boolean; error?: string; editing?: boolean;
  onSave: (value: RunnerProfile) => void; onBack: (value: RunnerProfile) => void };
export default function ProfileSetupScreen({ initial, busy = false, error, editing, onSave, onBack }: Props) {
  const [value, setValue] = useState<RunnerProfile>(initial ?? emptyProfile);
  const [errors, setErrors] = useState<ReturnType<typeof profileErrors>>({});
  function update<K extends keyof RunnerProfile>(key: K, next: RunnerProfile[K]) { setValue(old => ({ ...old, [key]: next })); }
  const today = new Date();
  const maxDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return <section className="wr-account wr-setup" aria-labelledby="setup-title">
    <button className="wr-link-button" type="button" disabled={busy} onClick={() => onBack(value)}>← {editing ? '내 프로필로' : '계정 정보로'}</button>
    {!editing && <ol className="wr-setup-progress" aria-label="회원가입 단계">
      <li className="is-complete">계정</li><li className="is-current" aria-current="step">프로필</li><li>완료</li>
    </ol>}
    <p className="wr-setup-kicker">{editing ? 'MY RUNNER PROFILE' : 'MAKE IT YOURS'}</p>
    <h1 id="setup-title">나를 소개해 주세요</h1>
    <p className="wr-description">나만의 페이스를 찾아갈 준비.<br />닉네임 외 정보는 나중에 입력해도 괜찮아요.</p>
    <div className="wr-setup-identity">
      <div className="wr-setup-avatar" aria-label="닉네임 이니셜">{value.anonymous ? '?' : Array.from(value.nickname.trim())[0]?.toUpperCase() || 'W'}</div>
      <strong>{value.anonymous ? '익명의 러너' : value.nickname.trim() || '나만의 러너 이름'}</strong>
      <span>나만의 이니셜 프로필</span>
    </div>
    <form className="wr-form" noValidate onSubmit={event => {
      event.preventDefault(); if (busy) return;
      const next = profileErrors(value); setErrors(next);
      const field = Object.keys(next)[0];
      if (field) { document.getElementById(`setup-${field}`)?.focus(); return; }
      onSave({ ...value, nickname: value.nickname.trim() });
    }}>
      <fieldset disabled={busy}>
        <label htmlFor="setup-nickname">닉네임 <span className="wr-setup-required">필수</span></label>
        <input id="setup-nickname" maxLength={20} autoComplete="nickname" placeholder="어떤 이름으로 달릴까요?" value={value.nickname}
          onChange={e => update('nickname', e.target.value)} aria-invalid={Boolean(errors.nickname)} aria-describedby="setup-nickname-help" />
        <small id="setup-nickname-help" className={errors.nickname ? 'wr-field-error' : ''}>{errors.nickname || '이 기기의 내 프로필에 표시되는 이름이에요. 최대 20자'}</small>
        <label htmlFor="setup-birthday">생년월일 <span className="wr-muted">선택</span></label>
        <input id="setup-birthday" type="date" min="1900-01-01" max={maxDate} autoComplete="bday" value={value.birthday}
          onChange={e => update('birthday', e.target.value)} aria-invalid={Boolean(errors.birthday)} aria-describedby={errors.birthday ? 'setup-birthday-error' : undefined} />
        {errors.birthday && <small id="setup-birthday-error" className="wr-field-error">{errors.birthday}</small>}
        <div className="wr-setup-spec-heading"><h2>현재 내 스펙</h2><span>언제든 변경할 수 있어요</span></div>
        <div className="wr-setup-specs">{([['height', '키', 'cm', 50, 250], ['weight', '몸무게', 'kg', 20, 400]] as const).map(([key, label, unit, min, max]) =>
          <div key={key}><label htmlFor={`setup-${key}`}>{label} <span className="wr-muted">선택</span></label>
            <div className="wr-setup-unit"><input id={`setup-${key}`} type="number" inputMode="decimal" step="0.1" min={min} max={max}
              placeholder={key === 'height' ? '170' : '65'} value={value[key]} onChange={e => update(key, e.target.value)}
              aria-invalid={Boolean(errors[key])} aria-describedby={`setup-${key}-unit${errors[key] ? ` setup-${key}-error` : ''}`} /><span id={`setup-${key}-unit`}>{unit}</span></div>
            {errors[key] && <small id={`setup-${key}-error`} className="wr-field-error">{errors[key]}</small>}
          </div>)}</div>
        <div className="wr-setup-options">
          <label className="wr-setup-switch"><span><strong>익명 프로필로 표시</strong><small>이 기기의 내 프로필 이름을 가려요</small></span>
            <input type="checkbox" role="switch" checked={value.anonymous} onChange={e => update('anonymous', e.target.checked)} /><span className="wr-setup-switch-track" aria-hidden="true" /></label>
          <label className="wr-setup-switch"><span><strong>내 신체 정보 숨기기</strong><small>내 프로필 요약에서 생일·키·몸무게를 가려요</small></span>
            <input type="checkbox" role="switch" checked={value.hideSpecs} onChange={e => update('hideSpecs', e.target.checked)} /><span className="wr-setup-switch-track" aria-hidden="true" /></label>
        </div>
        <p className="wr-notice">프로필은 이 브라우저에만 저장돼요. 서버 동기화는 아직 지원하지 않으며, 위 설정은 서버 랭킹의 아이디·공개 범위를 변경하지 않아요. 공용 기기라면 선택 정보는 비워 두세요.</p>
        {error && <p className="wr-error" role="alert">{error}</p>}
        <button className="wr-primary-button" type="submit">{busy ? '저장 중…' : editing ? '프로필 저장' : '가입 완료하고 시작하기'}<span aria-hidden="true">→</span></button>
      </fieldset>
    </form>
  </section>;
}
