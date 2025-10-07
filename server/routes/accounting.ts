import type { RequestHandler } from "express";
import type { ApiError, User } from "@shared/api";
import {
  type AccountingSnapshot,
  type InventoryIssueInput,
  type InventoryItem,
  type InventoryItemCreateInput,
  type InventoryMovementResult,
  type InventoryReceiptInput,
  type Project,
  type ProjectCostCreateInput,
  type ProjectCostCreateResult,
  type ProjectCreateInput,
  type ProjectSaleCreateInput,
  type ProjectSaleCreateResult,
  type Transaction,
  type TransactionCreateInput,
} from "@shared/accounting";
import { extractToken } from "./auth";
import {
  approveTransaction as approveTransactionStore,
  createInventoryItem as createInventoryItemStore,
  createProject as createProjectStore,
  createProjectCost as createProjectCostStore,
  createProjectSale as createProjectSaleStore,
  createTransaction as createTransactionStore,
  deleteInventoryItem as deleteInventoryItemStore,
  deleteTransaction as deleteTransactionStore,
  getAccountingSnapshot as getAccountingSnapshotStore,
  getProjectById as getProjectByIdStore,
  recordInventoryIssue as recordInventoryIssueStore,
  recordInventoryReceipt as recordInventoryReceiptStore,
} from "../store/accounting";
import { getUserByTokenAsync } from "../store/auth";
import { parseBody } from "../utils/parse-body";

function respondError(
  res: Parameters<RequestHandler>[1],
  status: number,
  message: string,
) {
  res.status(status).json({ error: message } as ApiError);
}

async function requireAuth(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
): Promise<User | null> {
  const token = extractToken(
    req.headers.authorization,
    (req.query.token as string) || undefined,
  );
  if (!token) {
    respondError(res, 401, "Unauthorized");
    return null;
  }
  const user = await getUserByTokenAsync(token);
  if (!user || !user.active) {
    respondError(res, 401, "Unauthorized");
    return null;
  }
  return user;
}

function ensureNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

function canApprove(user: User) {
  return user.role === "manager" || user.role === "accountant";
}

export const accountingSnapshotHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const data = await getAccountingSnapshotStore();
  res.json(data as AccountingSnapshot);
};

export const createTransactionHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const body = parseBody<TransactionCreateInput>(req.body);
  if (!body.date || !body.type || !body.description) {
    respondError(res, 400, "Missing required fields");
    return;
  }
  const amount = ensureNumber(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    respondError(res, 400, "Invalid amount");
    return;
  }
  const transaction = await createTransactionStore({
    date: String(body.date),
    type: body.type === "revenue" ? "revenue" : "expense",
    description: String(body.description),
    amount,
    approved: canApprove(user) && Boolean(body.approved),
    createdBy: user.id,
  });
  res.status(201).json(transaction as Transaction);
};

export const approveTransactionHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!canApprove(user)) {
    respondError(res, 403, "Forbidden");
    return;
  }
  const id = req.params.id;
  try {
    const transaction = await approveTransactionStore(id);
    res.json(transaction as Transaction);
  } catch (error: any) {
    respondError(res, 404, error?.message || "Transaction not found");
  }
};

export const deleteTransactionHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!canApprove(user)) {
    respondError(res, 403, "Forbidden");
    return;
  }
  try {
    await deleteTransactionStore(req.params.id);
    res.status(204).end();
  } catch (error: any) {
    respondError(res, 404, error?.message || "Transaction not found");
  }
};

export const createInventoryItemHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!canApprove(user)) {
    respondError(res, 403, "Forbidden");
    return;
  }
  const body = parseBody<InventoryItemCreateInput>(req.body);
  if (!body.name || !body.unit || !body.updatedAt) {
    respondError(res, 400, "Missing required fields");
    return;
  }
  const quantity = ensureNumber(body.quantity);
  const min = ensureNumber(body.min);
  if (
    !Number.isFinite(quantity) ||
    quantity < 0 ||
    !Number.isFinite(min) ||
    min < 0
  ) {
    respondError(res, 400, "Invalid numeric values");
    return;
  }
  const item = await createInventoryItemStore({
    name: String(body.name),
    quantity,
    unit: String(body.unit),
    min,
    updatedAt: String(body.updatedAt),
  });
  res.status(201).json(item as InventoryItem);
};

export const deleteInventoryItemHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!canApprove(user)) {
    respondError(res, 403, "Forbidden");
    return;
  }
  try {
    await deleteInventoryItemStore(req.params.id);
    res.status(204).end();
  } catch (error: any) {
    respondError(res, 404, error?.message || "Inventory item not found");
  }
};

export const recordInventoryReceiptHandler: RequestHandler = async (
  req,
  res,
) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const body = parseBody<InventoryReceiptInput>(req.body);
  if (
    !body.itemId ||
    !body.qty ||
    !body.unitPrice ||
    !body.date ||
    !body.supplier
  ) {
    respondError(res, 400, "Missing required fields");
    return;
  }
  const qty = ensureNumber(body.qty);
  const unitPrice = ensureNumber(body.unitPrice);
  if (
    !Number.isFinite(qty) ||
    qty <= 0 ||
    !Number.isFinite(unitPrice) ||
    unitPrice <= 0
  ) {
    respondError(res, 400, "Invalid numeric values");
    return;
  }
  try {
    const result = await recordInventoryReceiptStore({
      itemId: String(body.itemId),
      qty,
      unitPrice,
      supplier: String(body.supplier),
      date: String(body.date),
      approved: canApprove(user) && Boolean(body.approved),
      createdBy: user.id,
    });
    res.status(201).json(result as InventoryMovementResult);
  } catch (error: any) {
    respondError(res, 400, error?.message || "Failed to record receipt");
  }
};

export const recordInventoryIssueHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const body = parseBody<InventoryIssueInput>(req.body);
  if (
    !body.itemId ||
    !body.qty ||
    !body.unitPrice ||
    !body.date ||
    !body.project
  ) {
    respondError(res, 400, "Missing required fields");
    return;
  }
  const qty = ensureNumber(body.qty);
  const unitPrice = ensureNumber(body.unitPrice);
  if (
    !Number.isFinite(qty) ||
    qty <= 0 ||
    !Number.isFinite(unitPrice) ||
    unitPrice <= 0
  ) {
    respondError(res, 400, "Invalid numeric values");
    return;
  }
  try {
    const result = await recordInventoryIssueStore({
      itemId: String(body.itemId),
      qty,
      unitPrice,
      project: String(body.project),
      date: String(body.date),
      approved: canApprove(user) && Boolean(body.approved),
      createdBy: user.id,
    });
    res.status(201).json(result as InventoryMovementResult);
  } catch (error: any) {
    respondError(res, 400, error?.message || "Failed to record issue");
  }
};

export const createProjectHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!canApprove(user)) {
    respondError(res, 403, "Forbidden");
    return;
  }
  const body = parseBody<ProjectCreateInput>(req.body);
  if (
    !body.name ||
    !body.location ||
    !body.createdAt ||
    !body.floors ||
    !body.units
  ) {
    respondError(res, 400, "Missing required fields");
    return;
  }
  const floors = ensureNumber(body.floors);
  const units = ensureNumber(body.units);
  if (
    !Number.isFinite(floors) ||
    floors <= 0 ||
    !Number.isFinite(units) ||
    units <= 0
  ) {
    respondError(res, 400, "Invalid numeric values");
    return;
  }
  const project = await createProjectStore({
    name: String(body.name),
    location: String(body.location),
    floors,
    units,
    createdAt: String(body.createdAt),
  });
  res.status(201).json(project as Project);
};

export const getProjectHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const project = await getProjectByIdStore(req.params.id);
  if (!project) {
    respondError(res, 404, "Project not found");
    return;
  }
  res.json(project as Project);
};

export const createProjectCostHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!canApprove(user)) {
    respondError(res, 403, "Forbidden");
    return;
  }
  const body = parseBody<ProjectCostCreateInput>(req.body);
  const projectId = req.params.id || body.projectId;
  if (!projectId || !body.projectName || !body.type || !body.date) {
    respondError(res, 400, "Missing required fields");
    return;
  }
  const amount = ensureNumber(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    respondError(res, 400, "Invalid amount");
    return;
  }
  try {
    const result = await createProjectCostStore({
      projectId: String(projectId),
      projectName: String(body.projectName),
      type: body.type,
      amount,
      date: String(body.date),
      note: body.note ?? "",
      approved: canApprove(user) && Boolean(body.approved),
      createdBy: user.id,
    });
    res.status(201).json(result as ProjectCostCreateResult);
  } catch (error: any) {
    respondError(res, 400, error?.message || "Failed to create cost");
  }
};

export const createProjectSaleHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!canApprove(user)) {
    respondError(res, 403, "Forbidden");
    return;
  }
  const body = parseBody<ProjectSaleCreateInput>(req.body);
  const projectId = req.params.id || body.projectId;
  if (
    !projectId ||
    !body.projectName ||
    !body.unitNo ||
    !body.buyer ||
    !body.date
  ) {
    respondError(res, 400, "Missing required fields");
    return;
  }
  const price = ensureNumber(body.price);
  if (!Number.isFinite(price) || price <= 0) {
    respondError(res, 400, "Invalid price");
    return;
  }
  try {
    const result = await createProjectSaleStore({
      projectId: String(projectId),
      projectName: String(body.projectName),
      unitNo: String(body.unitNo),
      buyer: String(body.buyer),
      price,
      date: String(body.date),
      terms: body.terms ?? null,
      approved: canApprove(user) && Boolean(body.approved),
      createdBy: user.id,
    });
    res.status(201).json(result as ProjectSaleCreateResult);
  } catch (error: any) {
    respondError(res, 400, error?.message || "Failed to create sale");
  }
};
