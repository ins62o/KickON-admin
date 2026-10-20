import test from "node:test";
import assert from "node:assert/strict";
import * as marketing from "../src/management/marketing-drafts.ts";

const legacy={id:"old",title:"기존 업데이트",items:"순위 개편|더 쉽게 확인해요\n티켓 출시|직관을 기록해요",version:"v1.2",date:"2026-10-18",format:"feed",updatedAt:"2026-10-18T10:00:00Z"};

test("existing update drafts survive migration with their titles, feature details and format",()=>{
  const drafts=marketing.parseDrafts(JSON.stringify([legacy]));
  assert.equal(drafts.length,1);
  assert.equal(drafts[0].kind,"update");
  assert.equal(drafts[0].id,"old");
  assert.equal(drafts[0].title,"기존 업데이트");
  assert.deepEqual(drafts[0].features,[{title:"순위 개편",description:"더 쉽게 확인해요"},{title:"티켓 출시",description:"직관을 기록해요"}]);
  assert.equal(drafts[0].format,"feed");
  assert.equal("version" in drafts[0],false);
  assert.equal(drafts[0].memo,"2026. 10. 18");
});

test("update memos accept text, preserve explicit empty values and survive saving",()=>{
  assert.equal(marketing.newDraft("update","2026-10-19").memo,"메모를 적어봐");
  assert.equal(marketing.newDraft("event","2026-10-19").memo,"");
  const update={...marketing.newDraft("update","2026-10-19"),title:"업데이트 소식",memo:"이번 주에 만나요",features:[{title:"새 기능",description:"설명"}]};
  assert.equal(update.date,"");
  const saved=marketing.saveDraft([],update,"memo","2026-10-19T01:00:00Z");
  assert.deepEqual(marketing.parseDrafts(JSON.stringify(saved)),saved);
  assert.equal(marketing.parseDrafts(JSON.stringify([{...legacy,memo:""}]))[0].memo,"");
  assert.deepEqual(marketing.parseDrafts(JSON.stringify([{...legacy,memo:5}])),[]);
  assert.throws(()=>marketing.validateDraft({...update,memo:"메".repeat(49)}),/메모/);
});

test("three content categories round-trip without mixing event dates or update features",()=>{
  const drafts=(["update","event","notice"] as const).map((kind,index)=>({...marketing.newDraft(kind,"2026-10-19"),id:String(index),title:kind,body:"본문 내용",features:[{title:"기능",description:"설명"}],eventEnd:"2026-10-25"}));
  assert.deepEqual(marketing.parseDrafts(JSON.stringify(drafts)),drafts);
  assert.deepEqual(marketing.parseDrafts("broken"),[]);
  assert.deepEqual(marketing.parseDrafts(JSON.stringify([{...legacy,kind:"unknown"},{...legacy,title:4}])),[]);
});

test("old event drafts still load their content and dates after removing participation text",()=>{
  const previous={...marketing.newDraft("event","2026-10-19"),id:"event",title:"가을 이벤트",body:"참여 안내",eventEnd:"2026-10-31",cta:"예전 참여 문구"};
  const [draft]=marketing.parseDrafts(JSON.stringify([previous]));
  assert.equal(draft.title,previous.title);
  assert.equal(draft.body,previous.body);
  assert.equal(draft.date,previous.date);
  assert.equal(draft.eventEnd,previous.eventEnd);
  assert.equal("cta" in draft,false);
  assert.doesNotThrow(()=>marketing.validateDraft(draft));
});

test("validation blocks empty exports, incomplete update features and reversed event dates",()=>{
  const update=marketing.newDraft("update","2026-10-19");
  assert.throws(()=>marketing.validateDraft(update),/제목/);
  update.title="업데이트 소식";
  assert.throws(()=>marketing.validateDraft(update),/업데이트/);
  update.features=[{title:"새 기능",description:"설명"}];
  assert.doesNotThrow(()=>marketing.validateDraft(update));
  const event={...marketing.newDraft("event","2026-10-19"),title:"이벤트",body:"참여 안내",eventEnd:"2026-10-18"};
  assert.throws(()=>marketing.validateDraft(event),/종료일/);
  assert.throws(()=>marketing.validateDraft({...event,eventEnd:"2026-02-30"}),/날짜/);
  assert.doesNotThrow(()=>marketing.validateDraft({...event,eventEnd:"2026-10-19"}));
  assert.throws(()=>marketing.validateDraft({...marketing.newDraft("notice","2026-10-19"),title:"안내"}),/내용/);
});

test("saving replaces only the selected draft, preserves other categories and refuses silent eviction",()=>{
  const drafts=marketing.parseDrafts(JSON.stringify([legacy]));
  const event={...marketing.newDraft("event","2026-10-19"),title:"가을 이벤트",body:"참여 안내"};
  const saved=marketing.saveDraft(drafts,event,"new","2026-10-19T01:00:00Z");
  assert.equal(saved[0].id,"new");
  assert.equal(saved[1].id,"old");
  const revised=marketing.saveDraft(saved,{...saved[0],title:"수정한 이벤트"},"unused","2026-10-19T02:00:00Z");
  assert.equal(revised.length,2);
  assert.equal(revised[0].title,"수정한 이벤트");
  assert.equal(revised[1].title,"기존 업데이트");
  const full=Array.from({length:50},(_,i)=>({...drafts[0],id:String(i)}));
  assert.throws(()=>marketing.saveDraft(full,event,"new","2026-10-19T01:00:00Z"),/50/);
  assert.equal(marketing.saveDraft(full,{...full[0],title:"수정"},"unused","2026-10-19T01:00:00Z").length,50);
});
