import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { loginHandler, logoutHandler, meHandler } from "./routes/auth";
import {
  createUserHandler,
  deleteUserHandler,
  listUsersHandler,
  updateUserHandler,
} from "./routes/users";
import {
  adminCreateUser,
  adminDeleteUser,
  adminListUsers,
  adminUpdateUser,
} from "./routes/admin-users";
import {
  accountingSnapshotHandler,
  approveTransactionHandler,
  createInventoryItemHandler,
  createProjectCostHandler,
  createProjectHandler,
  createProjectSaleHandler,
  createTransactionHandler,
  deleteInventoryItemHandler,
  deleteProjectHandler,
  deleteTransactionHandler,
  getProjectDetailsHandler,
  getProjectHandler,
  recordInventoryIssueHandler,
  recordInventoryReceiptHandler,
  payInstallmentHandler,
} from "./routes/accounting";
import { initializeMysql } from "./lib/mysql";

export function createServer() {
  const app = express();

  void initializeMysql();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health
  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });
  app.get("/api/demo", handleDemo);

  // Auth
  app.post("/api/auth/login", loginHandler);
  app.get("/api/auth/me", meHandler);
  app.post("/api/auth/logout", logoutHandler);

  // Users (legacy in-memory)
  app.get("/api/users", listUsersHandler);
  app.post("/api/users", createUserHandler);
  app.put("/api/users/:id", updateUserHandler);
  app.delete("/api/users/:id", deleteUserHandler);

  // Users (admin)
  app.get("/api/admin/users", adminListUsers);
  app.post("/api/admin/users", adminCreateUser);
  app.put("/api/admin/users/:id", adminUpdateUser);
  app.delete("/api/admin/users/:id", adminDeleteUser);

  // Accounting
  app.get("/api/accounting/snapshot", accountingSnapshotHandler);
  app.post("/api/accounting/transactions", createTransactionHandler);
  app.post(
    "/api/accounting/transactions/:id/approve",
    approveTransactionHandler,
  );
  app.delete("/api/accounting/transactions/:id", deleteTransactionHandler);
  app.post("/api/accounting/inventory/items", createInventoryItemHandler);
  app.delete("/api/accounting/inventory/items/:id", deleteInventoryItemHandler);
  app.post("/api/accounting/inventory/receipt", recordInventoryReceiptHandler);
  app.post("/api/accounting/inventory/issue", recordInventoryIssueHandler);
  app.post("/api/accounting/projects", createProjectHandler);
  app.get("/api/accounting/projects/:id", getProjectHandler);
  app.get("/api/accounting/projects/:id/details", getProjectDetailsHandler);
  app.delete("/api/accounting/projects/:id", deleteProjectHandler);
  app.post("/api/accounting/projects/:id/costs", createProjectCostHandler);
  app.post("/api/accounting/projects/:id/sales", createProjectSaleHandler);
  app.post("/api/accounting/installments/:id/pay", payInstallmentHandler);

  return app;
}
