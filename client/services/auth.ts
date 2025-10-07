import type {
  AuthLoginRequest,
  AuthLoginResponse,
  AuthMeResponse,
  User,
} from "@shared/api";
import { apiUrl } from "@/lib/api";

const AUTH_KEY = "auth_token";

export function getToken() {
  return localStorage.getItem(AUTH_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(AUTH_KEY, token);
  else localStorage.removeItem(AUTH_KEY);
}

export async function login(
  input: AuthLoginRequest,
): Promise<AuthLoginResponse> {
  const { supabase } = await import("@/lib/supabase");
  let data: any, error: any;
  try {
    const res = await supabase.auth.signInWithPassword({
      email: input.username,
      password: input.password,
    });
    data = res.data;
    error = res.error;
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg.includes("body stream already read")) {
      throw new Error("Invalid email or password");
    }
    throw e;
  }
  if (error || !data?.session || !data.user) {
    throw new Error(error?.message || "Invalid email or password");
  }
  const token = data.session.access_token;
  setToken(token);
  const uid = data.user.id;
  const { data: profile, error: pErr } = await supabase
    .from("user_profiles")
    .select("user_id,name,email,role,active")
    .eq("user_id", uid)
    .single();
  if (pErr || !profile) throw new Error(pErr?.message || "Profile not found");
  const user: User = {
    id: profile.user_id,
    username: profile.name,
    name: profile.name,
    email: profile.email,
    role: profile.role as any,
    active: Boolean(profile.active),
  };
  return { token, user } as AuthLoginResponse;
}

export async function me(): Promise<User | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch(
      apiUrl(`/api/auth/me?token=${encodeURIComponent(token)}`),
    );
    if (!res.ok) return null;
    let json: any = null;
    try {
      const text = await res.text();
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return (json as AuthMeResponse | null)?.user ?? null;
  } catch {
    return null;
  }
}

export async function logout() {
  const token = getToken();
  try {
    const { supabase } = await import("@/lib/supabase");
    await supabase.auth.signOut();
  } catch {}
  try {
    if (token) {
      await fetch(
        apiUrl(`/api/auth/logout?token=${encodeURIComponent(token)}`),
        { method: "POST" },
      );
    }
  } catch {}
  setToken(null);
}
