import React from 'react';
import HomeScreen from './screens/HomeScreen';
import AuthScreen from './screens/AuthScreen';
import { AuthProvider, useAuth } from './components/AuthProvider';
import './screens/Account.css';

function AppContent() {
  const { user, loading, error, retry, logout } = useAuth();
  const [logoutError, setLogoutError] = React.useState('');
  const [guest, setGuest] = React.useState(false);
  if (loading) return <div className="wr-home"><main className="wr-shell wr-account" role="status">로그인 정보를 확인하고 있어요…</main></div>;
  if (error) return <div className="wr-home"><main className="wr-shell wr-account">
    <h1>계정을 확인하지 못했어요</h1><p role="alert">{error}</p>
    <button className="wr-primary-button" onClick={retry}>다시 시도</button>
    <button className="wr-text-button" onClick={() => { logout().catch(reason => setLogoutError(reason.message)); }}>로그아웃</button>
    {logoutError && <p role="alert">{logoutError}</p>}
  </main></div>;
  return user || guest ? <HomeScreen /> : <div className="wr-home"><main className="wr-shell">
    <header className="wr-header"><span className="wr-logo">Wanna<span>Run</span></span></header>
    <AuthScreen onGuest={() => setGuest(true)} />
  </main></div>;
}
export default function App() { return <AuthProvider><AppContent /></AuthProvider>; }
