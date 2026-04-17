import { create } from 'zustand';

interface AuthState {
  token: string | null;
  user: any | null;
  tokenExpiresAt: string | null;
  setAuth: (token: string, user: any, tokenExpiresAt?: string) => void;
  clearAuth: () => void;
  isTokenExpired: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  tokenExpiresAt: localStorage.getItem('tokenExpiresAt') || null,

  setAuth: (token, user, tokenExpiresAt) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    if (tokenExpiresAt) localStorage.setItem('tokenExpiresAt', tokenExpiresAt);
    set({ token, user, tokenExpiresAt: tokenExpiresAt || null });
  },

  clearAuth: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('tokenExpiresAt');
    set({ token: null, user: null, tokenExpiresAt: null });
  },

  isTokenExpired: () => {
    const expiresAt = get().tokenExpiresAt;
    if (!expiresAt) return false; // no expiry stored — assume valid (backwards compat)
    return new Date(expiresAt) < new Date();
  },
}));

// ── API Fetch Wrapper ──────────────────────────────────────────────────────
// In production (behind Nginx), VITE_API_URL is unset → falls back to /api
// In local dev, Vite proxy intercepts /api → http://localhost:5000
const API_URL = import.meta.env.VITE_API_URL || '/api';

export const fetchApi = async (endpoint: string, options: RequestInit = {}) => {
  const { token, isTokenExpired, clearAuth } = useAuthStore.getState();

  // Proactively reject if token is already expired — no round-trip needed
  if (token && isTokenExpired()) {
    clearAuth();
    window.location.href = '/login';
    throw new Error('Session expired. Please log in again.');
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Server-side expiry (token tampered, clock skew, etc.)
  if (response.status === 401) {
    clearAuth();
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'API Error');
  }

  return response.json();
};

/** Call on logout — notifies backend, then clears local state */
export const logoutAndClear = async () => {
  try {
    await fetchApi('/auth/logout', { method: 'POST' });
  } catch {
    // swallow — we clear locally regardless
  } finally {
    useAuthStore.getState().clearAuth();
  }
};
