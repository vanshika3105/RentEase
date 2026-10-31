import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { firebaseAuth, firebaseConfigured } from "../firebase.js";

const AuthContext = createContext(null);
const PORTALS = new Set(["admin", "owner", "tenant"]);

function authErrorMessage(error) {
  if (error?.code === "auth/popup-closed-by-user") return "Google sign-in was cancelled.";
  if (error?.code === "auth/popup-blocked") return "Your browser blocked the Google sign-in popup. Allow popups and try again.";
  if (error?.code === "auth/unauthorized-domain") return "Add localhost to the authorized domains in Firebase Authentication settings.";
  return error?.message || "Google sign-in failed. Please try again.";
}

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [selectedPortal, setSelectedPortalState] = useState(() => {
    const saved = window.sessionStorage.getItem("rentease.portal");
    return PORTALS.has(saved) ? saved : null;
  });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const setSelectedPortal = useCallback((portal) => {
    if (!PORTALS.has(portal)) throw new Error("Select a valid RentEase portal.");
    window.sessionStorage.setItem("rentease.portal", portal);
    setSelectedPortalState(portal);
  }, []);

  useEffect(() => {
    if (!firebaseAuth) {
      setReady(true);
      return undefined;
    }
    return onAuthStateChanged(
      firebaseAuth,
      (nextUser) => {
        setUser(nextUser);
        setError("");
        setReady(true);
      },
      (authError) => {
        setError(authErrorMessage(authError));
        setReady(true);
      }
    );
  }, []);

  const signInWithGoogle = useCallback(async (portal) => {
    if (!firebaseConfigured || !firebaseAuth) {
      setError("Firebase is not configured. Copy frontend/.env.example to frontend/.env.local, add your Firebase web app settings, then restart the frontend.");
      return false;
    }
    if (!PORTALS.has(portal)) {
      setError("Select a valid RentEase portal.");
      return false;
    }
    setError("");
    setSelectedPortal(portal);
    try {
      const result = await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
      setUser(result.user);
      return true;
    } catch (authError) {
      setError(authErrorMessage(authError));
      return false;
    }
  }, [setSelectedPortal]);

  const logout = useCallback(async () => {
    setError("");
    try {
      if (firebaseAuth) await signOut(firebaseAuth);
      setUser(null);
      setSelectedPortalState(null);
      window.sessionStorage.removeItem("rentease.portal");
      return true;
    } catch (authError) {
      setError(authErrorMessage(authError));
      return false;
    }
  }, []);

  const value = {
    user,
    selectedPortal,
    setSelectedPortal,
    signInWithGoogle,
    logout,
    ready,
    error,
    configured: firebaseConfigured,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}