import { NextResponse } from "next/server";

export async function GET() {
  return new NextResponse("google-site-verification: google107dba79dc7c8ea9.html", {
    headers: { "Content-Type": "text/html" },
  });
}
