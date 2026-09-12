export const DATABASE_PAGE_SIZE = 1000;

/** Callers must order by a unique key. Advance by the returned length, since
 * PostgREST may impose a smaller server limit. Never expose a partial success. */
export async function fetchAllRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{
  data: T[] | null; error: { message: string; code?: string } | null;
}>) {
  const rows: T[] = [];
  for (;;) {
    const result = await fetchPage(rows.length, rows.length + DATABASE_PAGE_SIZE - 1);
    if (result.error) return { data: [] as T[], error: result.error };
    if (!result.data?.length) return { data: rows, error: null };
    rows.push(...result.data);
  }
}

/** Keep PostgREST URLs below proxy limits without dropping IDs. */
export async function fetchRowsForIds<T>(ids: string[], fetchPage: (ids: string[], from: number, to: number) => PromiseLike<{
  data: T[] | null; error: { message: string; code?: string } | null;
}>) {
  const uniqueIds = [...new Set(ids)];
  const rows: T[] = [];
  for (let start = 0; start < uniqueIds.length; start += 100) {
    const batch = uniqueIds.slice(start, start + 100);
    const result = await fetchAllRows((from, to) => fetchPage(batch, from, to));
    if (result.error) return { data: [] as T[], error: result.error };
    rows.push(...result.data);
  }
  return { data: rows, error: null };
}
