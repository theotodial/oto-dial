import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import API from "../api";

/**
 * Fixed overlay when the user is signed in but email is not verified (explicit false in DB).
 */
export default function EmailVerificationBanner() {
  const { token, user, refreshUser } = useAuth();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  if (!token || !user?.email) return null;
  if (user.isEmailVerified !== false) return null;

  const path = location.pathname || "";
  if (
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/reset-password") ||
    path.startsWith("/admin") ||
    path.startsWith("/affiliate/")
  ) {
    return null;
  }

  const handleResend = async () => {
    setBusy(true);
    setMsg("");
    const res = await API.post("/api/auth/resend-verification", {
      email: user.email,
    });
    setBusy(false);
    if (res.error) {
      setMsg(res.error);
      return;
    }
    setMsg(res.data?.message || "Verification email sent again");
  };

  const handleRecheck = async () => {
    setBusy(true);
    setMsg("");
    await refreshUser?.();
    setBusy(false);
    setMsg("Status refreshed.");
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[200] border-b border-amber-300/80 bg-amber-50 text-amber-950 shadow-md dark:border-amber-700 dark:bg-amber-950/95 dark:text-amber-50"
      role="region"
      aria-label="Email verification"
    >
      <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm font-medium pr-2">
          Please verify your email address ({user.email}). Check your inbox and spam folder for
          the link from OTODIAL.
        </p>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={busy}
            onClick={handleResend}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium disabled:opacity-50"
          >
            {busy ? "…" : "Resend email"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleRecheck}
            className="px-3 py-1.5 rounded-lg border border-amber-700/40 dark:border-amber-400/40 text-sm font-medium hover:bg-amber-100/80 dark:hover:bg-amber-900/50 disabled:opacity-50"
          >
            I’ve verified
          </button>
        </div>
      </div>
      {msg ? (
        <div className="max-w-5xl mx-auto px-4 pb-2 text-xs text-amber-800 dark:text-amber-200">
          {msg}
        </div>
      ) : null}
    </div>
  );
}
