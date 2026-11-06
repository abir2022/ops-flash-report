import { supabase } from "./supabase";

export type Role = "admin" | "employee";

export async function resolveRole(): Promise<Role> {
  const { data, error } = await supabase.rpc("ensure_profile");
  if (error) throw error;
  if (data === "admin") return "admin";
  return "employee";
}

export async function signOutAll(): Promise<void> {
  await supabase.auth.signOut();
}
