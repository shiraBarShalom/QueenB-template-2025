import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as usersApi from "../api/users";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");

  const refreshUser = useCallback(async () => {
    try {
      const nextUser = await usersApi.getMe();
      setUser(nextUser);
      setSessionError("");
      return nextUser;
    } catch (error) {
      setUser(null);
      if (error.response?.status !== 401) {
        setSessionError("Could not check your session. Please refresh and try again.");
      }
      return null;
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const signIn = async (payload) => {
    const nextUser = await usersApi.login(payload);
    setUser(nextUser);
    return nextUser;
  };

  const signUp = async (payload) => {
    const nextUser = await usersApi.register(payload);
    setUser(nextUser);
    return nextUser;
  };

  const signOut = async () => {
    await usersApi.logout();
    setUser(null);
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
