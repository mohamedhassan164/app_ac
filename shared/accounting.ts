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
  area?: string | null;
  paymentMethod?: string | null;
}

export interface ProjectSnapshot {
  project: Project;
  costs: ProjectCost[];
  sales: ProjectSale[];
}

export interface AccountingSnapshot {
  transactions: Transaction[];
  items: InventoryItem[];
  movements: Movement[];
  projects: Project[];
  costs: ProjectCost[];
  sales: ProjectSale[];
}

export interface TransactionCreateInput {
  date: string;
  type: TransType;
  description: string;
  amount: number;
  approved: boolean;
  createdBy?: string | null;
}

export interface InventoryItemCreateInput {
  name: string;
  quantity: number;
  unit: string;
  min: number;
  updatedAt: string;
}

export interface InventoryReceiptInput {
  itemId: string;
  qty: number;
  unitPrice: number;
  supplier: string;
  date: string;
  approved: boolean;
  createdBy?: string | null;
}

export interface InventoryIssueInput {
  itemId: string;
  qty: number;
  unitPrice: number;
  project: string;
  date: string;
  approved: boolean;
  createdBy?: string | null;
}

export interface InventoryMovementResult {
  item: InventoryItem;
  movement: Movement;
  transaction: Transaction;
}

export interface ProjectCreateInput {
  name: string;
  location: string;
  floors: number;
  units: number;
  createdAt: string;
}

export interface ProjectCostCreateInput {
  projectId: string;
  projectName: string;
  type: "construction" | "operation" | "expense";
  amount: number;
  date: string;
  note: string;
  approved: boolean;
  createdBy?: string | null;
}

export interface ProjectCostCreateResult {
  cost: ProjectCost;
  transaction: Transaction;
}

export interface ProjectSaleCreateInput {
  projectId: string;
  projectName: string;
  unitNo: string;
  buyer: string;
  price: number;
  date: string;
  terms?: string | null;
  area?: string | null;
  paymentMethod?: string | null;
  approved: boolean;
  createdBy?: string | null;
}

export interface ProjectSaleCreateResult {
  sale: ProjectSale;
  transaction: Transaction;
}
