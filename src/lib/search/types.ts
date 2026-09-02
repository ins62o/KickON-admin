export type GlobalSearchItemType = "user" | "inquiry" | "moderation" | "player";

export type GlobalSearchItem = {
  id: string;
  type: GlobalSearchItemType;
  label: string;
  description: string;
  keywords: string;
  href:
    | `/users/${string}`
    | `/inquiries/${string}`
    | `/moderation/${string}`
    | `/squads/${string}`;
};

export type GlobalSearchResponse = {
  items: GlobalSearchItem[];
  error: string | null;
};
