import type { NextRequest } from "next/server";
import { loadFeed } from "@/lib/feed";
import type { Range } from "@/lib/types";

export async function GET(request: NextRequest) {
  const asked = request.nextUrl.searchParams.get("range");
  const range: Range = asked === "24h" || asked === "30d" ? asked : "7d";
  return Response.json(await loadFeed(range), { headers: { "Cache-Control": "no-store" } });
}
