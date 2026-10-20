export function Curves() {
  return <div className="curves" aria-hidden="true">{["left", "right", "top"].map(side => <div className={`curves-${side}`} key={side}>{Array.from({ length: 20 }, (_, i) => <span key={i} className={`curve curve-${side}`} style={{ width: side === "top" ? `${160 + i * 15}px` : `${60 + i * 10}px`, height: side === "top" ? `${60 + i * 10}px` : undefined, animationDelay: `${i * 0.25}s` }} />)}</div>)}</div>;
}
