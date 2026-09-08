import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as authApi from "../api/auth";

/**
 * Real authentication state for the app.
 *
 * Ported from feature/mentorme-login-page (client/src/context/AuthContext.jsx),
 * unchanged except for importing the trimmed `../api/auth` module.
 *
 * NOTE ON SCOPE: this provider powers the login / sign-up screen and holds the
 * logged-in user + session. It is deliberately kept SEPARATE from
 * `auth/useCurrentUser.js` (the demo-persona hook that mentor discovery,
 * scheduling and the post-meeting flow run on). Bridging a real session into
 * `useCurrentUser()` is a follow-up: real accounts have no seeded MentorProfile
 * / requests, so switching those screens onto live identity now would leave
 * them empty. See the integration report.
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");

  const refreshUser = useCallback(async () => {
    try {
      const nextUser = await authApi.getMe();
      setUser(nextUser);
      setSessionError("");
      return nextUser;
    } catch (error) {
      setUser(null);
      if (error.response?.status !== 401) {
        setSessionError(
          "Could not check your session. Please refresh and try again."
        );
      }
      return null;
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const signIn = async (payload) => {
    const nextUser = await authApi.login(payload);
    setUser(nextUser);
    setSessionError("");
    return nextUser;
  };

  const signUp = async (payload) => {
    const nextUser = await authApi.register(payload);
    setUser(nextUser);
    setSessionError("");
    return nextUser;
  };

  const signOut = async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      sessionError,
      setUser,
      refreshUser,
      signIn,
      signUp,
      signOut,
    }),
    [user, loading, sessionError, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
