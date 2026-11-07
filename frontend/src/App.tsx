import React from 'react';
import HomeScreen from './screens/HomeScreen';
import AuthScreen from './screens/AuthScreen';
import { AuthProvider, useAuth } from './components/AuthProvider';

const GUEST_KEY = 'wannarun.guest';

function AuthShell({ children }: { children: React.ReactNode }) {
  return <div className="wr-home"><main className="wr-shell">
    <header className="wr-header"><span className="wr-logo">Wanna<span>Run</span></span></header>
    {children}
  </main></div>;
}

function AppContent() {
  const { user, loading, error, offline, retry, logout } = useAuth();
  const [logoutError, setLogoutError] = React.useState('');
  const [guest, setGuest] = React.useState(() => localStorage.getItem(GUEST_KEY) === '1');
  const hadUser = React.useRef(false);

  // 로그인하면 게스트 표시를 지우고, 로그아웃하면 첫 화면으로 돌아갑니다.
  React.useEffect(() => {
    if (user) {
      hadUser.current = true;
      localStorage.removeItem(GUEST_KEY);
      setGuest(false);
    } else if (hadUser.current && !loading) {
      hadUser.current = false;
      localStorage.removeItem(GUEST_KEY);
      setGuest(false);
    }
  }, [user, loading]);

  function startGuest() {
    localStorage.setItem(GUEST_KEY, '1');
    setGuest(true);
  }

  // 게스트가 앱 안에서 로그인할 때는 화면을 갈아엎지 않아야 진행 중인 러닝 결과가 보존됩니다.
  if (user || guest || offline) return <HomeScreen />;
  if (loading) return <AuthShell><p className="wr-account" role="status">로그인 정보를 확인하고 있어요…</p></AuthShell>;
  if (error) return <AuthShell><div className="wr-account">
    <h1>계정을 확인하지 못했어요</h1><p role="alert">{error}</p>
    <button className="wr-primary-button" onClick={retry}>다시 시도</button>
    <button className="wr-text-button" onClick={() => { logout().catch(reason => setLogoutError(reason.message)); }}>로그아웃</button>
    {logoutError && <p role="alert">{logoutError}</p>}
  </div></AuthShell>;
  return <AuthShell><AuthScreen onGuest={startGuest} /></AuthShell>;
}
export default function App() { return <AuthProvider><AppContent /></AuthProvider>; }
