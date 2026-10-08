// Google sign-in for admin actions (uploads, scrape refreshes). The API
// verifies the Google ID token and checks the email against its allowlist;
// the client id comes from GET /v1/auth/config, so the build needs no config.
// The ID token (valid ~1 hour) is kept in sessionStorage for this tab only.

import { useEffect, useState } from "react";

const BASE = import.meta.env.VITE_API_URL ?? "";
const KEY = "fg:google-id-token";

export interface Session {
  token: string;
  email: string;
  expiresAt: number; // ms epoch
}

interface AuthConfig {
  google_client_id: string;
  google_enabled: boolean;
}

let configPromise: Promise<AuthConfig> | null = null;
function authConfig(): Promise<AuthConfig> {
  configPromise ??= fetch(`${BASE}/v1/auth/config`)
    .then((r) => (r.ok ? r.json() : { google_client_id: "", google_enabled: false }))
    .catch(() => ({ google_client_id: "", google_enabled: false }));
  return configPromise;
}

function decode(token: string): { email?: string; exp?: number } {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part));
  } catch {
    return {};
  }
}

export function currentSession(): Session | null {
  try {
    const token = sessionStorage.getItem(KEY);
    if (!token) return null;
    const { email, exp } = decode(token);
    if (!email || !exp || exp * 1000 < Date.now() + 30_000) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return { token, email, expiresAt: exp * 1000 };
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}

export function signOut() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked: nothing stored */
  }
  notify();
}

// Authorization header for admin endpoints (empty when signed out).
export function authHeaders(): Record<string, string> {
  const s = currentSession();
  return s ? { Authorization: `Bearer ${s.token}` } : {};
}

export function useSession(): Session | null {
  const [s, setS] = useState(currentSession);
  useEffect(() => {
    const l = () => setS(currentSession());
    listeners.add(l);
    // Re-check near expiry so the UI flips to "sign in" by itself.
    const t = setInterval(l, 60_000);
    return () => {
      listeners.delete(l);
      clearInterval(t);
    };
  }, []);
  return s;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(o: { client_id: string; callback: (r: { credential: string }) => void; auto_select?: boolean }): void;
          renderButton(el: HTMLElement, o: Record<string, unknown>): void;
        };
      };
    };
  }
}

let gsiPromise: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  gsiPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("could not load Google sign-in"));
    document.head.appendChild(s);
  });
  return gsiPromise;
}

// Renders Google's sign-in button into el. Resolves false when sign-in isn't
// configured on the API.
export async function renderSignIn(el: HTMLElement): Promise<boolean> {
  const cfg = await authConfig();
  if (!cfg.google_enabled) return false;
  await loadGsi();
  window.google!.accounts.id.initialize({
    client_id: cfg.google_client_id,
    callback: (r) => {
      try {
        sessionStorage.setItem(KEY, r.credential);
      } catch {
        /* storage blocked: sign-in lasts until reload */
      }
      notify();
    },
  });
  window.google!.accounts.id.renderButton(el, { theme: "filled_black", size: "small", text: "signin_with", shape: "pill" });
  return true;
}
