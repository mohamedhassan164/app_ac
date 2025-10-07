import crypto from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  type AccountingSnapshot,
  type InventoryIssueInput,
  type InventoryItem,
  type InventoryItemCreateInput,
  type InventoryMovementResult,
  type InventoryReceiptInput,
  type Movement,
  type Project,
  type ProjectCost,
  type ProjectCostCreateInput,
  type ProjectCostCreateResult,
  type ProjectCreateInput,
  type ProjectSale,
  type ProjectSaleCreateInput,
  type ProjectSaleCreateResult,
  type ProjectSnapshot,
  type Transaction,
  type TransactionCreateInput,
} from "@shared/accounting";
import { getInitializedMysqlPool } from "../lib/mysql";

interface TransactionRow extends RowDataPacket {
  id: string;
  date: string | Date;
  type: "revenue" | "expense";
  description: string;
  amount: number | string;
  approved: number | boolean;
  created_by: string | null;
  created_at: string | Date | null;
}

interface InventoryItemRow extends RowDataPacket {
  id: string;
  name: string;
  updated_at: string | Date | null;
  quantity: number | string;
  unit: string;
  min: number | string;
}

interface MovementRow extends RowDataPacket {
  id: string;
  item_id: string;
  kind: "in" | "out";
  qty: number | string;
  unit_price: number | string;
  total: number | string | null;
  party: string;
  date: string | Date;
  created_at: string | Date | null;
}

interface ProjectRow extends RowDataPacket {
  id: string;
  name: string;
  location: string;
  floors: number | string;
  units: number | string;
  created_at: string | Date | null;
}

interface ProjectCostRow extends RowDataPacket {
  id: string;
  project_id: string;
  type: "construction" | "operation" | "expense";
  amount: number | string;
  date: string | Date;
  note: string | null;
  created_at: string | Date | null;
}

interface ProjectSaleRow extends RowDataPacket {
  id: string;
  project_id: string;
  unit_no: string;
  buyer: string;
  price: number | string;
  date: string | Date;
  terms: string | null;
  created_at: string | Date | null;
}

const fallbackStore = {
  transactions: new Map<string, Transaction>(),
  items: new Map<string, InventoryItem>(),
  movements: new Map<string, Movement>(),
  projects: new Map<string, Project>(),
  costs: new Map<string, ProjectCost>(),
  sales: new Map<string, ProjectSale>(),
};

function asNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value instanceof Date) return Number(value);
  return 0;
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string")
    return value !== "0" && value.toLowerCase() !== "false";
  return Boolean(value);
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") {
    if (value.length >= 10) return value.slice(0, 10);
    return value;
  }
  return value.toISOString().slice(0, 10);
}

function formatTimestamp(
  value: string | Date | null | undefined,
): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.toISOString();
}

function mapTransactionRow(row: TransactionRow): Transaction {
  return {
    id: row.id,
    date: formatDate(row.date),
    type: row.type,
    description: row.description,
    amount: asNumber(row.amount),
    approved: asBoolean(row.approved),
    createdBy: row.created_by ?? null,
    createdAt: formatTimestamp(row.created_at),
  };
}

function mapInventoryItemRow(row: InventoryItemRow): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    updatedAt: formatTimestamp(row.updated_at) ?? "",
    quantity: asNumber(row.quantity),
    unit: row.unit,
    min: asNumber(row.min),
  };
}

function mapMovementRow(row: MovementRow): Movement {
  return {
    id: row.id,
    itemId: row.item_id,
    kind: row.kind,
    qty: asNumber(row.qty),
    unitPrice: asNumber(row.unit_price),
    total: asNumber(row.total ?? asNumber(row.qty) * asNumber(row.unit_price)),
    party: row.party,
    date: formatDate(row.date),
  };
}

function mapProjectRow(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    floors: asNumber(row.floors),
    units: asNumber(row.units),
    createdAt: formatTimestamp(row.created_at) ?? "",
  };
}

function mapProjectCostRow(row: ProjectCostRow): ProjectCost {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    amount: asNumber(row.amount),
    date: formatDate(row.date),
    note: row.note ?? "",
  };
}

function mapProjectSaleRow(row: ProjectSaleRow): ProjectSale {
  return {
    id: row.id,
    projectId: row.project_id,
    unitNo: row.unit_no,
    buyer: row.buyer,
    price: asNumber(row.price),
    date: formatDate(row.date),
    terms: row.terms,
  };
}

function sortByDateDesc<T extends { date: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    a.date === b.date ? 0 : a.date > b.date ? -1 : 1,
  );
}

function sortTransactions(items: Transaction[]): Transaction[] {
  return [...items].sort((a, b) => {
    if (a.date === b.date) {
      const ca = a.createdAt ?? "";
      const cb = b.createdAt ?? "";
      return ca === cb ? 0 : ca > cb ? -1 : 1;
    }
    return a.date > b.date ? -1 : 1;
  });
}

function getFallbackSnapshot(): AccountingSnapshot {
  return {
    transactions: sortTransactions(
      Array.from(fallbackStore.transactions.values()),
    ),
    items: [...fallbackStore.items.values()].sort((a, b) =>
      a.updatedAt === b.updatedAt ? 0 : a.updatedAt > b.updatedAt ? -1 : 1,
    ),
    movements: sortTransactionsFallbackMovements(
      Array.from(fallbackStore.movements.values()),
    ),
    projects: [...fallbackStore.projects.values()].sort((a, b) =>
      a.createdAt === b.createdAt ? 0 : a.createdAt > b.createdAt ? -1 : 1,
    ),
    costs: sortTransactionsFallback(Array.from(fallbackStore.costs.values())),
    sales: sortTransactionsFallback(Array.from(fallbackStore.sales.values())),
  };
}

function sortTransactionsFallback<T extends { date: string }>(items: T[]): T[] {
  return sortByDateDesc(items);
}

function sortTransactionsFallbackMovements(items: Movement[]): Movement[] {
  return [...items].sort((a, b) =>
    a.date === b.date ? 0 : a.date > b.date ? -1 : 1,
  );
}

async function insertTransactionDb(
  input: TransactionCreateInput,
  conn?: PoolConnection,
): Promise<Transaction> {
  const id = crypto.randomUUID();
  const params = [
    id,
    input.date,
    input.type,
    input.description,
    input.amount,
    input.approved ? 1 : 0,
    input.createdBy ?? null,
  ];
  if (conn) {
    await conn.query(
      `INSERT INTO transactions (id, date, type, description, amount, approved, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params,
    );
    const [rows] = await conn.query<TransactionRow[]>(
      `SELECT id, date, type, description, amount, approved, created_by, created_at
       FROM transactions WHERE id = ? LIMIT 1`,
      [id],
    );
    return mapTransactionRow(rows[0]);
  }
  const pool = await getInitializedMysqlPool();
  if (!pool) throw new Error("MySQL not configured");
  await pool.query(
    `INSERT INTO transactions (id, date, type, description, amount, approved, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params,
  );
  const [rows] = await pool.query<TransactionRow[]>(
    `SELECT id, date, type, description, amount, approved, created_by, created_at
     FROM transactions WHERE id = ? LIMIT 1`,
    [id],
  );
  return mapTransactionRow(rows[0]);
}

function createTransactionFallback(input: TransactionCreateInput): Transaction {
  const transaction: Transaction = {
    id: crypto.randomUUID(),
    date: input.date,
    type: input.type,
    description: input.description,
    amount: input.amount,
    approved: input.approved,
    createdBy: input.createdBy ?? null,
    createdAt: new Date().toISOString(),
  };
  fallbackStore.transactions.set(transaction.id, transaction);
  return transaction;
}

export async function getAccountingSnapshot(): Promise<AccountingSnapshot> {
  const pool = await getInitializedMysqlPool();
  if (!pool) {
    return getFallbackSnapshot();
  }

  const [transactionRows] = await pool.query<TransactionRow[]>(
    `SELECT id, date, type, description, amount, approved, created_by, created_at
     FROM transactions
     ORDER BY date DESC, created_at DESC`,
  );
  const [itemRows] = await pool.query<InventoryItemRow[]>(
    `SELECT id, name, quantity, unit, min, updated_at
     FROM inventory_items
     ORDER BY updated_at DESC, name ASC`,
  );
  const [movementRows] = await pool.query<MovementRow[]>(
    `SELECT id, item_id, kind, qty, unit_price, total, party, date, created_at
     FROM inventory_movements
     ORDER BY date DESC, created_at DESC`,
  );
  const [projectRows] = await pool.query<ProjectRow[]>(
    `SELECT id, name, location, floors, units, created_at
     FROM projects
     ORDER BY created_at DESC, name ASC`,
  );
  const [costRows] = await pool.query<ProjectCostRow[]>(
    `SELECT id, project_id, type, amount, date, note, created_at
     FROM project_costs
     ORDER BY date DESC, created_at DESC`,
  );
  const [saleRows] = await pool.query<ProjectSaleRow[]>(
    `SELECT id, project_id, unit_no, buyer, price, date, terms, created_at
     FROM project_sales
     ORDER BY date DESC, created_at DESC`,
  );

  return {
    transactions: transactionRows.map(mapTransactionRow),
    items: itemRows.map(mapInventoryItemRow),
    movements: movementRows.map(mapMovementRow),
    projects: projectRows.map(mapProjectRow),
    costs: costRows.map(mapProjectCostRow),
    sales: saleRows.map(mapProjectSaleRow),
  };
}

export async function createTransaction(
  input: TransactionCreateInput,
): Promise<Transaction> {
  const pool = await getInitializedMysqlPool();
  if (!pool) {
    return createTransactionFallback(input);
  }
  return insertTransactionDb(input);
}

export async function approveTransaction(id: string): Promise<Transaction> {
  const pool = await getInitializedMysqlPool();
  if (!pool) {
    const existing = fallbackStore.transactions.get(id);
    if (!existing) throw new Error("Transaction not found");
    const updated: Transaction = { ...existing, approved: true };
    fallbackStore.transactions.set(id, updated);
    return updated;
  }
  await pool.query(`UPDATE transactions SET approved = 1 WHERE id = ?`, [id]);
  const [rows] = await pool.query<TransactionRow[]>(
    `SELECT id, date, type, description, amount, approved, created_by, created_at
     FROM transactions WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!rows.length) throw new Error("Transaction not found");
  return mapTransactionRow(rows[0]);
}

export async function deleteTransaction(id: string): Promise<void> {
  const pool = await getInitializedMysqlPool();
  if (!pool) {
    if (!fallbackStore.transactions.delete(id)) {
      throw new Error("Transaction not found");
    }
    return;
  }
  await pool.query(`DELETE FROM transactions WHERE id = ?`, [id]);
}

export async function createInventoryItem(
  input: InventoryItemCreateInput,
): Promise<InventoryItem> {
  const pool = await getInitializedMysqlPool();
  if (!pool) {
    const item: InventoryItem = {
      id: crypto.randomUUID(),
      name: input.name,
      quantity: input.quantity,
      unit: input.unit,
      min: input.min,
      updatedAt: input.updatedAt,
    };
    fallbackStore.items.set(item.id, item);
    return item;
  }
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO inventory_items (id, name, quantity, unit, min, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, input.name, input.quantity, input.unit, input.min, input.updatedAt],
  );
  const [rows] = await pool.query<InventoryItemRow[]>(
    `SELECT id, name, quantity, unit, min, updated_at
     FROM inventory_items WHERE id = ? LIMIT 1`,
    [id],
  );
  return mapInventoryItemRow(rows[0]);
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const pool = await getInitializedMysqlPool();
  if (!pool) {
    fallbackStore.items.delete(id);
    for (const movement of fallbackStore.movements.values()) {
      if (movement.itemId === id) fallbackStore.movements.delete(movement.id);
    }
    return;
  }
  await pool.query(`DELETE FROM inventory_items WHERE id = ?`, [id]);
}

async function getItemRowForUpdate(
  conn: PoolConnection,
  id: string,
): Promise<InventoryItemRow> {
  const [rows] = await conn.query<InventoryItemRow[]>(
    `SELECT id, name, quantity, unit, min, updated_at FROM inventory_items WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!rows.length) throw new Error("Inventory item not found");
  return rows[0];
}

export async function recordInventoryReceipt(
  input: InventoryReceiptInput,
): Promise<InventoryMovementResult> {
  const pool = await getInitializedMysqlPool();
  if (!pool) {
    const item = fallbackStore.items.get(input.itemId);
    if (!item) throw new Error("Inventory item not found");
    const updated: InventoryItem = {
      ...item,
      quantity: item.quantity + input.qty,
      updatedAt: input.date,
    };
    fallbackStore.items.set(updated.id, updated);
    const movement: Movement = {
      id: crypto.randomUUID(),
      itemId: input.itemId,
      kind: "in",
      qty: input.qty,
      unitPrice: input.unitPrice,
      total: input.qty * input.unitPrice,
      party: input.supplier,
      date: input.date,
    };
    fallbackStore.movements.set(movement.id, movement);
    const transaction = createTransactionFallback({
      date: input.date,
      type: "expense",
      description: `شراء ${item.name} من ${input.supplier} (${input.qty} ${item.unit} × ${input.unitPrice})`,
      amount: movement.total,
      approved: input.approved,
      createdBy: input.createdBy ?? null,
    });
    return { item: updated, movement, transaction };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const base = await getItemRowForUpdate(conn, input.itemId);
    const total = input.qty * input.unitPrice;

    await conn.query(
      `UPDATE inventory_items
       SET quantity = quantity + ?, updated_at = ?
       WHERE id = ?`,
      [input.qty, input.date, input.itemId],
    );

    const updated = await getItemRowForUpdate(conn, input.itemId);
    const movementId = crypto.randomUUID();
    await conn.query(
      `INSERT INTO inventory_movements (id, item_id, kind, qty, unit_price, total, party, date)
       VALUES (?, ?, 'in', ?, ?, ?, ?, ?)`,
      [
        movementId,
        input.itemId,
        input.qty,
        input.unitPrice,
        total,
        input.supplier,
        input.date,
      ],
    );
    const [movementRows] = await conn.query<MovementRow[]>(
      `SELECT id, item_id, kind, qty, unit_price, total, party, date, created_at
       FROM inventory_movements WHERE id = ? LIMIT 1`,
      [movementId],
    );

    const transaction = await insertTransactionDb(
      {
        date: input.date,
        type: "expense",
        description: `شراء ${base.name} من ${input.supplier} (${input.qty} ${base.unit} × ${input.unitPrice})`,
        amount: total,
        approved: input.approved,
        createdBy: input.createdBy ?? null,
      },
      conn,
    );

    await conn.commit();

    return {
      item: mapInventoryItemRow(updated),
      movement: mapMovementRow(movementRows[0]),
      transaction,
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function recordInventoryIssue(
  input: InventoryIssueInput,
): Promise<InventoryMovementResult> {
  const pool = await getInitializedMysqlPool();
  if (!pool) {
    const item = fallbackStore.items.get(input.itemId);
    if (!item) throw new Error("Inventory item not found");
    const nextQuantity = Math.max(0, item.quantity - input.qty);
    const updated: InventoryItem = {
      ...item,
      quantity: nextQuantity,
      updatedAt: input.date,
    };
    fallbackStore.items.set(updated.id, updated);
    const movement: Movement = {
      id: crypto.randomUUID(),
      itemId: input.itemId,
      kind: "out",
      qty: input.qty,
      unitPrice: input.unitPrice,
      total: input.qty * input.unitPrice,
      party: input.project,
      date: input.date,
    };
    fallbackStore.movements.set(movement.id, movement);
    const transaction = createTransactionFallback({
      date: input.date,
      type: "expense",
      description: `صرف ${item.name} لمشروع ${input.project} (${input.qty} ${item.unit} × ${input.unitPrice})`,
      amount: movement.total,
      approved: input.approved,
      createdBy: input.createdBy ?? null,
    });
    return { item: updated, movement, transaction };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const base = await getItemRowForUpdate(conn, input.itemId);
    const total = input.qty * input.unitPrice;
    const currentQty = asNumber(base.quantity);
    const nextQuantity = Math.max(0, currentQty - input.qty);

    await conn.query(
      `UPDATE inventory_items
       SET quantity = ?, updated_at = ?
       WHERE id = ?`,
      [nextQuantity, input.date, input.itemId],
    );

    const updated = await getItemRowForUpdate(conn, input.itemId);
    const movementId = crypto.randomUUID();
    await conn.query(
      `INSERT INTO inventory_movements (id, item_id, kind, qty, unit_price, total, party, date)
       VALUES (?, ?, 'out', ?, ?, ?, ?, ?)`,
      [
        movementId,
        input.itemId,
        input.qty,
        input.unitPrice,
        total,
        input.project,
        input.date,
      ],
    );
    const [movementRows] = await conn.query<MovementRow[]>(
      `SELECT id, item_id, kind, qty, unit_price, total, party, date, created_at
       FROM inventory_movements WHERE id = ? LIMIT 1`,
      [movementId],
    );

    const transaction = await insertTransactionDb(
      {
        date: input.date,
        type: "expense",
        description: `صرف ${base.name} لمشروع ${input.project} (${input.qty} ${base.unit} × ${input.unitPrice})`,
        amount: total,
        approved: input.approved,
        createdBy: input.createdBy ?? null,
      },
      conn,
    );

    await conn.commit();

    return {
      item: mapInventoryItemRow(updated),
      movement: mapMovementRow(movementRows[0]),
      transaction,
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function createProject(
  input: ProjectCreateInput,
): Promise<Project> {
  const pool = await getInitializedMysqlPool();
  if (!pool) {
    const project: Project = {
      id: crypto.randomUUID(),
      name: input.name,
      location: input.location,
      floors: input.floors,
      units: input.units,
      createdAt: input.createdAt,
    };
    fallbackStore.projects.set(project.id, project);
    return project;
  }
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO projects (id, name, location, floors, units, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.location,
      input.floors,
      input.units,
      input.createdAt,
    ],
  );
  const [rows] = await pool.query<ProjectRow[]>(
    `SELECT id, name, location, floors, units, created_at
     FROM projects WHERE id = ? LIMIT 1`,
    [id],
  );
  return mapProjectRow(rows[0]);
}

export async function getProjectById(id: string): Promise<Project | null> {
  const pool = await getInitializedMysqlPool();
  if (!pool) {
    return fallbackStore.projects.get(id) ?? null;
  }
  const [rows] = await pool.query<ProjectRow[]>(
    `SELECT id, name, location, floors, units, created_at
     FROM projects WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!rows.length) return null;
  return mapProjectRow(rows[0]);
}

export async function getProjectSnapshot(
  id: string,
): Promise<ProjectSnapshot | null> {
  const project = await getProjectById(id);
  if (!project) return null;
  const pool = await getInitializedMysqlPool();
  if (!pool) {
    const costs = [...fallbackStore.costs.values()]
      .filter((c) => c.projectId === id)
      .sort((a, b) => (a.date === b.date ? 0 : a.date > b.date ? -1 : 1));
    const sales = [...fallbackStore.sales.values()]
      .filter((s) => s.projectId === id)
      .sort((a, b) => (a.date === b.date ? 0 : a.date > b.date ? -1 : 1));
    return { project, costs, sales };
  }
  const [costRows] = await pool.query<ProjectCostRow[]>(
    `SELECT id, project_id, type, amount, date, note, created_at
     FROM project_costs
     WHERE project_id = ?
     ORDER BY date DESC, created_at DESC`,
    [id],
  );
  const [saleRows] = await pool.query<ProjectSaleRow[]>(
    `SELECT id, project_id, unit_no, buyer, price, date, terms, created_at
     FROM project_sales
     WHERE project_id = ?
     ORDER BY date DESC, created_at DESC`,
    [id],
  );
  return {
    project,
    costs: costRows.map(mapProjectCostRow),
    sales: saleRows.map(mapProjectSaleRow),
  };
}

export async function deleteProject(id: string): Promise<void> {
  const pool = await getInitializedMysqlPool();
  if (!pool) {
    if (!fallbackStore.projects.delete(id)) {
      throw new Error("Project not found");
    }
    for (const cost of [...fallbackStore.costs.values()]) {
      if (cost.projectId === id) {
        fallbackStore.costs.delete(cost.id);
      }
    }
    for (const sale of [...fallbackStore.sales.values()]) {
      if (sale.projectId === id) {
        fallbackStore.sales.delete(sale.id);
      }
    }
    return;
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [projects] = await conn.query<ProjectRow[]>(
      `SELECT id FROM projects WHERE id = ? LIMIT 1`,
      [id],
    );
    if (!projects.length) {
      throw new Error("Project not found");
    }
    await conn.query(`DELETE FROM project_sales WHERE project_id = ?`, [id]);
    await conn.query(`DELETE FROM project_costs WHERE project_id = ?`, [id]);
    await conn.query(`DELETE FROM projects WHERE id = ?`, [id]);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function createProjectCost(
  input: ProjectCostCreateInput,
): Promise<ProjectCostCreateResult> {
  const pool = await getInitializedMysqlPool();
  if (!pool) {
    const cost: ProjectCost = {
      id: crypto.randomUUID(),
      projectId: input.projectId,
      type: input.type,
      amount: input.amount,
      date: input.date,
      note: input.note,
    };
    fallbackStore.costs.set(cost.id, cost);
    const transaction = createTransactionFallback({
      date: input.date,
      type: "expense",
      description: `تكلفة ${projectCostTypeLabel(input.type)} لمشروع ${input.projectName}`,
      amount: input.amount,
      approved: input.approved,
      createdBy: input.createdBy ?? null,
    });
    return { cost, transaction };
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const id = crypto.randomUUID();
    await conn.query(
      `INSERT INTO project_costs (id, project_id, type, amount, date, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.projectId,
        input.type,
        input.amount,
        input.date,
        input.note || null,
      ],
    );
    const [rows] = await conn.query<ProjectCostRow[]>(
      `SELECT id, project_id, type, amount, date, note, created_at
       FROM project_costs WHERE id = ? LIMIT 1`,
      [id],
    );
    const transaction = await insertTransactionDb(
      {
        date: input.date,
        type: "expense",
        description: `تكلفة ${projectCostTypeLabel(input.type)} لمشروع ${input.projectName}`,
        amount: input.amount,
        approved: input.approved,
        createdBy: input.createdBy ?? null,
      },
      conn,
    );
    await conn.commit();
    return { cost: mapProjectCostRow(rows[0]), transaction };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function createProjectSale(
  input: ProjectSaleCreateInput,
): Promise<ProjectSaleCreateResult> {
  const pool = await getInitializedMysqlPool();
  if (!pool) {
    const sale: ProjectSale = {
      id: crypto.randomUUID(),
      projectId: input.projectId,
      unitNo: input.unitNo,
      buyer: input.buyer,
      price: input.price,
      date: input.date,
      terms: input.terms ?? null,
    };
    fallbackStore.sales.set(sale.id, sale);
    const transaction = createTransactionFallback({
      date: input.date,
      type: "revenue",
      description: `بيع وحدة ${input.unitNo} من مشروع ${input.projectName} إلى ${input.buyer}`,
      amount: input.price,
      approved: input.approved,
      createdBy: input.createdBy ?? null,
    });
    return { sale, transaction };
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const id = crypto.randomUUID();
    await conn.query(
      `INSERT INTO project_sales (id, project_id, unit_no, buyer, price, date, terms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.projectId,
        input.unitNo,
        input.buyer,
        input.price,
        input.date,
        input.terms || null,
      ],
    );
    const [rows] = await conn.query<ProjectSaleRow[]>(
      `SELECT id, project_id, unit_no, buyer, price, date, terms, created_at
       FROM project_sales WHERE id = ? LIMIT 1`,
      [id],
    );
    const transaction = await insertTransactionDb(
      {
        date: input.date,
        type: "revenue",
        description: `بيع وحدة ${input.unitNo} من مشروع ${input.projectName} إلى ${input.buyer}`,
        amount: input.price,
        approved: input.approved,
        createdBy: input.createdBy ?? null,
      },
      conn,
    );
    await conn.commit();
    return { sale: mapProjectSaleRow(rows[0]), transaction };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

function projectCostTypeLabel(type: "construction" | "operation" | "expense") {
  if (type === "construction") return "إنشاء";
  if (type === "operation") return "تشغيل";
  return "مصروفات";
}
