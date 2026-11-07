import React from "react";
import type { RunStatus } from "../screens/HomeTab";

export type NavigationTab = "home" | "run" | "history" | "leaderboard" | "events" | "profile";

type Props = {
  activeTab: NavigationTab;
  runStatus: RunStatus;
  onChange: (tab: NavigationTab) => void;
};

const items: { id: NavigationTab; label: string; path: string }[] = [
  { id: "home", label: "홈", path: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9" },
  { id: "run", label: "러닝", path: "m9 4 12 8-12 8Z" },
  { id: "history", label: "기록", path: "M5 3h14v18H5ZM9 8h6M9 12h6M9 16h4" },
  { id: "leaderboard", label: "랭킹", path: "M3 21V11h6v10M9 21V4h6v17M15 21v-7h6v7M2 21h20" },
  { id: "profile", label: "프로필", path: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2" },
];

export default function BottomNavigation({ activeTab, runStatus, onChange }: Props) {
  return (
    <nav className="wr-bottom-nav" aria-label="하단 메뉴">
      {items.map(item => (
        <button key={item.id} type="button"
          className={`wr-nav-item ${activeTab === item.id ? "is-active" : ""}`}
          aria-current={activeTab === item.id ? "page" : undefined}
          onClick={() => onChange(item.id)}>
          <svg className="wr-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={item.path} />
          </svg>
          <span>{item.label}</span>
          {item.id === "run" && runStatus !== "ready" && <span className={`wr-nav-dot ${runStatus === "active" ? "is-live" : ""}`}>
            <span className="wr-sr">{runStatus === "active" ? " · 달리는 중" : " · 저장하지 않은 결과"}</span>
          </span>}
        </button>
      ))}
    </nav>
  );
}
