import { NextResponse } from "next/server";
import { dbListSessions, dbCreateSession } from "@/lib/db";

export async function GET() {
  const result = await dbListSessions();
  return NextResponse.json({
    sessions: result.sessions,
    database: result.source,
    warning: result.warning,
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { title?: string; model?: string; runtime?: string }
    | null;
  const title = body?.title?.trim() || "New chat";
  const model = body?.model || null;
  const runtime = body?.runtime || null;

  const result = await dbCreateSession(title, model, runtime);
  return NextResponse.json({
    id: result.session.id,
    title: result.session.title,
    model: result.session.model,
    runtime: result.session.runtime,
    createdAt: result.session.createdAt,
    database: result.source,
  });
}
