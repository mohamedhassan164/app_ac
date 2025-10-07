import { apiUrl } from "@/lib/api";
import { getToken } from "./auth";
import type {
  AccountingSnapshot,
  InventoryIssueInput,
  InventoryItem,
  InventoryItemCreateInput,
  InventoryMovementResult,
  InventoryReceiptInput,
  Project,
  ProjectCostCreateInput,
  ProjectCostCreateResult,
  ProjectCreateInput,
  ProjectSaleCreateInput,
  ProjectSaleCreateResult,
  ProjectSnapshot,
  Transaction,
  TransactionCreateInput,
} from "@shared/accounting";

function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}
    const msg =
      (json && json.error) || text || `${res.status} ${res.statusText}`;
    throw new Error(msg || "Request failed");
  }
  return (await res.json()) as T;
}

export async function loadAccountingData(): Promise<AccountingSnapshot> {
  return request<AccountingSnapshot>("/api/accounting/snapshot", {
    method: "GET",
    headers: { ...authHeaders() },
  });
}

export async function createTransaction(
  input: TransactionCreateInput,
): Promise<Transaction> {
  return request<Transaction>("/api/accounting/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
}

export async function approveTransaction(id: string): Promise<Transaction> {
  return request<Transaction>(`/api/accounting/transactions/${id}/approve`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  await request<void>(`/api/accounting/transactions/${id}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
}

export async function createInventoryItem(
  input: InventoryItemCreateInput,
): Promise<InventoryItem> {
  return request<InventoryItem>("/api/accounting/inventory/items", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
}

export async function deleteInventoryItem(id: string): Promise<void> {
  await request<void>(`/api/accounting/inventory/items/${id}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
}

export async function recordInventoryReceipt(
  input: InventoryReceiptInput,
): Promise<InventoryMovementResult> {
  return request<InventoryMovementResult>("/api/accounting/inventory/receipt", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
}

export async function recordInventoryIssue(
  input: InventoryIssueInput,
): Promise<InventoryMovementResult> {
  return request<InventoryMovementResult>("/api/accounting/inventory/issue", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
}

export async function createProject(
  input: ProjectCreateInput,
): Promise<Project> {
  return request<Project>("/api/accounting/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
}

export async function loadProjectById(id: string): Promise<Project | null> {
  try {
    return await request<Project>(`/api/accounting/projects/${id}`, {
      method: "GET",
      headers: { ...authHeaders() },
    });
  } catch {
    return null;
  }
}

export async function createProjectCost(
  input: ProjectCostCreateInput,
): Promise<ProjectCostCreateResult> {
  const projectId = input.projectId;
  return request<ProjectCostCreateResult>(
    `/api/accounting/projects/${projectId}/costs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(input),
    },
  );
}

export async function createProjectSale(
  input: ProjectSaleCreateInput,
): Promise<ProjectSaleCreateResult> {
  const projectId = input.projectId;
  return request<ProjectSaleCreateResult>(
    `/api/accounting/projects/${projectId}/sales`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(input),
    },
  );
}

export async function loadProjectSnapshot(
  id: string,
): Promise<ProjectSnapshot | null> {
  try {
    return await request<ProjectSnapshot>(
      `/api/accounting/projects/${id}/details`,
      {
        method: "GET",
        headers: { ...authHeaders() },
      },
    );
  } catch {
    return null;
  }
}

export async function deleteProject(id: string): Promise<void> {
  await request<void>(`/api/accounting/projects/${id}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
}
