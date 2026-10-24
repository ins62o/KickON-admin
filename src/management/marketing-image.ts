import {marketingPlaceholders,type MarketingDraft} from "./marketing-drafts";
import {paintMatchday} from './marketing-matchday-image';
const font='"Inter", "Pretendard Variable", sans-serif';
const headingFont='"Elice Digital Baeum", "Pretendard Variable", sans-serif';
const blue="#006ACC",ink="#111111",muted="#626262";
let logoPromise:Promise<HTMLImageElement|null>|null=null,darkLogoPromise:Promise<HTMLImageElement|null>|null=null;
function logo(dark=false){
  const load=()=>new Promise<HTMLImageElement|null>(resolve=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>resolve(null);image.src=dark?"/branding/kickon-logo-dark-transparent.svg":"/branding/kickon-logo.svg";});
  return dark?(darkLogoPromise??=load()):(logoPromise??=load());
}
function wrap(ctx:CanvasRenderingContext2D,content:string,width:number){
  const lines:string[]=[];
  for(const paragraph of content.split("\n")){let line="";for(const letter of paragraph){if(ctx.measureText(line+letter).width>width&&line){lines.push(line);line=letter;}else line+=letter;}lines.push(line);}
  return lines;
}
function lines(ctx:CanvasRenderingContext2D,content:string,width:number,size:number,weight=400,family=font){ctx.font=`${weight} ${size}px ${family}`;return wrap(ctx,content,width);}
function text(ctx:CanvasRenderingContext2D,content:string,x:number,y:number,width:number,size:number,weight=400,color=ink,leading=1.5,family=font){
  const rows=lines(ctx,content,width,size,weight,family);ctx.fillStyle=color;
  // Align artwork headings by their visible glyph bounds rather than the font's extra vertical space
  rows.forEach((row,index)=>ctx.fillText(row,x,y+index*size*leading+(family===headingFont?ctx.measureText(row).actualBoundingBoxAscent:0)));return y+rows.length*size*leading;
}
function rule(ctx:CanvasRenderingContext2D,x:number,y:number,width:number,color="#DEDEDE"){ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+width,y);ctx.stroke();}
function brandMark(ctx:CanvasRenderingContext2D,brand:HTMLImageElement|null,x:number,y:number,height=60){if(brand)ctx.drawImage(brand,x,y,height*brand.width/brand.height,height);else text(ctx,"KICKON",x,y,300,height*.35,700,blue);}
function paragraph(ctx:CanvasRenderingContext2D,content:string,x:number,y:number,width:number,bottom:number,size:number,leading:number){
  while(size>24&&y+lines(ctx,content,width,size).length*size*leading>bottom)size-=2;
  const overflow=y+lines(ctx,content,width,size).length*size*leading>bottom;
  ctx.save();ctx.beginPath();ctx.rect(x,y,width,Math.max(0,bottom-y));ctx.clip();text(ctx,content,x,y,width,size,400,ink,leading);ctx.restore();return overflow;
}
function eventPoster(ctx:CanvasRenderingContext2D,draft:MarketingDraft,brand:HTMLImageElement|null,top:number,bottom:number){
  const height=top+bottom,span=bottom-top,cy=top+span*.47,rx=520,ry=520;
  ctx.fillStyle="#0D1622";ctx.fillRect(0,0,1080,height);
  const glow=ctx.createRadialGradient(390,cy-240,20,490,cy,800);glow.addColorStop(0,"#D34CCA99");glow.addColorStop(.48,"#7C2DBA77");glow.addColorStop(1,"#10092A00");ctx.fillStyle=glow;ctx.fillRect(0,0,1080,height);
  const blueGlow=ctx.createRadialGradient(610,cy+280,30,580,cy+240,720);blueGlow.addColorStop(0,"#004FFFAA");blueGlow.addColorStop(.55,"#0933B877");blueGlow.addColorStop(1,"#003AFF00");ctx.fillStyle=blueGlow;ctx.fillRect(0,0,1080,height);
  ctx.save();ctx.beginPath();ctx.ellipse(540,cy,rx,ry,-.25,0,Math.PI*2);ctx.clip();
  const sphere=ctx.createLinearGradient(220,cy-ry,840,cy+ry);sphere.addColorStop(0,"#F4BCA7");sphere.addColorStop(.2,"#B16AAD");sphere.addColorStop(.48,"#58439B");sphere.addColorStop(.72,"#1B35A2");sphere.addColorStop(1,"#0044BB");ctx.fillStyle=sphere;ctx.fillRect(0,0,1080,height);
  const shade=ctx.createRadialGradient(380,cy-ry*.6,15,540,cy,760);shade.addColorStop(0,"#FFD6BF55");shade.addColorStop(.5,"#713CB822");shade.addColorStop(1,"#080827BB");ctx.fillStyle=shade;ctx.fillRect(0,0,1080,height);
  ctx.save();ctx.translate(540,cy-220);ctx.rotate(-.55);const beam=ctx.createLinearGradient(0,-150,0,150);beam.addColorStop(0,"#F6B3C000");beam.addColorStop(.3,"#FFD1BA22");beam.addColorStop(.5,"#FFD8BEBB");beam.addColorStop(.7,"#FFD1BA22");beam.addColorStop(1,"#F6B3C000");ctx.fillStyle=beam;ctx.fillRect(-900,-150,1800,300);ctx.restore();ctx.restore();

  const title=draft.title||marketingPlaceholders.titles.event,titleTop=top+span*.235,titleWidth=860,maxTitleHeight=Math.min(360,span*.29);
  let titleSize=108;
  while(titleSize>52&&lines(ctx,title,titleWidth,titleSize,700,headingFont).length*titleSize*1.16>maxTitleHeight)titleSize-=4;
  const titleHeight=lines(ctx,title,titleWidth,titleSize,700,headingFont).length*titleSize*1.16;
  let overflow=titleHeight>maxTitleHeight;
  ctx.save();ctx.textAlign="center";ctx.save();ctx.beginPath();ctx.rect(100,titleTop-8,880,maxTitleHeight+16);ctx.clip();text(ctx,title,540,titleTop,titleWidth,titleSize,700,"#FFFFFF",1.16,headingFont);ctx.restore();
  const periodTop=top+span*.77,bodyTop=titleTop+Math.min(titleHeight,maxTitleHeight)+68,bodyBottom=periodTop-64,body=draft.body||marketingPlaceholders.bodies.event;
  let bodySize=34;
  while(bodySize>24&&lines(ctx,body,820,bodySize).length*bodySize*1.6>bodyBottom-bodyTop)bodySize-=2;
  overflow=overflow||lines(ctx,body,820,bodySize).length*bodySize*1.6>bodyBottom-bodyTop;
  ctx.save();ctx.beginPath();ctx.rect(120,bodyTop,840,Math.max(0,bodyBottom-bodyTop));ctx.clip();text(ctx,body,540,bodyTop,820,bodySize,400,"#F6F2FF",1.6);ctx.restore();
  const period=[draft.date,draft.eventEnd].filter(Boolean).map(value=>value.replaceAll("-",". ")).join(" ~ ");
  if(period){ctx.font=`italic 500 28px ${font}`;ctx.fillStyle="#FFFFFF";ctx.fillText(period,540,periodTop);}
  ctx.restore();
  const brandHeight=54,brandWidth=brand?brandHeight*brand.width/brand.height:110;brandMark(ctx,brand,(1080-brandWidth)/2,bottom-82,brandHeight);
  return {overflow};
}
function noticeBoard(ctx:CanvasRenderingContext2D,draft:MarketingDraft,brand:HTMLImageElement|null,top:number,bottom:number){
  ctx.fillStyle=blue;ctx.fillRect(0,0,1080,top+bottom);
  const paperTop=top+54,paperBottom=bottom-18;
  ctx.save();ctx.shadowColor="#00000025";ctx.shadowBlur=26;ctx.shadowOffsetY=12;ctx.fillStyle="#ffffff";ctx.beginPath();ctx.roundRect(72,paperTop,936,paperBottom-paperTop,14);ctx.fill();ctx.restore();
  brandMark(ctx,brand,126,paperTop+56,60);ctx.font=`600 22px ${font}`;ctx.fillStyle=blue;ctx.textAlign="right";ctx.fillText("NOTICE",954,paperTop+73);ctx.textAlign="left";
  const title=draft.title||marketingPlaceholders.titles.notice;
  let size=68;while(size>48&&lines(ctx,title,828,size,700,headingFont).length*size*1.2>270)size-=4;
  const end=text(ctx,title,126,paperTop+180,828,size,700,blue,1.2,headingFont);rule(ctx,126,end+36,828,"#D8DEE7");
  const overflow=paragraph(ctx,draft.body||marketingPlaceholders.bodies.notice,126,end+82,828,paperBottom-126,32,1.85);
  rule(ctx,126,paperBottom-100,828,"#D8DEE7");text(ctx,draft.date.replaceAll("-",". "),126,paperBottom-65,828,23,500,muted);
  ctx.fillStyle="#D8DEE7";ctx.strokeStyle="#B6C1D0";ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(410,paperTop-28,260,62,14);ctx.fill();ctx.stroke();ctx.fillStyle="#ffffff";ctx.beginPath();ctx.roundRect(460,paperTop-16,160,21,10);ctx.fill();
  return {overflow};
}
function updateSheet(ctx:CanvasRenderingContext2D,draft:MarketingDraft,brand:HTMLImageElement|null,top:number,bottom:number){
  const paperTop=top+10,paperBottom=bottom,left=64,paperWidth=952,fold=120,accent="#6373EE";
  ctx.fillStyle=accent;ctx.fillRect(0,0,1080,top+bottom);
  ctx.save();ctx.strokeStyle="#314BB866";ctx.lineWidth=2;ctx.setLineDash([3,11]);
  for(let x=88;x<1080;x+=180){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,top+bottom);ctx.stroke();}
  for(let y=88;y<top+bottom;y+=180)rule(ctx,0,y,1080,"#314BB866");
  ctx.restore();
  ctx.beginPath();ctx.moveTo(left,paperTop);ctx.lineTo(left+paperWidth,paperTop);ctx.lineTo(left+paperWidth,paperBottom);ctx.lineTo(left+fold,paperBottom);ctx.lineTo(left,paperBottom-fold);ctx.closePath();
  ctx.save();ctx.shadowColor="#15235555";ctx.shadowBlur=34;ctx.shadowOffsetX=16;ctx.shadowOffsetY=18;ctx.fillStyle="#ffffff";ctx.fill();ctx.restore();
  const paper=ctx.createLinearGradient(0,paperTop,0,paperBottom);paper.addColorStop(0,"#FAFAFA");paper.addColorStop(.24,"#FFFFFF");paper.addColorStop(.92,"#FFFFFF");paper.addColorStop(1,"#F0F0F0");
  ctx.fillStyle=paper;ctx.fill();

  const title=draft.title||marketingPlaceholders.titles.update,titleTop=paperTop+64,titleWidth=800,maxTitleHeight=280;
  let titleSize=108;
  while(titleSize>52&&lines(ctx,title,titleWidth,titleSize,700,headingFont).length*titleSize*1.14>maxTitleHeight)titleSize-=4;
  const titleRows=lines(ctx,title,titleWidth,titleSize,700,headingFont),titleHeight=titleRows.length*titleSize*1.14;
  let overflow=titleHeight>maxTitleHeight;
  const heroHeight=Math.min(titleHeight,maxTitleHeight),lastRow=titleRows[Math.min(titleRows.length-1,Math.floor(maxTitleHeight/(titleSize*1.14))-1)]??"";
  const underlineWidth=Math.min(titleWidth+20,ctx.measureText(lastRow).width+42),underlineY=titleTop+heroHeight-20;
  ctx.fillStyle="#9EA7FA";ctx.beginPath();ctx.moveTo(540-underlineWidth/2,underlineY);ctx.lineTo(540+underlineWidth/2,underlineY-5);ctx.lineTo(540+underlineWidth/2-5,underlineY+29);ctx.lineTo(540-underlineWidth/2-4,underlineY+34);ctx.closePath();ctx.fill();
  ctx.save();ctx.beginPath();ctx.rect(128,titleTop-8,824,maxTitleHeight+16);ctx.clip();ctx.textAlign="center";ctx.lineWidth=7;ctx.lineJoin="round";ctx.strokeStyle="#FFFFFF";ctx.fillStyle=ink;
  titleRows.forEach((row,index)=>{const y=titleTop+index*titleSize*1.14+ctx.measureText(row).actualBoundingBoxAscent;ctx.strokeText(row,540,y);ctx.fillText(row,540,y);});ctx.restore();

  const bodyTop=titleTop+heroHeight+80,bodyBottom=paperBottom-170,contentWidth=704,available=bodyBottom-bodyTop;
  const features=draft.features.filter(item=>item.title.trim()||item.description.trim());
  const items=features.length?features:[{title:marketingPlaceholders.featureTitle,description:marketingPlaceholders.featureDescription}];
  let size=36;
  const heights=()=>items.map(item=>Math.max(132,lines(ctx,item.title||marketingPlaceholders.featureTitle,contentWidth,size,700).length*size*1.35+(item.description?lines(ctx,item.description,contentWidth,size-2).length*(size-2)*1.6+12:0)+48));
  while(size>28&&heights().reduce((sum,value)=>sum+value,0)>available)size-=2;
  const measured=heights(),total=measured.reduce((sum,value)=>sum+value,0),extra=Math.max(0,Math.min(56,(available-total)/items.length));
  overflow=overflow||total>available;
  let y=bodyTop;
  ctx.save();ctx.beginPath();ctx.rect(124,bodyTop,832,Math.max(0,available));ctx.clip();
  items.forEach((item,index)=>{
    if(index){ctx.save();ctx.setLineDash([2,7]);rule(ctx,132,y,816,"#C9C9D1");ctx.restore();}
    const rowTop=y+24;
    ctx.beginPath();ctx.arc(165,rowTop+23,24,0,Math.PI*2);ctx.fillStyle=blue;ctx.fill();
    ctx.save();ctx.textAlign="left";ctx.textBaseline="alphabetic";ctx.font=`500 23px ${font}`;ctx.fillStyle="#FFFFFF";
    const number=String(index+1).padStart(2,"0"),bounds=ctx.measureText(number);
    ctx.fillText(number,165+(bounds.actualBoundingBoxLeft-bounds.actualBoundingBoxRight)/2,rowTop+23+(bounds.actualBoundingBoxAscent-bounds.actualBoundingBoxDescent)/2);ctx.restore();
    let end=text(ctx,item.title||marketingPlaceholders.featureTitle,230,rowTop,contentWidth,size,700,blue,1.35);
    if(item.description)end=text(ctx,item.description,230,end+12,contentWidth,size-2,400,"#444444",1.6);
    y=Math.max(y+measured[index]+extra,end+24);
  });ctx.restore();

  if(draft.memo.trim()){
    let memoSize=24;while(memoSize>18&&lines(ctx,draft.memo,266,memoSize,600).length>3)memoSize-=2;
    const memoRows=lines(ctx,draft.memo,266,memoSize,600),memoHeight=Math.max(58,Math.min(3,memoRows.length)*memoSize*1.3+22);
    overflow=overflow||memoRows.length>3;
    ctx.save();ctx.translate(878,paperBottom-117);ctx.rotate(-.13);ctx.shadowColor="#36301728";ctx.shadowBlur=8;ctx.shadowOffsetY=6;ctx.fillStyle="#FFE58A";ctx.fillRect(-150,-memoHeight/2,310,memoHeight);ctx.shadowColor="transparent";
    ctx.fillStyle="#766332";ctx.fillRect(-137,-memoHeight/2,4,memoHeight);ctx.beginPath();ctx.rect(-123,-memoHeight/2,266,memoHeight);ctx.clip();ctx.textAlign="center";ctx.textBaseline="alphabetic";
    const memoLeading=memoSize*1.3,bounds=memoRows.map((row,index)=>{const metrics=ctx.measureText(row);return {top:index*memoLeading-metrics.actualBoundingBoxAscent,bottom:index*memoLeading+metrics.actualBoundingBoxDescent};});
    const baseline=-(Math.min(...bounds.map(row=>row.top))+Math.max(...bounds.map(row=>row.bottom)))/2;
    memoRows.forEach((row,index)=>ctx.fillText(row,10,baseline+index*memoLeading));ctx.restore();
  }
  ctx.save();ctx.beginPath();ctx.moveTo(left,paperBottom-fold);ctx.lineTo(left+fold,paperBottom-fold);ctx.lineTo(left+fold,paperBottom);ctx.closePath();
  const flap=ctx.createLinearGradient(left,paperBottom-fold,left+fold,paperBottom);flap.addColorStop(0,"#FFFFFF");flap.addColorStop(.5,"#E8EBF0");flap.addColorStop(1,"#CDD2DC");
  ctx.fillStyle=flap;ctx.shadowColor="#15235533";ctx.shadowBlur=14;ctx.shadowOffsetX=5;ctx.shadowOffsetY=-5;ctx.fill();ctx.restore();
  const brandHeight=52,brandWidth=brand?brandHeight*brand.width/brand.height:110;
  brandMark(ctx,brand,(1080-brandWidth)/2,paperBottom-83,brandHeight);
  return {overflow};
}
export async function paintMarketingImage(canvas:HTMLCanvasElement,draft:MarketingDraft,pixelWidth=1080){
  await document.fonts.ready;
  const sample="KICKON 업데이트 직관 인증 0123456789";
  await Promise.all([document.fonts.load(`700 84px ${font}`,sample),document.fonts.load(`500 34px ${font}`,sample),document.fonts.load(`400 28px ${font}`,sample),document.fonts.load(`700 84px ${headingFont}`,sample)]);
  const brand=await logo(draft.kind==="event"),ctx=canvas.getContext("2d");if(!ctx)throw new Error("이미지 미리보기를 그리지 못했어요");
  const height=draft.format==="story"?1920:1350,top=draft.format==="story"?208:52,bottom=height-top;
  canvas.width=pixelWidth;canvas.height=Math.round(height*pixelWidth/1080);ctx.setTransform(pixelWidth/1080,0,0,pixelWidth/1080,0,0);ctx.textBaseline="top";ctx.fillStyle="#ffffff";ctx.fillRect(0,0,1080,height);
  if(draft.kind==="event")return eventPoster(ctx,draft,brand,top,bottom);
  if(draft.kind==='notice'&&draft.matchday)return paintMatchday(ctx,draft,brand,height);
  if(draft.kind==="notice")return noticeBoard(ctx,draft,brand,top,bottom);
  return updateSheet(ctx,draft,brand,top,bottom);
}
