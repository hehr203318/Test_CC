export default function ResultsTable({ results }) {
  const { gfevd_matrix, net_rankings, tci, diagnostics } = results
  const { rows, cols, values } = gfevd_matrix
  const N = rows.length

  // Build lookup for FROM, TO, NET
  const metaByCountry = {}
  for (const r of net_rankings) {
    metaByCountry[r.country] = r
  }

  const FROM = rows.map(c => metaByCountry[c]?.from ?? 0)
  const TO = rows.map(c => metaByCountry[c]?.to ?? 0)
  const NET = rows.map(c => metaByCountry[c]?.net ?? 0)

  const cellColor = (val, isOwn) => {
    if (isOwn) return 'bg-slate-700/60 font-bold text-slate-100'
    if (val >= diagnostics.params_per_equation) return 'text-blue-300'
    return 'text-slate-300'
  }

  const netColor = (v) => v > 0 ? 'text-red-400' : v < 0 ? 'text-blue-400' : 'text-slate-400'

  return (
    <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
        <h3 className="font-serif text-lg text-white">GFEVD Connectedness Table</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">TCI</span>
          <span className="text-xl font-semibold text-blue-400">{tci.toFixed(1)}%</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left px-3 py-2 text-slate-400 font-medium w-32">From \ To</th>
              {cols.map(c => (
                <th key={c} className="px-2 py-2 text-slate-400 font-medium text-center whitespace-nowrap">
                  {c.split(' ').slice(-1)[0]}
                </th>
              ))}
              <th className="px-3 py-2 text-slate-400 font-medium text-right">FROM</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                <td className="px-3 py-2 text-slate-300 font-medium whitespace-nowrap">{row}</td>
                {values[i].map((val, j) => (
                  <td
                    key={j}
                    className={`px-2 py-2 text-center ${cellColor(val, i === j)}`}
                  >
                    {val.toFixed(1)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right text-amber-400 font-medium">{FROM[i].toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-600">
              <td className="px-3 py-2 text-slate-400 font-medium">TO</td>
              {TO.map((v, j) => (
                <td key={j} className="px-2 py-2 text-center text-amber-400 font-medium">{v.toFixed(1)}</td>
              ))}
              <td className="px-3 py-2 text-right text-blue-400 font-semibold">{tci.toFixed(1)}</td>
            </tr>
            <tr>
              <td className="px-3 py-2 text-slate-400 font-medium">NET</td>
              {NET.map((v, j) => (
                <td key={j} className={`px-2 py-2 text-center font-semibold ${netColor(v)}`}>
                  {v > 0 ? '+' : ''}{v.toFixed(1)}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="px-6 py-3 border-t border-slate-700 flex gap-6 text-xs text-slate-500">
        <span><span className="text-slate-100 font-bold">Bold</span> = own-variance share</span>
        <span><span className="text-red-400 font-semibold">Red NET</span> = net transmitter</span>
        <span><span className="text-blue-400 font-semibold">Blue NET</span> = net receiver</span>
      </div>
    </div>
  )
}
