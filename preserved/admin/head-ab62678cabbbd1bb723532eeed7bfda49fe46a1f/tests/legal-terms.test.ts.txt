import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const termsPage = readFileSync(new URL("../src/app/(legal)/terms/page.tsx", import.meta.url), "utf8");
const legalPage = readFileSync(new URL("../src/components/legal/legal-page.tsx", import.meta.url), "utf8");
const footer = readFileSync(new URL("../src/components/layout/site-footer.tsx", import.meta.url), "utf8");

test("이용약관은 버전과 시행일 및 최종 수정일을 공개한다", () => {
  assert.match(termsPage, /version="1\.0"/);
  assert.match(termsPage, /effectiveDate="2026년 9월 20일"/);
  assert.match(termsPage, /lastUpdatedDate="2026년 9월 20일"/);
  assert.match(legalPage, /version\?: string/);
  assert.match(legalPage, /lastUpdatedDate\?: string/);
});

test("이용약관은 요구된 15개 조항을 순서대로 제공한다", () => {
  const titles = [
    "목적",
    "용어의 정의",
    "약관의 게시 및 변경",
    "서비스 이용 및 회원가입",
    "서비스 제공",
    "위치 기반 직관 인증",
    "회원의 의무 및 금지행위",
    "게시물 및 사용자 생성 콘텐츠",
    "게시물 관리 및 이용 제한",
    "경기 및 외부 데이터",
    "서비스 변경 및 중단",
    "회원 탈퇴 및 계약 해지",
    "개인정보 보호",
    "책임 및 면책",
    "준거법 및 분쟁 해결",
  ];

  const positions = titles.map((title) => termsPage.indexOf(`title: "${title}"`));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});

test("이용약관은 실제 가입·경기·커뮤니티·직관 기능만 반영한다", () => {
  assert.match(termsPage, /Apple 또는 Kakao/);
  assert.match(termsPage, /만 14세 이상/);
  assert.match(termsPage, /경기 일정과 결과/);
  assert.match(termsPage, /리그 순위/);
  assert.match(termsPage, /선수와 라인업/);
  assert.match(termsPage, /득점/);
  assert.match(termsPage, /게시글, 댓글, 좋아요/);
  assert.match(termsPage, /응원톡/);
  assert.match(termsPage, /사진 또는 영상/);
  assert.match(termsPage, /신고/);
  assert.match(termsPage, /차단/);
});

test("위치 인증과 탈퇴 내용은 공개 개인정보 정책과 일치한다", () => {
  assert.match(termsPage, /현재 위치 확인/);
  assert.match(termsPage, /한 번/);
  assert.match(termsPage, /백그라운드에서 위치를 지속적으로 추적하지 않습니다/);
  assert.match(termsPage, /마이페이지[\s\S]*설정[\s\S]*계정 탈퇴/);
  assert.match(termsPage, /복원할 수 없는 로그인 식별자 해시/);
  assert.match(termsPage, /7일/);
  assert.match(termsPage, /href="\/privacy"/);
  assert.match(termsPage, /href="\/account-deletion"/);
});

test("현재 운영되지 않는 유료 서비스 조항은 만들지 않는다", () => {
  assert.doesNotMatch(termsPage, /구독|자동\s?갱신|환불|인앱\s?결제|유료\s?서비스/);
});

test("법적 문서 Footer는 세 안내 페이지를 모두 연결한다", () => {
  assert.match(footer, /href: "\/terms", label: "이용약관"/);
  assert.match(footer, /href: "\/privacy", label: "개인정보 처리방침"/);
  assert.match(footer, /href: "\/account-deletion", label: "계정 삭제 요청"/);
});
