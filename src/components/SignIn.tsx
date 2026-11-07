import { useState } from "react";
import { authUnreachable as unreachable, signIn, signOut, useAuth } from "../lib/auth";

// Nav control: "Sign in with Google" (Firebase) when signed out, the email +
// sign out when in. Hidden when sign-in isn't configured on the API.
export function SignIn({ reloadAfter }: { reloadAfter?: boolean } = {}) {
  const { available, session } = useAuth();
  const [error, setError] = useState<string | null>(null);

  if (session) {
    return (
      <span className="ml-auto flex items-center gap-2 text-xs text-gray-400">
        <span title="Signed in for admin actions (uploads, refreshes)">{session.email}</span>
        <button onClick={() => signOut()} className="text-gray-500 hover:text-gray-300 hover:underline underline-offset-2">
          Sign out
        </button>
      </span>
    );
  }
  // Hidden only when the API says sign-in isn't configured; while it's
  // loading or unreachable the button shows (a click asks the API again).
  if (available === false && !unreachable()) return null;
  return (
    <span className="ml-auto flex items-center gap-2">
      {error && <span className="text-xs text-red-400" title={error}>sign-in failed</span>}
      <button
        onClick={() => signIn().then(() => { setError(null); if (reloadAfter) window.location.reload(); }, (e: Error) => setError(e.message))}
        className="text-xs px-3 py-1 rounded-full bg-gray-800 text-gray-200 hover:bg-gray-700"
      >
        Sign in with Google
      </button>
    </span>
  );
}
