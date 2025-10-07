import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { hash } from "bcryptjs";

const MYSQL_HOST = process.env.MYSQL_HOST;
const MYSQL_PORT = Number(process.env.MYSQL_PORT ?? "3306");
const MYSQL_DATABASE = process.env.MYSQL_DATABASE;
const MYSQL_USER = process.env.MYSQL_USER;
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD ?? undefined;

let pool: mysql.Pool | null = null;
let initializationPromise: Promise<boolean> | null = null;

function hasMysqlConfig() {
  return Boolean(MYSQL_HOST && MYSQL_DATABASE && MYSQL_USER);
}

export function getMysqlPool() {
  if (!hasMysqlConfig()) return null;
  if (!pool) {
    pool = mysql.createPool({
      host: MYSQL_HOST,
      port: MYSQL_PORT,
      database: MYSQL_DATABASE,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
      charset: "utf8mb4_general_ci",
    });
  }
  return pool;
}

async function ensureSchema(pool: mysql.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id CHAR(36) NOT NULL PRIMARY KEY,
      username VARCHAR(191) NOT NULL UNIQUE,
      name VARCHAR(191) NOT NULL,
      email VARCHAR(191) NOT NULL,
      role ENUM('manager','accountant','employee') NOT NULL DEFAULT 'employee',
      active TINYINT(1) NOT NULL DEFAULT 1,
      password_hash VARCHAR(191) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token CHAR(36) NOT NULL PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function seedManager(pool: mysql.Pool) {
  const [rows] = await pool.query<{ id: string }[]>
    ("SELECT id FROM users WHERE username = ? LIMIT 1", ["root"]);
  if (Array.isArray(rows) && rows.length > 0) return;

  const id = crypto.randomUUID();
  const passwordHash = await hash("password123", 10);
  await pool.query(
    `INSERT INTO users (id, username, name, email, role, active, password_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      "root",
      "Manager",
      "admin@example.com",
      "manager",
      1,
      passwordHash,
    ],
  );
}

export async function initializeMysql() {
  if (!hasMysqlConfig()) return false;
  if (!initializationPromise) {
    initializationPromise = (async () => {
      try {
        const currentPool = getMysqlPool();
        if (!currentPool) return false;
        await ensureSchema(currentPool);
        await seedManager(currentPool);
        return true;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("[mysql] initialization failed", error);
        return false;
      }
    })();
  }
  return initializationPromise;
}
