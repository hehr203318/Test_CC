import { useState, useMemo } from 'react'

const REGION_ORDER = [
  'East Asia', 'Southeast Asia', 'South Asia', 'Oceania',
  'Europe', 'North America', 'Latin America', 'Middle East', 'Africa', 'Europe/Asia', 'Other',
]

export default function CountrySelector({ availableCountries, selected, onChange }) {
  const [search, setSearch] = useState('')

  const grouped = useMemo(() => {
    const filtered = availableCountries.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase())
    )
    const map = {}
    for (const c of filtered) {
      const r = c.region || 'Other'
      if (!map[r]) map[r] = []
      map[r].push(c)
    }
    return REGION_ORDER.filter(r => map[r]).map(r => ({ region: r, countries: map[r] }))
  }, [availableCountries, search])

  const toggle = (name) => {
    if (selected.includes(name)) {
      onChange(selected.filter(n => n !== name))
    } else if (selected.length < 6) {
      onChange([...selected, name])
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-serif text-lg text-white">Select 6 Countries</h2>
        <span className={`text-sm font-medium ${selected.length === 6 ? 'text-green-400' : 'text-slate-400'}`}>
          {selected.length}/6
        </span>
      </div>

      <input
        type="text"
        placeholder="Search countries…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full mb-4 px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {selected.map(name => (
            <button
              key={name}
              onClick={() => toggle(name)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
            >
              {name}
              <span className="text-blue-200 text-xs">×</span>
            </button>
          ))}
        </div>
      )}

      {/* Country grid */}
      <div className="max-h-64 overflow-y-auto space-y-3 pr-1">
        {grouped.map(({ region, countries }) => (
          <div key={region}>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1.5 pl-1">{region}</div>
            <div className="flex flex-wrap gap-1.5">
              {countries.map(c => {
                const isSelected = selected.includes(c.name)
                const isDisabled = !isSelected && selected.length >= 6
                return (
                  <button
                    key={c.name}
                    onClick={() => toggle(c.name)}
                    disabled={isDisabled}
                    title={c.name}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                      isSelected
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : isDisabled
                        ? 'bg-slate-800 border-slate-700 text-slate-600 cursor-not-allowed'
                        : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-blue-500 hover:text-blue-300'
                    }`}
                  >
                    {c.name}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {grouped.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-4">No countries match your search.</p>
        )}
      </div>
    </div>
  )
}
