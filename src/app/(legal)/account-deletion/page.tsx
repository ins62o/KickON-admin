import type { Metadata } from "next";
import Link from "next/link";
import { LegalNotice, LegalPage, type LegalSection } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "계정 삭제 요청",
  description: "KICKON 계정과 연결된 데이터를 삭제하는 방법과 삭제 범위를 안내합니다.",
};

const effectiveDate = "2026년 9월 4일";

function getSections(supportEmail: string): LegalSection[] {
  const emailSubject = encodeURIComponent("KICKON 계정 삭제 요청");

  return [
  {
    id: "in-app",
    title: "앱에서 직접 삭제하기",
    content: (
      <>
        <p>KICKON에 로그인할 수 있다면 앱에서 계정을 바로 삭제할 수 있습니다.</p>
        <ol className="ml-5 list-decimal space-y-2">
          <li>KICKON 앱에서 <strong>마이페이지</strong>를 엽니다.</li>
          <li><strong>설정</strong>으로 이동합니다.</li>
          <li>고객 지원 영역의 <strong>계정 탈퇴</strong>를 선택합니다.</li>
          <li>삭제 범위를 확인한 뒤 <strong>탈퇴</strong>를 선택합니다.</li>
        </ol>
        <p>요청이 완료되면 현재 기기에서 로그아웃되고 계정은 복구할 수 없습니다.</p>
      </>
    ),
  },
  {
    id: "web-request",
    title: "앱을 이용할 수 없는 경우",
    content: (
      <>
        <p>
          앱을 삭제했거나 로그인할 수 없다면 KICKON 개발자 연락처인 <a href={`mailto:${supportEmail}?subject=${emailSubject}`}>{supportEmail}</a>로 아래 정보를 보내 주세요.
        </p>
        <ul>
          <li>제목: KICKON 계정 삭제 요청</li>
          <li>가입에 사용한 로그인 방식: Apple 또는 Kakao</li>
          <li>가입 계정의 이메일 주소</li>
          <li>KICKON 닉네임</li>
        </ul>
        <p>계정 보호를 위해 추가 본인 확인을 요청할 수 있습니다. 비밀번호, 인증번호, 소셜 로그인 토큰은 보내지 마세요.</p>
      </>
    ),
  },
  {
    id: "deleted-data",
    title: "삭제되는 데이터",
    content: (
      <ul>
        <li>로그인 계정과 프로필, 닉네임, 응원 팀, 동의 기록</li>
        <li>게시글, 댓글, 좋아요, 조회 기록과 업로드한 사진 또는 영상</li>
        <li>직관 인증 위치와 직관 기록</li>
        <li>알림 설정, 푸시 토큰과 알림 기록</li>
        <li>차단, 신고, 1:1 문의 등 계정에 연결된 활동 정보</li>
      </ul>
    ),
  },
  {
    id: "retained-data",
    title: "삭제 후 보관되는 정보",
    content: (
      <>
        <p>탈퇴 후 7일 동안 동일한 소셜 계정의 재가입을 제한하기 위해 로그인 식별자를 단방향 변환한 해시만 보관합니다. 해시에서는 원래 소셜 식별자나 이메일 주소를 복원할 수 없습니다.</p>
        <p>7일이 지나면 이 해시도 삭제합니다. 관계 법령에 따라 별도 보관이 필요한 정보가 생기면 해당 항목과 기간을 <Link href="/privacy">개인정보 처리방침</Link>에 공개합니다.</p>
      </>
    ),
  },
  {
    id: "timeline",
    title: "처리 시점과 확인",
    content: (
      <>
        <p>앱에서 직접 탈퇴하면 요청과 함께 계정 삭제가 진행됩니다. 외부 연락처로 요청한 경우에는 본인 확인을 마친 뒤 지체 없이 처리하고 완료 사실을 안내합니다.</p>
        <p>처리가 끝난 계정과 데이터는 복구할 수 없습니다. 필요한 콘텐츠가 있다면 삭제 전에 기기에 별도로 보관해 주세요.</p>
      </>
    ),
  },
  {
    id: "social-account",
    title: "소셜 계정과의 관계",
    content: (
      <p>KICKON 계정을 삭제해도 Apple 계정이나 Kakao 계정 자체는 삭제되지 않습니다. 소셜 로그인 연결 상태는 각 서비스의 계정 설정에서도 별도로 확인하고 해제할 수 있습니다.</p>
    ),
  },
  ];
}

export default function AccountDeletionPage() {
  const supportEmail = process.env.KICKON_SUPPORT_EMAIL?.trim() || "kickon.offical@gmail.com";
  return (
    <LegalPage
      title="계정 삭제 요청"
      description="KICKON 계정과 연결된 개인정보 및 활동 데이터를 삭제하는 방법과 처리 범위를 안내합니다."
      effectiveDate={effectiveDate}
      sections={getSections(supportEmail)}
      aside={<LegalNotice><strong>삭제 전 확인:</strong> 계정 삭제는 취소할 수 없으며, 게시글과 직관 기록을 포함한 활동 데이터도 복구할 수 없습니다.</LegalNotice>}
    />
  );
}
