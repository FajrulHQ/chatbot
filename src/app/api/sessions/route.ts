import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

type SessionRow = {
  id: string;
  title: string;
  created_at: string;
  last_message_at: string;
};

export async function GET() {
  try {
    const db = await getDb();
    const result = await db.query<SessionRow>(`
      SELECT
        s.id,
        s.title,
        s.created_at,
        COALESCE(MAX(m.created_at), s.created_at) AS last_message_at
      FROM chat_sessions s
      LEFT JOIN chat_messages m ON m.session_id = s.id
      GROUP BY s.id
      ORDER BY last_message_at DESC;
    `);
    return NextResponse.json({
      sessions: result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        createdAt: row.created_at,
        lastMessageAt: row.last_message_at,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to load sessions." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { title?: string }
    | null;
  const title = body?.title?.trim() || "New chat";
  try {
    const db = await getDb();
    const result = await db.query<{ id: string; created_at: string }>(
      `INSERT INTO chat_sessions (title) VALUES ($1) RETURNING id, created_at;`,
      [title]
    );
    const session = result.rows[0];
    return NextResponse.json({
      id: session.id,
      title,
      createdAt: session.created_at,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to create session." },
      { status: 500 }
    );
  }
}
