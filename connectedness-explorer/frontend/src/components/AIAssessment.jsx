export default function AIAssessment({ loading, result }) {
  if (!loading && !result) return null

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-serif text-lg text-white">AI Assessment</h3>
        {result?.score != null && (
          <span className="px-3 py-1 rounded-full text-sm font-semibold bg-blue-900/40 text-blue-300 border border-blue-700">
            {result.score}/10
          </span>
        )}
      </div>

      {loading && !result && (
        <div className="text-slate-400 text-sm animate-pulse">
          Generating economic assessment…
        </div>
      )}

      {result?.assessment && (
        <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
          {result.assessment}
        </p>
      )}
    </div>
  )
}
