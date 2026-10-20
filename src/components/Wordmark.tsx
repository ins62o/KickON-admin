export function Wordmark({ onClick, href = "#home" }: { onClick?: () => void; href?: string }) {
  return <a href={href} className="wordmark" aria-label="KICKON 홈" onClick={onClick}><img src="./branding/kickon-logo.svg" width="994" height="485" alt="KICKON" /></a>;
}
