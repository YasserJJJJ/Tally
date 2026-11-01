/** The Tally T: a two-tone bar with a folded stem. The gap between them is transparent. */
export function TallyMark({ height = 20 }: { height?: number }) {
  return <svg className="tally-mark" width={Math.round(height * 232.7 / 205)} height={height} viewBox="0 0 232.7 205" aria-hidden="true">
    <path fill="#2a55fe" d="M73.4 0H214.7a18 18 0 0 1 18 18V59.3a18 18 0 0 1-18 18H145.5V50Q145.5 45 141 43.8L137 43Z" />
    <path fill="#355ffe" d="M18 0H73.4L137 43 72.7 77.3H18a18 18 0 0 1-18-18V18A18 18 0 0 1 18 0Z" />
    <path fill="#7c93fe" d="M145.5 51V165.5Q145.5 172 139 176L93 203Q86 206.5 80 204 72.7 201 72.7 193V104Q72.7 99 78 96.8L140.5 47Q145.5 44.5 145.5 51Z" />
  </svg>;
}

export function Wordmark({ onClick }: { onClick?: () => void }) {
  const content = <><TallyMark />Tally</>;
  return onClick
    ? <button type="button" className="wordmark" onClick={onClick}>{content}</button>
    : <span className="wordmark">{content}</span>;
}
