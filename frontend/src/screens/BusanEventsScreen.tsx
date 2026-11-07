import React from 'react';
import { daysUntilEvent, eventDate, getUpcomingBusanEvents } from '../services/busanEvents';

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  }).format(date);
}

export default function BusanEventsScreen() {
  const events = getUpcomingBusanEvents();

  return (
    <section className="wr-events" aria-labelledby="busan-events-title">
      <p className="wr-eyebrow">BUSAN RUNNING EVENTS</p>
      <h1 id="busan-events-title">부산 러닝 대회 일정</h1>
      <p className="wr-description">다가오는 대회와 날짜, 장소, 종목을 확인해 보세요.</p>

      {events.length === 0 ? (
        <div className="wr-record-card"><h2>예정된 대회가 없어요</h2></div>
      ) : (
        <ol className="wr-event-list">
          {events.map((event) => {
            const remainingDays = daysUntilEvent(event);
            return (
              <li className="wr-event-card" key={event.id}>
                <div className="wr-event-topline">
                  <time dateTime={event.date}>{formatDate(eventDate(event))}</time>
                  <span>{remainingDays === 0 ? 'D-Day' : `D-${remainingDays}`}</span>
                </div>
                <h2>{event.name}</h2>
                <p>{event.location}</p>
                <div className="wr-event-bottomline">
                  <span>{event.distances.join(' · ')}</span>
                  <span>{event.registration}</span>
                </div>
                <a href={event.sourceUrl} target="_blank" rel="noreferrer">
                  KorMarathon에서 상세 정보 보기 <span aria-hidden="true">↗</span>
                </a>
              </li>
            );
          })}
        </ol>
      )}

      <p className="wr-events-source">
        일정은 KorMarathon 공개 정보 기준으로 정리했어요. 변경될 수 있으니 참가 전 상세 페이지에서 확인해 주세요.
        {' '}<a href="https://www.kormarathon.com/ko/marathons/regions/busan/2026" target="_blank" rel="noreferrer">부산 전체 일정 보기 ↗</a>
      </p>
    </section>
  );
}
