import { RequestHandler } from "express";
import {
  createUser,
  deleteUser,
  listUsers,
  requireManager,
  updateUser,
} from "../store/auth";
import type {
  ApiError,
  UserCreateRequest,
  UserUpdateRequest,
  UsersListResponse,
} from "@shared/api";
import { extractToken } from "./auth";
import { parseBody } from "../utils/parse-body";

export const listUsersHandler: RequestHandler = async (req, res) => {
  const token = extractToken(
    req.headers.authorization,
    (req.query.token as string) || undefined,
  );
  const manager = await requireManager(token);
  if (!manager) {
    res.status(403).json({ error: "Forbidden" } as ApiError);
    return;
  }
  res.json({ users: listUsers() } as UsersListResponse);
};

export const createUserHandler: RequestHandler = async (req, res) => {
  const token = extractToken(
    req.headers.authorization,
    (req.query.token as string) || undefined,
  );
  const manager = await requireManager(token);
  if (!manager) {
    res.status(403).json({ error: "Forbidden" } as ApiError);
    return;
  }
  const body = parseBody<UserCreateRequest>(req.body);
  if (
    !body.username ||
    !body.password ||
    !body.name ||
    !body.email ||
    !body.role
  ) {
    res.status(400).json({ error: "Missing required fields" } as ApiError);
    return;
  }
  const user = createUser(body);
  res.status(201).json(user);
};

export const updateUserHandler: RequestHandler = async (req, res) => {
  const token = extractToken(
    req.headers.authorization,
    (req.query.token as string) || undefined,
  );
  const manager = await requireManager(token);
  if (!manager) {
    res.status(403).json({ error: "Forbidden" } as ApiError);
    return;
  }
  const id = req.params.id;
  const patch = parseBody<UserUpdateRequest>(req.body);
  const updated = updateUser(id, patch);
  if (!updated) {
    res.status(404).json({ error: "User not found" } as ApiError);
    return;
  }
  res.json(updated);
};

export const deleteUserHandler: RequestHandler = async (req, res) => {
  const token = extractToken(
    req.headers.authorization,
    (req.query.token as string) || undefined,
  );
  const manager = await requireManager(token);
  if (!manager) {
    res.status(403).json({ error: "Forbidden" } as ApiError);
    return;
  }
  const id = req.params.id;
  const ok = deleteUser(id);
  if (!ok) {
    res.status(404).json({ error: "User not found" } as ApiError);
    return;
  }
  res.status(204).end();
};
