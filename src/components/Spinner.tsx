export function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 border-2 border-gray-700 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );
}

export function ErrorMsg({ msg }: { msg: string }) {
  return <p className="text-red-400 text-sm py-4">{msg}</p>;
}
