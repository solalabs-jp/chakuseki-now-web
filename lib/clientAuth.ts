/** Reads the ID token saved by /login and returns it as a fetch init object. */
export function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const token = window.localStorage.getItem("authToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem("authToken"));
}

/** ログイン時に保存した認証情報を破棄する。 */
export function clearAuth(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("authToken");
  window.localStorage.removeItem("authUser");
}
