import {LoaderCircle} from 'lucide-react';
import {isValidElement} from 'react';
import {playerName,type TeamPlayer} from './team-detail';

const value=(entry:unknown)=>isValidElement(entry)?entry:entry===null||entry===undefined||entry===''?'—':String(entry);
export function Info({items}:{items:[string,unknown][]}){return <dl className="club-info-grid">{items.map(([label,entry])=><div key={label}><dt>{label}</dt><dd>{value(entry)}</dd></div>)}</dl>;}
export function SaveButton({pending}:{pending:boolean}){return <button type="submit" className="primary-button" disabled={pending}>{pending?<><LoaderCircle size={18} className="system-restart-spinner" aria-hidden="true"/><span className="visually-hidden">저장 중</span></>:'수정 저장'}</button>;}
export function PlayerPhoto({player}:{player:TeamPlayer}){return <span className="club-player-photo">{player.image_url&&/^https?:\/\//.test(player.image_url)?<img src={player.image_url} alt="" loading="lazy" onError={event=>{event.currentTarget.hidden=true;}}/>:null}<span aria-hidden="true">{playerName(player).slice(0,1)}</span></span>;}
