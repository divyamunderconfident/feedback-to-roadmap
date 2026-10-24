// The visitor's API keys, kept only in this browser's localStorage.
import type { Provider } from "./llm";

export const PROVIDERS: Provider[] = ["gemini", "groq"];
const storageKey = (p: Provider) => `f2r.key.${p}`;

// localStorage can be missing or blocked (private windows, blocked site data); callers must still work.
export const loadKey = (p: Provider) => {
  try {
    return localStorage.getItem(storageKey(p)) ?? "";
  } catch {
    return "";
  }
};

export const saveKey = (p: Provider, key: string) => {
  try {
    if (key) localStorage.setItem(storageKey(p), key);
    else localStorage.removeItem(storageKey(p));
  } catch {}
};
