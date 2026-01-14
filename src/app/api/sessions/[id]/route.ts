import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

type MessageRow = {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  if (!/^\d+$/.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session id." }, { status: 400 });
  }
  try {
    const db = await getDb();
    const result = await db.query<MessageRow>(
      `
        SELECT id, role, content, created_at
        FROM chat_messages
        WHERE session_id = $1
        ORDER BY created_at ASC;
      `,
      [sessionId]
    );
    return NextResponse.json({
      messages: result.rows.map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to load session messages." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  if (!/^\d+$/.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session id." }, { status: 400 });
  }
  try {
    const db = await getDb();
    await db.query("DELETE FROM chat_sessions WHERE id = $1;", [sessionId]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to delete session." },
      { status: 500 }
    );
  }
}
