export default function Loading() {
  return (
    <main className="min-h-screen bg-[#080c14] p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6 animate-pulse">
        <div className="h-8 w-20 bg-gray-800 rounded" />
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-gray-800 rounded" />
          <div className="h-10 w-32 bg-gray-800 rounded" />
        </div>
        <div className="bg-[#0d1117] border border-gray-800 rounded-lg p-6 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-gray-800/30 rounded" />
          ))}
        </div>
      </div>
    </main>
  );
}
