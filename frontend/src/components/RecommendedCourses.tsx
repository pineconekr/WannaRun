import React from "react";
import { MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import { saveCustomDemoRoute, type DemoRoutePosition } from "../services/customDemoRoute";
import { SUYEONG_A_ROUND_TRIP } from "../services/suyeongACourse";
import "./RecommendedCourses.css";

function FitPreview({ route }: { route: DemoRoutePosition[] }) {
  const map = useMap();
  React.useEffect(() => {
    if (route.length > 1) map.fitBounds(route, { padding: [18, 18], maxZoom: 16 });
  }, [map, route]);
  return null;
}

export default function RecommendedCourses({ onStart }: { onStart: () => void }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const roundTripRoute = SUYEONG_A_ROUND_TRIP;

  if (!isOpen) {
    return (
      <button className="wr-course-link" type="button" onClick={() => setIsOpen(true)}>
        <span className="wr-course-link-wordmark" aria-hidden="true">
          <span>FIND YOUR</span>
          <strong>ROUTE</strong>
        </span>
        <span className="wr-course-link-copy">
          <small>RUN BUSAN</small>
          <strong>러닝 코스 추천</strong>
        </span>
        <span className="wr-course-link-arrow" aria-hidden="true">›</span>
      </button>
    );
  }

  return (
    <section className="wr-course-page" aria-labelledby="wr-recommended-course-title">
      <button className="wr-course-back" type="button" onClick={() => setIsOpen(false)}>
        ‹ 러닝 코스 추천
      </button>
      <div className="wr-recommended-course">
      <div className="wr-recommended-course-heading">
        <div>
          <p>RUN BUSAN</p>
          <h2 id="wr-recommended-course-title">러닝 코스 추천</h2>
          <span>지정한 경로를 그대로 사용해요</span>
        </div>
        <span className="wr-course-tag">A · 4km</span>
      </div>

      <div className="wr-recommended-course-map" aria-label="저장된 수영강 A코스 경로 미리보기">
          <MapContainer
            center={roundTripRoute[0]}
            zoom={15}
            scrollWheelZoom={false}
            dragging={false}
            doubleClickZoom={false}
            touchZoom={false}
            zoomControl={false}
            attributionControl={false}
            style={{ width: "100%", height: "100%" }}
          >
            <FitPreview route={roundTripRoute} />
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Polyline positions={roundTripRoute} pathOptions={{ color: "#3d2188", weight: 5, opacity: 0.95 }} />
          </MapContainer>
      </div>

      <div className="wr-recommended-course-footer">
        <div>
          <strong>수영강 A 코스</strong>
          <span>APEC나루공원(4km) → 좌수영교 → 과정교 → APEC나루공원</span>
        </div>
        <button type="button" onClick={() => { saveCustomDemoRoute(roundTripRoute); onStart(); }}>
          이 경로로 러닝하기
          <span aria-hidden="true">→</span>
        </button>
      </div>
      <a href="https://runbusancrew.com/course.html" target="_blank" rel="noreferrer">
        코스 정보 출처: 달려라 부산 러닝크루 ↗
      </a>
      </div>
    </section>
  );
}
