export function safeNextPath(value: FormDataEntryValue | null, basePath = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? "") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return "/";
  const path = basePath && (value === basePath || value.startsWith(`${basePath}/`)) ? value.slice(basePath.length) || "/" : value;
  return path.startsWith("//") ? "/" : path;
}
