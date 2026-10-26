import {useEffect,useRef,useState} from "react";
export function AnimatedNumber({value,digits=0}: {value:number;digits?:number}) {
  const [display,setDisplay]=useState(0);
  const previous=useRef(0);
  const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(()=>{
    if(reduced)return;
    const start=performance.now(),from=previous.current;
    let frame=0;
    const tick=(now:number)=>{const progress=Math.min(1,(now-start)/1250);const next=from+(value-from)*(1-(1-progress)**3);previous.current=next;setDisplay(next);if(progress<1)frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[value,reduced]);
  const format=(number:number)=>number.toLocaleString("ko-KR",{minimumFractionDigits:digits,maximumFractionDigits:digits});
  return <><span aria-hidden="true">{format(reduced?value:display)}</span><span className="visually-hidden">{format(value)}</span></>;
}
