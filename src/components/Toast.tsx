import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

function subscribePortal(notify:()=>void){
  const observer=new MutationObserver(notify);
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["open"]});
  return()=>observer.disconnect();
}
const portalTarget=()=>document.querySelector("dialog[open]")??document.body;
export function Toast({ message,onDismiss }: { message: string;onDismiss?:()=>void }) {
  const target=useSyncExternalStore(subscribePortal,portalTarget);
  const [visible, setVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || !visible) return;
    const timer = setTimeout(() => {setVisible(false);onDismiss?.();}, 6000);
    return () => clearTimeout(timer);
  }, [paused, visible,onDismiss]);
  if (!visible) return null;
  return createPortal(<div className="app-toast" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
    <p role="alert" aria-atomic="true">{message}</p>
    <button type="button" aria-label="알림 닫기" onClick={() => {setVisible(false);onDismiss?.();}}>닫기</button>
  </div>, target);
}
