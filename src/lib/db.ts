import { Pool } from "pg";

let pool: Pool | null = null;
let initialized = false;

const getPool = () => {
  if (!pool) {
    pool = new Pool({
      host: process.env.PGHOST,
      port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
    });
  }
  return pool;
};

const initSchema = async (poolInstance: Pool) => {
  if (initialized) return;
  await poolInstance.query(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await poolInstance.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id BIGSERIAL PRIMARY KEY,
      session_id BIGINT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await poolInstance.query(`
    CREATE INDEX IF NOT EXISTS chat_messages_session_id_idx
    ON chat_messages(session_id, created_at);
  `);
  initialized = true;
};

export const getDb = async () => {
  const poolInstance = getPool();
  await initSchema(poolInstance);
  return poolInstance;
};
