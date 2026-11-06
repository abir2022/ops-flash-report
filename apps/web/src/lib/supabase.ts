import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { demoClient } from "./demo/demoClient";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// When the Supabase env vars are present the app talks to the real backend and
// DEMO_MODE is false. When they are absent (e.g. a zero-env Vercel preview) the
// app boots into DEMO_MODE: an in-memory supabase-js shim backed by synthetic
// NexaGroup fixtures (see lib/demo/), so every tab renders without a backend.
export const DEMO_MODE = !url || !anonKey;

export const supabase: SupabaseClient = DEMO_MODE
  ? demoClient
  : createClient(url as string, anonKey as string);
