/** Tally marks: four strokes and a crossing line. */
export function TallyMark({ size = 22 }: { size?: number }) {
  return <svg className="tally-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <path d="M8.5 7v18M13 7v18M17.5 7v18M22 7v18M5 22 25.5 10" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
  </svg>;
}

export function Wordmark({ onClick }: { onClick?: () => void }) {
  const content = <><TallyMark />Tally</>;
  return onClick
    ? <button type="button" className="wordmark" onClick={onClick}>{content}</button>
    : <span className="wordmark">{content}</span>;
}
