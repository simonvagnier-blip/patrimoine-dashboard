export default function Loading() {
  return (
    <main className="min-h-screen bg-[#080c14] p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8 animate-pulse">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-40 bg-gray-800 rounded" />
            <div className="h-4 w-28 bg-gray-800 rounded mt-2" />
          </div>
          <div className="h-10 w-32 bg-gray-800 rounded" />
        </div>

        {/* Cards skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-[#0d1117] border border-gray-800 rounded-lg p-4 space-y-3">
              <div className="h-4 w-24 bg-gray-800 rounded" />
              <div className="h-6 w-20 bg-gray-800 rounded" />
              <div className="h-1 bg-gray-800 rounded-full" />
            </div>
          ))}
        </div>

        {/* Chart skeleton */}
        <div className="bg-[#0d1117] border border-gray-800 rounded-lg p-6">
          <div className="h-5 w-48 bg-gray-800 rounded mb-4" />
          <div className="h-[280px] bg-gray-800/30 rounded" />
        </div>
      </div>
    </main>
  );
}
