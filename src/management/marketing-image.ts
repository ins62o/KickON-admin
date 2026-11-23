import {isMatchdayDraft,type MarketingDraft} from "./marketing-drafts";
import {paintMatchday} from './marketing-matchday-image';
const font='"Inter", "Pretendard Variable", sans-serif';
const headingFont='"Elice Digital Baeum", "Pretendard Variable", sans-serif';
let logoPromise:Promise<HTMLImageElement|null>|null=null;
function logo(){
  return logoPromise??=new Promise<HTMLImageElement|null>(resolve=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>resolve(null);image.src="/branding/kickon-logo.svg";});
}
export async function paintMarketingImage(canvas:HTMLCanvasElement,draft:MarketingDraft,pixelWidth=1080){
  if(!isMatchdayDraft(draft))throw new Error("매치데이 초안만 이미지로 만들 수 있어요");
  await document.fonts.ready;
  // Hangul is split across font files by unicode-range, so load the files for every character the image will draw.
  const sample="KICKON MATCH DAY K LEAGUE 경기를 불러와 주세요 0123456789"+JSON.stringify(draft);
  await Promise.all([document.fonts.load(`700 84px ${font}`,sample),document.fonts.load(`500 34px ${font}`,sample),document.fonts.load(`400 28px ${font}`,sample),document.fonts.load(`700 84px ${headingFont}`,sample)]);
  const brand=await logo(),ctx=canvas.getContext("2d");if(!ctx)throw new Error("이미지 미리보기를 그리지 못했어요");
  const height=draft.format==="story"?1920:1350;
  canvas.width=pixelWidth;canvas.height=Math.round(height*pixelWidth/1080);ctx.setTransform(pixelWidth/1080,0,0,pixelWidth/1080,0,0);ctx.textBaseline="top";ctx.fillStyle="#ffffff";ctx.fillRect(0,0,1080,height);
  return paintMatchday(ctx,draft,brand,height);
}
