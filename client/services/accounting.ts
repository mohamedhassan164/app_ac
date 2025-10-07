import { supabase } from "@/lib/supabase";
import type {
  PostgrestResponse,
  PostgrestSingleResponse,
} from "@supabase/supabase-js";

export type TransType = "revenue" | "expense";

export interface Transaction {
  id: string;
  date: string;
  type: TransType;
  description: string;
  amount: number;
  approved: boolean;
  createdBy?: string | null;
  createdAt?: string | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  updatedAt: string;
  quantity: number;
  unit: string;
  min: number;
}

export interface Movement {
  id: string;
  itemId: string;
  kind: "in" | "out";
  qty: number;
  unitPrice: number;
  total: number;
  party: string;
  date: string;
}

export interface Project {
  id: string;
  name: string;
  location: string;
  floors: number;
  units: number;
  createdAt: string;
}

export interface ProjectCost {
  id: string;
  projectId: string;
  type: "construction" | "operation" | "expense";
  amount: number;
  date: string;
  note: string;
}

export interface ProjectSale {
  id: string;
  projectId: string;
  unitNo: string;
  buyer: string;
  price: number;
  date: string;
  terms?: string | null;
}

export interface AccountingData {
  transactions: Transaction[];
  items: InventoryItem[];
  movements: Movement[];
  projects: Project[];
  costs: ProjectCost[];
  sales: ProjectSale[];
}

type TransactionRow = {
  id: string;
  date: string;
  type: TransType;
  description: string;
  amount: number;
  approved: boolean;
  created_by: string | null;
  created_at: string | null;
};

type InventoryItemRow = {
  id: string;
  name: string;
  updated_at: string | null;
  quantity: number;
  unit: string;
  min: number;
};

type MovementRow = {
  id: string;
  item_id: string;
  kind: "in" | "out";
  qty: number;
  unit_price: number;
  total: number | null;
  party: string;
  date: string;
};

type ProjectRow = {
  id: string;
  name: string;
  location: string;
  floors: number;
  units: number;
  created_at: string | null;
};

type ProjectCostRow = {
  id: string;
  project_id: string;
  type: "construction" | "operation" | "expense";
  amount: number;
  date: string;
  note: string | null;
};

type ProjectSaleRow = {
  id: string;
  project_id: string;
  unit_no: string;
  buyer: string;
  price: number;
  date: string;
  terms: string | null;
};

function asNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value);
}

async function ensureList<T>(
  promise: Promise<PostgrestResponse<T>>,
): Promise<T[]> {
  const { data, error } = await promise;
  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}

async function ensureSingle<T>(
  promise: Promise<PostgrestSingleResponse<T>>,
): Promise<T> {
  const { data, error } = await promise;
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Missing data");
  }
  return data;
}

function mapTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    date: row.date,
    type: row.type,
    description: row.description,
    amount: asNumber(row.amount),
    approved: Boolean(row.approved),
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function mapInventoryItem(row: InventoryItemRow): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    updatedAt: row.updated_at ?? "",
    quantity: asNumber(row.quantity),
    unit: row.unit,
    min: asNumber(row.min),
  };
}

function mapMovement(row: MovementRow): Movement {
  return {
    id: row.id,
    itemId: row.item_id,
    kind: row.kind,
    qty: asNumber(row.qty),
    unitPrice: asNumber(row.unit_price),
    total: asNumber(row.total ?? row.qty * row.unit_price),
    party: row.party,
    date: row.date,
  };
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    floors: asNumber(row.floors),
    units: asNumber(row.units),
    createdAt: row.created_at ?? "",
  };
}

function mapProjectCost(row: ProjectCostRow): ProjectCost {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    amount: asNumber(row.amount),
    date: row.date,
    note: row.note ?? "",
  };
}

function mapProjectSale(row: ProjectSaleRow): ProjectSale {
  return {
    id: row.id,
    projectId: row.project_id,
    unitNo: row.unit_no,
    buyer: row.buyer,
    price: asNumber(row.price),
    date: row.date,
    terms: row.terms,
  };
}

export async function loadAccountingData(): Promise<AccountingData> {
  const [transactions, items, movements, projects, costs, sales] =
    await Promise.all([
      ensureList<TransactionRow>(
        supabase
          .from("transactions")
          .select("*")
          .order("date", { ascending: false })
          .order("created_at", { ascending: false }),
      ),
      ensureList<InventoryItemRow>(
        supabase
          .from("inventory_items")
          .select("*")
          .order("updated_at", { ascending: false })
          .order("name", { ascending: true }),
      ),
      ensureList<MovementRow>(
        supabase
          .from("inventory_movements")
          .select("*")
          .order("date", { ascending: false })
          .order("created_at", { ascending: false }),
      ),
      ensureList<ProjectRow>(
        supabase
          .from("projects")
          .select("*")
          .order("created_at", { ascending: false })
          .order("name", { ascending: true }),
      ),
      ensureList<ProjectCostRow>(
        supabase
          .from("project_costs")
          .select("*")
          .order("date", { ascending: false })
          .order("created_at", { ascending: false }),
      ),
      ensureList<ProjectSaleRow>(
        supabase
          .from("project_sales")
          .select("*")
          .order("date", { ascending: false })
          .order("created_at", { ascending: false }),
      ),
    ]);

  return {
    transactions: transactions.map(mapTransaction),
    items: items.map(mapInventoryItem),
    movements: movements.map(mapMovement),
    projects: projects.map(mapProject),
    costs: costs.map(mapProjectCost),
    sales: sales.map(mapProjectSale),
  };
}

export async function createTransaction(input: {
  date: string;
  type: TransType;
  description: string;
  amount: number;
  approved: boolean;
  createdBy?: string | null;
}): Promise<Transaction> {
  const row = await ensureSingle<TransactionRow>(
    supabase
      .from("transactions")
      .insert({
        date: input.date,
        type: input.type,
        description: input.description,
        amount: input.amount,
        approved: input.approved,
        created_by: input.createdBy ?? null,
      })
      .select()
      .single(),
  );
  return mapTransaction(row);
}

export async function approveTransaction(id: string): Promise<Transaction> {
  const row = await ensureSingle<TransactionRow>(
    supabase
      .from("transactions")
      .update({ approved: true })
      .eq("id", id)
      .select()
      .single(),
  );
  return mapTransaction(row);
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function createInventoryItem(input: {
  name: string;
  quantity: number;
  unit: string;
  min: number;
  updatedAt: string;
}): Promise<InventoryItem> {
  const row = await ensureSingle<InventoryItemRow>(
    supabase
      .from("inventory_items")
      .insert({
        name: input.name,
        quantity: input.quantity,
        unit: input.unit,
        min: input.min,
        updated_at: input.updatedAt,
      })
      .select()
      .single(),
  );
  return mapInventoryItem(row);
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const { error } = await supabase
    .from("inventory_items")
    .delete()
    .eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function recordInventoryReceipt(input: {
  itemId: string;
  qty: number;
  unitPrice: number;
  supplier: string;
  date: string;
  approved: boolean;
  createdBy?: string | null;
}): Promise<{
  item: InventoryItem;
  movement: Movement;
  transaction: Transaction;
}> {
  const base = await ensureSingle<InventoryItemRow>(
    supabase
      .from("inventory_items")
      .select("*")
      .eq("id", input.itemId)
      .single(),
  );

  const total = input.qty * input.unitPrice;
  const updatedRow = await ensureSingle<InventoryItemRow>(
    supabase
      .from("inventory_items")
      .update({
        quantity: asNumber(base.quantity) + input.qty,
        updated_at: input.date,
      })
      .eq("id", input.itemId)
      .select()
      .single(),
  );

  const movementRow = await ensureSingle<MovementRow>(
    supabase
      .from("inventory_movements")
      .insert({
        item_id: input.itemId,
        kind: "in",
        qty: input.qty,
        unit_price: input.unitPrice,
        party: input.supplier,
        date: input.date,
      })
      .select()
      .single(),
  );

  const transaction = await createTransaction({
    date: input.date,
    type: "expense",
    description: `شراء ${base.name} من ${input.supplier} (${input.qty} ${base.unit} × ${input.unitPrice})`,
    amount: total,
    approved: input.approved,
    createdBy: input.createdBy ?? null,
  });

  return {
    item: mapInventoryItem(updatedRow),
    movement: mapMovement(movementRow),
    transaction,
  };
}

export async function recordInventoryIssue(input: {
  itemId: string;
  qty: number;
  unitPrice: number;
  project: string;
  date: string;
  approved: boolean;
  createdBy?: string | null;
}): Promise<{
  item: InventoryItem;
  movement: Movement;
  transaction: Transaction;
}> {
  const base = await ensureSingle<InventoryItemRow>(
    supabase
      .from("inventory_items")
      .select("*")
      .eq("id", input.itemId)
      .single(),
  );

  const total = input.qty * input.unitPrice;
  const nextQuantity = Math.max(0, asNumber(base.quantity) - input.qty);
  const updatedRow = await ensureSingle<InventoryItemRow>(
    supabase
      .from("inventory_items")
      .update({
        quantity: nextQuantity,
        updated_at: input.date,
      })
      .eq("id", input.itemId)
      .select()
      .single(),
  );

  const movementRow = await ensureSingle<MovementRow>(
    supabase
      .from("inventory_movements")
      .insert({
        item_id: input.itemId,
        kind: "out",
        qty: input.qty,
        unit_price: input.unitPrice,
        party: input.project,
        date: input.date,
      })
      .select()
      .single(),
  );

  const transaction = await createTransaction({
    date: input.date,
    type: "expense",
    description: `صرف ${base.name} لمشروع ${input.project} (${input.qty} ${base.unit} × ${input.unitPrice})`,
    amount: total,
    approved: input.approved,
    createdBy: input.createdBy ?? null,
  });

  return {
    item: mapInventoryItem(updatedRow),
    movement: mapMovement(movementRow),
    transaction,
  };
}

export async function createProject(input: {
  name: string;
  location: string;
  floors: number;
  units: number;
  createdAt: string;
}): Promise<Project> {
  const row = await ensureSingle<ProjectRow>(
    supabase
      .from("projects")
      .insert({
        name: input.name,
        location: input.location,
        floors: input.floors,
        units: input.units,
        created_at: input.createdAt,
      })
      .select()
      .single(),
  );
  return mapProject(row);
}

function projectCostTypeLabel(type: "construction" | "operation" | "expense") {
  if (type === "construction") return "إنشاء";
  if (type === "operation") return "تشغيل";
  return "مصروفات";
}

export async function createProjectCost(input: {
  projectId: string;
  projectName: string;
  type: "construction" | "operation" | "expense";
  amount: number;
  date: string;
  note: string;
  approved: boolean;
  createdBy?: string | null;
}): Promise<{
  cost: ProjectCost;
  transaction: Transaction;
}> {
  const row = await ensureSingle<ProjectCostRow>(
    supabase
      .from("project_costs")
      .insert({
        project_id: input.projectId,
        type: input.type,
        amount: input.amount,
        date: input.date,
        note: input.note || null,
      })
      .select()
      .single(),
  );

  const transaction = await createTransaction({
    date: input.date,
    type: "expense",
    description: `تكلفة ${projectCostTypeLabel(input.type)} لمشروع ${input.projectName}`,
    amount: input.amount,
    approved: input.approved,
    createdBy: input.createdBy ?? null,
  });

  return {
    cost: mapProjectCost(row),
    transaction,
  };
}

export async function createProjectSale(input: {
  projectId: string;
  projectName: string;
  unitNo: string;
  buyer: string;
  price: number;
  date: string;
  terms?: string;
  approved: boolean;
  createdBy?: string | null;
}): Promise<{
  sale: ProjectSale;
  transaction: Transaction;
}> {
  const row = await ensureSingle<ProjectSaleRow>(
    supabase
      .from("project_sales")
      .insert({
        project_id: input.projectId,
        unit_no: input.unitNo,
        buyer: input.buyer,
        price: input.price,
        date: input.date,
        terms: input.terms || null,
      })
      .select()
      .single(),
  );

  const transaction = await createTransaction({
    date: input.date,
    type: "revenue",
    description: `بيع وحدة ${input.unitNo} من مشروع ${input.projectName} إلى ${input.buyer}`,
    amount: input.price,
    approved: input.approved,
    createdBy: input.createdBy ?? null,
  });

  return {
    sale: mapProjectSale(row),
    transaction,
  };
}

export async function loadProjectById(id: string): Promise<Project | null> {
  try {
    const row = await ensureSingle<ProjectRow>(
      supabase.from("projects").select("*").eq("id", id).single(),
    );
    return mapProject(row);
  } catch (error) {
    console.error(error);
    return null;
  }
}
