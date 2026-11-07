// 여러 화면이 같이 쓰는 작은 조각. 같은 사실은 어디서나 같은 모양으로 보이게 합니다.
import React from 'react';

export function HexIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 20.2 7.25v9.5L12 21.5l-8.2-4.75v-9.5Z" /></svg>;
}

export function PlayIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5Z" /></svg>;
}

/** 영토 칸 수. 이 앱의 화폐라 어디서나 귤색 육각형과 함께 씁니다. signed는 "+3칸"처럼 증가분을 나타낼 때. */
export function CellCount({ value, signed = false, className = '' }: { value: number; signed?: boolean; className?: string }) {
  return <span className={`wr-cells ${className}`}>
    <HexIcon />
    {signed && value > 0 ? '+' : ''}{value.toLocaleString('ko-KR')}<small>칸</small>
  </span>;
}

/** 땅따먹기 방법 3단계. 첫 화면과 영토가 없는 홈에서 같은 문구로 씁니다. */
export function TerritoryRules() {
  return <ol className="wr-rules" aria-label="땅따먹기 방법">
    <li><strong>달리기</strong>GPS 러닝을 시작하고 평소처럼 달려요.</li>
    <li><strong>차지하기</strong>지나간 길 주변의 육각형 칸이 내 땅이 돼요.</li>
    <li><strong>넓히기</strong>새로운 길로 달릴수록 영토가 넓어져요.</li>
  </ol>;
}

/** 불러오기 실패와 다시 시도. */
export function RetryError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="wr-error" role="alert">
    <p>{message}</p>
    <button type="button" className="wr-secondary-button" onClick={onRetry}>다시 불러오기</button>
  </div>;
}

type ConfirmProps = {
  message: React.ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  onCancel: () => void;
  onConfirm: () => void;
  className?: string;
};

/** 모달 없이 그 자리에서 묻는 확인. 나타나면 화면 안으로 스크롤하고 취소 버튼에 초점을 둡니다. */
export function InlineConfirm({ message, cancelLabel, confirmLabel, tone = 'primary', onCancel, onConfirm, className = 'wr-notice' }: ConfirmProps) {
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    cancelRef.current?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    cancelRef.current?.focus({ preventScroll: true });
  }, []);
  return <div className={className} role="alert">
    <p>{message}</p>
    <div className="wr-actions">
      <button ref={cancelRef} type="button" className="wr-secondary-button" onClick={onCancel}>{cancelLabel}</button>
      <button type="button" className={tone === 'danger' ? 'wr-danger-button' : 'wr-primary-button'} onClick={onConfirm}>{confirmLabel}</button>
    </div>
  </div>;
}
