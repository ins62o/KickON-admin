import type {MarketingDraft} from './marketing-drafts';
import {matchdayGroups} from './marketing-matchday';

const font='"Inter", "Pretendard Variable", sans-serif',heading='"Elice Digital Baeum", "Pretendard Variable", sans-serif';
const blue='#0065EF',ink='#10152E',muted='#525A79',line='#E0E6F0';
const logos=new Map<string,Promise<HTMLImageElement>>();
function teamLogo(id:string){
 let result=logos.get(id);
 if(!result){result=new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{logos.delete(id);reject(Error('구단 로고를 불러오지 못했어요 다시 시도해 주세요'));};image.src=`/teams/official/${encodeURIComponent(id)}.png`;});logos.set(id,result);}
 return result;
}
function imageFit(ctx:CanvasRenderingContext2D,image:HTMLImageElement,x:number,y:number,size:number){const scale=Math.min(size/image.width,size/image.height),width=image.width*scale,height=image.height*scale;ctx.drawImage(image,x+(size-width)/2,y+(size-height)/2,width,height);}
function rule(ctx:CanvasRenderingContext2D,x:number,y:number,width:number){ctx.beginPath();ctx.strokeStyle=line;ctx.lineWidth=1.5;ctx.moveTo(x,y);ctx.lineTo(x+width,y);ctx.stroke();}
function fitText(ctx:CanvasRenderingContext2D,value:string,x:number,y:number,width:number,size:number,minSize:number,weight:number,color:string,family=font){
 while(size>minSize){ctx.font=`${weight} ${size}px ${family}`;if(ctx.measureText(value).width<=width)break;size-=1;}
 ctx.font=`${weight} ${size}px ${family}`;ctx.fillStyle=color;ctx.fillText(value,x,y);
 return ctx.measureText(value).width>width;
}
export async function paintMatchday(ctx:CanvasRenderingContext2D,draft:MarketingDraft,brand:HTMLImageElement|null,height:number){
 const matches=draft.matchday!.matches,groups=matchdayGroups(matches),ids=[...new Set(matches.flatMap(match=>[match.homeTeamId,match.awayTeamId]))];
 const images=new Map(await Promise.all(ids.map(async id=>[id,await teamLogo(id)] as const)));
 const background=ctx.createLinearGradient(0,0,1080,height);background.addColorStop(0,'#0088F5');background.addColorStop(.55,'#006FE7');background.addColorStop(1,'#005ED3');ctx.fillStyle=background;ctx.fillRect(0,0,1080,height);
 const glow=ctx.createRadialGradient(240,120,40,540,height*.48,height*.8);glow.addColorStop(0,'#56CCFF33');glow.addColorStop(1,'#0067F000');ctx.fillStyle=glow;ctx.fillRect(0,0,1080,height);
 const paperTop=height===1920?116:86,paperBottom=height-66,left=72,width=936;
 ctx.save();ctx.shadowColor='#002B7655';ctx.shadowBlur=36;ctx.shadowOffsetY=12;ctx.fillStyle='#FFFFFF';ctx.beginPath();ctx.roundRect(left,paperTop,width,paperBottom-paperTop,18);ctx.fill();ctx.restore();
 const paper=ctx.createLinearGradient(left,paperTop,left+width,paperBottom);paper.addColorStop(0,'#FFFFFF');paper.addColorStop(1,'#FAFCFF');ctx.fillStyle=paper;ctx.beginPath();ctx.roundRect(left,paperTop,width,paperBottom-paperTop,18);ctx.fill();
 ctx.save();ctx.textAlign='center';ctx.textBaseline='top';
 const story=height===1920,headerHeight=story?76:62;
 let overflow=fitText(ctx,draft.title||'MATCH DAY',540,paperTop+(story?76:50),820,story?96:76,42,700,blue,heading);
 const start=paperTop+(story?222:174),footerY=paperBottom-94,rows=groups.reduce((sum,group)=>sum+Math.ceil(group.matches.length/2),0);
 const rowHeight=Math.min(story?328:252,(footerY-start-32-groups.length*headerHeight)/Math.max(1,rows));
 overflow=overflow||rowHeight<190;
 let y=start;
 rule(ctx,120,y-18,840);
 if(!matches.length){ctx.font=`500 34px ${font}`;ctx.fillStyle=muted;ctx.fillText('경기를 불러와 주세요',540,(start+footerY)/2);}
 ctx.save();ctx.beginPath();ctx.rect(120,start,840,Math.max(0,footerY-start-20));ctx.clip();
 for(const group of groups){
  ctx.textAlign='left';ctx.font=`700 46px ${heading}`;ctx.fillStyle=blue;const league=group.leagueId==='kleague'?'K LEAGUE 1':'K LEAGUE 2';ctx.fillText(league,120,y+6);
  y+=headerHeight;
  for(let index=0;index<group.matches.length;index+=2){
   const count=Math.min(2,group.matches.length-index);
   for(let column=0;column<count;column++){
    const match=group.matches[index+column],center=330+column*420,logoSize=Math.min(142,rowHeight*(story?.43:.36)),logoY=y+12;
    imageFit(ctx,images.get(match.homeTeamId)!,center-106-logoSize/2,logoY,logoSize);imageFit(ctx,images.get(match.awayTeamId)!,center+106-logoSize/2,logoY,logoSize);
    ctx.textAlign='center';const titleY=logoY+logoSize+(story?10:8);
    overflow=fitText(ctx,match.homeName,center-106,titleY,174,story?40:32,24,800,ink)||overflow;
    overflow=fitText(ctx,match.awayName,center+106,titleY,174,story?40:32,24,800,ink)||overflow;
    fitText(ctx,'vs',center,titleY+(story?10:7),60,story?28:22,22,500,muted);
    const time=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(match.kickoffAt));
    overflow=fitText(ctx,`${time}   ${match.stadium}`,center,titleY+(story?72:54),388,story?30:26,22,400,muted)||overflow;
   }
   if(count===2){ctx.beginPath();ctx.strokeStyle=line;ctx.lineWidth=1.5;ctx.moveTo(540,y+8);ctx.lineTo(540,y+rowHeight-22);ctx.stroke();}
   y+=rowHeight;rule(ctx,120,y-8,840);
  }
 }
 ctx.restore();
 if(!matches.length)rule(ctx,120,footerY-12,840);
 if(brand){const brandHeight=48;ctx.drawImage(brand,120,footerY+13,brandHeight*brand.width/brand.height,brandHeight);}
 ctx.textAlign='right';overflow=fitText(ctx,draft.matchday!.footer,960,footerY+22,660,30,22,700,blue)||overflow;ctx.restore();
 const clip=ctx.createLinearGradient(0,paperTop-28,0,paperTop+38);clip.addColorStop(0,'#E4EAF3');clip.addColorStop(1,'#BFCADA');ctx.save();ctx.shadowColor='#173A6E22';ctx.shadowBlur=8;ctx.shadowOffsetY=4;ctx.fillStyle=clip;ctx.strokeStyle='#98A8C0';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(402,paperTop-30,276,68,16);ctx.fill();ctx.stroke();ctx.shadowColor='transparent';ctx.fillStyle='#FFFFFF';ctx.beginPath();ctx.roundRect(456,paperTop-16,168,24,12);ctx.fill();ctx.restore();
 return {overflow};
}
