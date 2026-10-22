import { NextResponse } from "next/server";
import { dbGetMessages, dbDeleteSession } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  if (!sessionId) {
    return NextResponse.json({ error: "Invalid session id." }, { status: 400 });
  }

  const result = await dbGetMessages(sessionId);
  return NextResponse.json({
    messages: result.messages,
    database: result.source,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  if (!sessionId) {
    return NextResponse.json({ error: "Invalid session id." }, { status: 400 });
  }

  const ok = await dbDeleteSession(sessionId);
  return NextResponse.json({ ok });
}
