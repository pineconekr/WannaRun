import React from 'react';

/** Decorative star and running shoe; no interaction or application state. */
export default function RunSticker() {
  return <svg className="wr-run-sticker" viewBox="0 0 160 150" fill="none" aria-hidden="true" focusable="false">
    <path className="wr-sticker-orbit" d="M12 116c24 26 108 20 132-28" stroke="currentColor" strokeWidth="2" strokeDasharray="3 7" strokeLinecap="round" />
    <g transform="rotate(9 92 52)">
      <path className="wr-sticker-star" d="m91 9 12 23 27 5-19 21 3 28-25-12-25 12 5-28-19-21 28-5Z" fill="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path className="wr-sticker-face" d="M82 45v5m18-5v5m-17 9q9 9 17 0" strokeWidth="4" strokeLinecap="round" />
    </g>
    <g transform="rotate(-12 75 104)">
      <path className="wr-sticker-shoe" d="m35 83 17-10 12 18 22 6 11 8 29 4q8 1 8 9v7H29v-20Z" strokeWidth="3" strokeLinejoin="round" />
      <path className="wr-sticker-laces" d="m66 91-7 8m19-4-6 8m18-4-5 7M30 117h103" strokeWidth="3" strokeLinecap="round" />
    </g>
    <path d="m139 27 3 7 7 3-7 3-3 7-3-7-7-3 7-3Zm-119 25 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="currentColor" />
  </svg>;
}
