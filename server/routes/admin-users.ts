import { RequestHandler } from "express";
import { supabaseAdmin } from "../lib/supabase";
import type {
  ApiError,
  Role,
  User,
  UserCreateRequest,
  UserUpdateRequest,
  UsersListResponse,
} from "@shared/api";
import { extractToken } from "./auth";
import {
  requireManager,
  listUsers as listUsersFallback,
  createUser as createUserFallback,
  updateUser as updateUserFallback,
  deleteUser as deleteUserFallback,
} from "../store/auth";
import { parseBody } from "../utils/parse-body";

export const adminListUsers: RequestHandler = async (req, res) => {
  const token = extractToken(
    req.headers.authorization,
    (req.query.token as string) || undefined,
  );
  const manager = await requireManager(token);
  if (!manager) return res.status(403).json({ error: "Forbidden" } as ApiError);

  if (!supabaseAdmin) {
    const users = listUsersFallback();
    return res.json({ users } as UsersListResponse);
  }

  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message } as ApiError);
  const users: User[] = (data || []).map((r: any) => ({
    id: r.user_id,
    username: r.name,
    name: r.name,
    email: r.email,
    role: r.role as Role,
    active: r.active,
  }));
  res.json({ users } as UsersListResponse);
};

export const adminCreateUser: RequestHandler = async (req, res) => {
  const token = extractToken(
    req.headers.authorization,
    (req.query.token as string) || undefined,
  );
  const manager = await requireManager(token);
  if (!manager) return res.status(403).json({ error: "Forbidden" } as ApiError);

  const raw = parseBody<Partial<UserCreateRequest> & Record<string, any>>(
    req.body,
  );
  // Accept both 'email' and 'gmail' keys; trim values
  const email = String((raw as any).email ?? (raw as any).gmail ?? "").trim();
  const password = String((raw as any).password ?? "").trim();
  // Normalize role; accept Arabic labels
  const roleInput = String((raw as any).role ?? "employee");
  const roleMap: Record<string, Role> = {
    manager: "manager",
    accountant: "accountant",
    employee: "employee",
    مدير: "manager",
    محاسب: "accountant",
    موظف: "employee",
  };
  const role = (roleMap[roleInput] ?? "employee") as Role;
  const active = typeof raw.active === "boolean" ? raw.active : true;
  let name = String((raw as any).name ?? (raw as any).username ?? "").trim();
  if (!name && email) name = email.split("@")[0];
  let username = String((raw as any).username ?? "").trim();
  if (!username) username = name;

  if (!email || !password || !username) {
    const missing = [
      !email ? "email" : null,
      !password ? "password" : null,
      !username ? "username/name" : null,
    ].filter(Boolean);
    return res
      .status(400)
      .json({ error: `Missing fields: ${missing.join(", ")}` } as ApiError);
  }

  if (!supabaseAdmin) {
    const user = createUserFallback({
      username,
      name,
      email,
      role,
      password,
      active,
    });
    return res.status(201).json(user);
  }

  const { data: created, error: cErr } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (cErr || !created.user)
    return res
      .status(500)
      .json({ error: cErr?.message || "createUser failed" } as ApiError);

  const { error: iErr } = await supabaseAdmin.from("user_profiles").upsert(
    {
      user_id: created.user.id,
      name,
      email,
      role,
      active,
    },
    { onConflict: "user_id" },
  );
  if (iErr) return res.status(500).json({ error: iErr.message } as ApiError);

  const user: User = {
    id: created.user.id,
    username,
    name,
    email,
    role,
    active,
  };
  res.status(201).json(user);
};

export const adminUpdateUser: RequestHandler = async (req, res) => {
  const token = extractToken(
    req.headers.authorization,
    (req.query.token as string) || undefined,
  );
  const manager = await requireManager(token);
  if (!manager) return res.status(403).json({ error: "Forbidden" } as ApiError);

  const id = req.params.id;
  const patch = parseBody<
    UserUpdateRequest & {
      password?: string;
      email?: string;
      name?: string;
    }
  >(req.body);

  if (!supabaseAdmin) {
    const updated = updateUserFallback(id, patch as any);
    if (!updated)
      return res.status(404).json({ error: "User not found" } as ApiError);
    return res.json(updated);
  }

  if (patch.password || patch.email) {
    const { error: uErr } = await supabaseAdmin.auth.admin.updateUserById(id, {
      password: patch.password,
      email: patch.email,
    });
    if (uErr) return res.status(500).json({ error: uErr.message } as ApiError);
  }

  const update: any = {};
  if (patch.role) update.role = patch.role;
  if (typeof patch.active === "boolean") update.active = patch.active;
  if (patch.name) update.name = patch.name;
  if (patch.email) update.email = patch.email;

  if (Object.keys(update).length) {
    const { error: pErr } = await supabaseAdmin
      .from("user_profiles")
      .update(update)
      .eq("user_id", id);
    if (pErr) return res.status(500).json({ error: pErr.message } as ApiError);
  }

  const { data } = await supabaseAdmin
    .from("user_profiles")
    .select("*")
    .eq("user_id", id)
    .single();
  const user: User = {
    id,
    username: data?.name ?? "",
    name: data?.name ?? "",
    email: data?.email ?? "",
    role: data?.role,
    active: data?.active,
  };
  res.json(user);
};

export const adminDeleteUser: RequestHandler = async (req, res) => {
  const token = extractToken(
    req.headers.authorization,
    (req.query.token as string) || undefined,
  );
  const manager = await requireManager(token);
  if (!manager) return res.status(403).json({ error: "Forbidden" } as ApiError);

  const id = req.params.id;

  if (!supabaseAdmin) {
    const ok = deleteUserFallback(id);
    if (!ok)
      return res.status(404).json({ error: "User not found" } as ApiError);
    return res.status(204).end();
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (error) return res.status(500).json({ error: error.message } as ApiError);
  await supabaseAdmin.from("user_profiles").delete().eq("user_id", id);
  res.status(204).end();
};
