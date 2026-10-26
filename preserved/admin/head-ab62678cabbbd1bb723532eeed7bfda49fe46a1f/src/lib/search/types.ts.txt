export type GlobalSearchItemType = "user" | "inquiry" | "moderation" | "player";

export type GlobalSearchItem = {
  id: string;
  type: GlobalSearchItemType;
  label: string;
  description: string;
  keywords: string;
  href:
    | `/users/detail/?userId=${string}`
    | `/inquiries/detail/?inquiryId=${string}`
    | `/moderation/detail/?reportId=${string}`
    | `/squads/detail/?playerId=${string}`;
};

export type GlobalSearchResponse = {
  items: GlobalSearchItem[];
  error: string | null;
};
