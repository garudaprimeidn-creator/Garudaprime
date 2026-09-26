import { rewrite } from "@vercel/functions";

const MARKETING_HOSTS = new Set(["garudaprime.id", "www.garudaprime.id"]);

export default function middleware(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host")?.replace(/:\d+$/, "") ?? "";

  if (!MARKETING_HOSTS.has(host)) {
    return;
  }

  if (url.pathname === "/" || url.pathname === "") {
    return rewrite(new URL("/marketing/index.html", url));
  }

  return;
}

export const config = {
  matcher: ["/"],
};
