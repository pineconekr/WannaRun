import React, { useEffect, useRef, useState } from "react";
import RunScreen from "./RunScreen";

import ProfileScreen from "./ProfileScreen";
import HistoryScreen from "./HistoryScreen";
import LeaderboardScreen from "./LeaderboardScreen";
import BusanEventsScreen from "./BusanEventsScreen";

import BottomNavigation from "../components/BottomNavigation";
import type { NavigationTab } from "../components/BottomNavigation";
import { CellCount } from "../components/ui";
import HomeTab, { type RunStatus } from "./HomeTab";
import { useTerritory } from "../services/territory";

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 저장된 칸 수가 늘면 이전 값에서 세어 올라갑니다. 줄거나 모션 감소 설정이면 바로 바꿉니다. */
function useCountUp(target: number) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    from.current = target;
    if (target <= start || reducedMotion()) { setShown(target); return; }
    const began = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - began) / 700);
      setShown(Math.round(start + (target - start) * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState<NavigationTab>("home");
  // 처음 연 뒤에는 다른 탭으로 옮겨도 러닝 측정을 유지합니다.
  const [runMounted, setRunMounted] = useState(false);
  const [runStatus, setRunStatus] = useState<RunStatus>("ready");
  // 홈의 시작 버튼이 누를 때마다 올리는 번호. 러닝 화면이 바뀐 번호를 보면 측정을 시작합니다.
  const [startRequest, setStartRequest] = useState(0);
  const [liveClaim, setLiveClaim] = useState(0);
  const territory = useTerritory();
  const stored = useCountUp(Object.keys(territory).length);
  const hudCount = stored + (runStatus === "active" ? liveClaim : 0);
  const scroller = useRef<HTMLDivElement>(null);
  const territorySection = useRef<HTMLElement>(null);
  const [scrollToTerritory, setScrollToTerritory] = useState(false);

  useEffect(() => { if (runStatus !== "active") setLiveClaim(0); }, [runStatus]);
  useEffect(() => { if (activeTab === "run") setRunMounted(true); }, [activeTab]);

  // 탭을 바꾸면 새 화면은 맨 위부터 보입니다.
  useEffect(() => {
    scroller.current?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, [activeTab]);

  useEffect(() => {
    if (!scrollToTerritory || activeTab !== "home") return;
    setScrollToTerritory(false);
    territorySection.current?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
  }, [scrollToTerritory, activeTab]);

  function startFromHome() {
    setActiveTab("run");
    if (runStatus === "ready") setStartRequest(value => value + 1);
  }

  return (
    <div className="wr-home" ref={scroller}>
      <div className="wr-shell">
        <header className="wr-header">
          <a
            className="wr-logo"
            href="#"
            onClick={(event) => {
              event.preventDefault();
              setActiveTab("home");
            }}
          >
            Wanna<span>Run</span>
          </a>
          <button type="button" className="wr-hud" onClick={() => { setActiveTab("home"); setScrollToTerritory(true); }}>
            <span className="wr-sr">내 영토 보기: </span>
            <span key={hudCount} className="wr-hud-count"><CellCount value={hudCount} /></span>
          </button>
        </header>

        <main className="wr-main">
          {activeTab === "profile" ? <ProfileScreen /> : activeTab === "history" ? <HistoryScreen onStart={startFromHome} /> : activeTab === "leaderboard" ? <LeaderboardScreen onLogin={() => setActiveTab("profile")} /> : activeTab === "events" ? <BusanEventsScreen /> : activeTab === "home" ? (
            <HomeTab ref={territorySection} runStatus={runStatus} onStart={startFromHome} onHistory={() => setActiveTab("history")}
              onLeaderboard={() => setActiveTab("leaderboard")} onLogin={() => setActiveTab("profile")}
              onEvents={() => setActiveTab("events")} onPrepare={() => setActiveTab("run")} />
          ) : null}
          {runMounted && <div hidden={activeTab !== "run"}>
            <RunScreen onHistory={() => setActiveTab("history")} startRequest={startRequest} onStatusChange={setRunStatus}
              visible={activeTab === "run"} onLiveClaim={setLiveClaim} />
          </div>}
        </main>

        <BottomNavigation
          activeTab={activeTab}
          runStatus={runStatus}
          onChange={setActiveTab}
        />
      </div>
    </div>
  );
}
