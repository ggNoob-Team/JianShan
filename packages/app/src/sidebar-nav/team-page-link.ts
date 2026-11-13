export function buildTeamPageUrl(adminUrl: string | null | undefined): string | null {
  if (!adminUrl) return null;
  try {
    const url = new URL(adminUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/team`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
