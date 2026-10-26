import React, { useState } from "react";
import ProfileScreen from "./ProfileScreen";
import HistoryScreen from "./HistoryScreen";
import MapScreen from "./MapScreen";
import BottomNavigation from "../components/BottomNavigation";
import type { NavigationTab } from "../components/BottomNavigation";
import "./HomeScreen.css";
export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState<NavigationTab>("home");

  return (
    <div className="wr-home">
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
          <span className="wr-header-label">오늘도 나답게 달리기</span>
        </header>

        <main className="wr-main">
          {activeTab === "profile" ? <ProfileScreen /> : activeTab === "history" ? <HistoryScreen /> : activeTab === "home" ? (
            <>
              <section className="wr-intro">
                <p className="wr-eyebrow">READY TO RUN?</p>
                <h1>
                  오늘도
                  <br />
                  달려볼까요?
                </h1>
                <p className="wr-description">
                  가볍게 시작하는 나만의 러닝.
                  <br />
                  오늘의 출발점을 확인해 보세요.
                </p>
              </section>

              <section
                className="wr-map-card"
                aria-labelledby="wr-map-heading"
              >
                <div className="wr-map-heading">
                  <div>
                    <span className="wr-tag">러닝 지도</span>
                    <h2 id="wr-map-heading">나의 러닝 경로</h2>
                  </div>
                  <span className="wr-map-badge">경로 확인</span>
                </div>

                <div
                  className="wr-map-embed"
                  role="region"
                  aria-label="러닝 경로 지도"
                >
                  <MapScreen />
                </div>

                <p className="wr-map-caption">
                  위치 권한을 허용해 현재 위치를 확인하거나, 경로를 지정해 데모 이동을 실행해 보세요.
                </p>
              </section>

              <section className="wr-start-card">
                <div>
                  <h2>첫걸음부터 차근차근</h2>
                  <p>오늘의 러닝을 준비해 보세요.</p>
                </div>
                <button
                  className="wr-primary-button"
                  type="button"
                  onClick={() => setActiveTab("run")}
                >
                  러닝 준비하기 <span aria-hidden="true">→</span>
                </button>
              </section>
            </>
          ) : (
            <section className="wr-empty" aria-labelledby="wr-page-title">
              <span className="wr-empty-icon" aria-hidden="true">
                {activeTab === "run" ? "▷" : "▤"}
              </span>
              <p className="wr-eyebrow">
                {activeTab === "run" ? "LET’S RUN" : "MY RECORDS"}
              </p>
              <h1 id="wr-page-title">
                {activeTab === "run" ? "러닝 화면 준비 중" : "기록 화면 준비 중"}
              </h1>
              <p>
                {activeTab === "run"
                  ? "러닝 시작·종료 기능이 이곳에 연결될 예정이에요."
                  : "저장한 러닝 기록이 이곳에 표시될 예정이에요."}
              </p>
              <button
                className="wr-primary-button"
                type="button"
                onClick={() => setActiveTab("home")}
              >
                홈으로 돌아가기
              </button>
            </section>
          )}
        </main>

        <BottomNavigation
          activeTab={activeTab}
          onChange={setActiveTab}
        />
      </div>
    </div>
  );
}