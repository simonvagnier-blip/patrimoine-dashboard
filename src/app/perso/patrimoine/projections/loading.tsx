export default function Loading() {
  return (
    <main className="min-h-screen bg-[#080c14] p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-8 w-20 bg-gray-800 rounded" />
          <div className="h-8 w-36 bg-gray-800 rounded" />
        </div>
        <div className="bg-[#0d1117] border border-gray-800 rounded-lg p-6">
          <div className="flex gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-9 w-24 bg-gray-800 rounded" />
            ))}
          </div>
        </div>
        <div className="bg-[#0d1117] border border-gray-800 rounded-lg p-6">
          <div className="h-5 w-48 bg-gray-800 rounded mb-4" />
          <div className="h-[400px] bg-gray-800/30 rounded" />
        </div>
      </div>
    </main>
  );
}
