import { connection } from "next/server";
import { loadFeed } from "@/lib/feed";

export async function GET() {
  await connection(); // at request time, never prerendered
  return Response.json(await loadFeed(), { headers: { "Cache-Control": "no-store" } });
}
