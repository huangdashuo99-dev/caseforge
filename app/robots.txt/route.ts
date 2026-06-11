import { NextResponse } from "next/server";

export async function GET() {
  const body = `User-Agent: *
Allow: /
Disallow: /api/

Sitemap: https://www.caseforge.top/sitemap.xml
`;
  return new NextResponse(body, {
    headers: { "Content-Type": "text/plain" },
  });
}
