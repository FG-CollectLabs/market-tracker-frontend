import { SignIn } from "./SignIn";
export function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 border-2 border-gray-700 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );
}

export function ErrorMsg({ msg }: { msg: string }) {
  if (/Sign in with Google/.test(msg)) {
    return (
      <div className="py-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-amber-300">This page needs you signed in.</span>
        <SignIn reloadAfter />
      </div>
    );
  }
  return <p className="text-red-400 text-sm py-4">{msg}</p>;
}

// A small inline loading loop (in a cell, a button, a status line).
export function MiniSpinner({ className = "h-3 w-3" }: { className?: string }) {
  return <span role="status" aria-label="loading" className={`inline-block shrink-0 animate-spin rounded-full border-2 border-gray-700 border-t-indigo-400 align-[-2px] ${className}`} />;
}
