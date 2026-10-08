import { useEffect, useRef, useState } from "react";
import { renderSignIn, signOut, useSession } from "../lib/auth";

// Nav control: Google's button when signed out, the email + sign out when in.
export function SignIn() {
  const session = useSession();
  const ref = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    if (session || !ref.current) return;
    renderSignIn(ref.current).then(setAvailable).catch(() => setAvailable(false));
  }, [session]);

  if (session) {
    return (
      <span className="ml-auto flex items-center gap-2 text-xs text-gray-400">
        <span title="Signed in for admin actions (uploads, refreshes)">{session.email}</span>
        <button onClick={signOut} className="text-gray-500 hover:text-gray-300 underline-offset-2 hover:underline">
          Sign out
        </button>
      </span>
    );
  }
  if (!available) return null; // Google sign-in not configured on the API
  return <div ref={ref} className="ml-auto" />;
}
