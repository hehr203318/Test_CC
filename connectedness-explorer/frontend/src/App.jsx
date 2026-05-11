import { useState, useEffect } from 'react'
import CountrySelector from './components/CountrySelector'
import LoadingAnimation from './components/LoadingAnimation'
import ResultsTable from './components/ResultsTable'
import NetworkGraph from './components/NetworkGraph'
import AIAssessment from './components/AIAssessment'

export default function App() {
  const [availableCountries, setAvailableCountries] = useState([])
  const [selectedCountries, setSelectedCountries] = useState([])
  const [lagOrder, setLagOrder] = useState(4)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('table')
  const [aiResult, setAiResult] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    fetch('/api/countries')
      .then(r => r.json())
      .then(d => setAvailableCountries(d.countries))
      .catch(() => setAvailableCountries([]))
  }, [])

  const handleAnalyze = async () => {
    if (selectedCountries.length !== 6) return
    setLoading(true)
    setError(null)
    setResults(null)
    setAiResult(null)

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countries: selectedCountries, lag_order: lagOrder }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Analysis failed')
      setResults(data)
      setActiveTab('table')
      fetchAiAssessment(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchAiAssessment = async (data) => {
    setAiLoading(true)
    try {
      const res = await fetch('/api/ai-assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countries: data.gfevd_matrix.rows,
          tci: data.tci,
          net_rankings: data.net_rankings,
          diagnostics: data.diagnostics,
          gfevd_matrix: data.gfevd_matrix,
        }),
      })
      if (res.ok) {
        const d = await res.json()
        setAiResult(d)
      }
    } catch (_) {}
    setAiLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="font-serif text-2xl text-white tracking-tight">
            Macroeconomic Connectedness Explorer
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Diebold-Yılmaz GFEVD Framework · Elastic-Net VAR · Boston College Econ Honors Thesis 2026
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Controls */}
        <section className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
          <CountrySelector
            availableCountries={availableCountries}
            selected={selectedCountries}
            onChange={setSelectedCountries}
          />

          <div className="flex items-center gap-6 mt-6 pt-5 border-t border-slate-700">
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-400 whitespace-nowrap">Lag Order p</label>
              <select
                value={lagOrder}
                onChange={e => setLagOrder(Number(e.target.value))}
                className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {[1, 2, 3, 4].map(n => (
                  <option key={n} value={n}>p = {n}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={selectedCountries.length !== 6 || loading}
              className="ml-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors shadow-lg shadow-blue-900/30"
            >
              {loading ? 'Analyzing…' : `Analyze ${selectedCountries.length}/6 Selected`}
            </button>
          </div>
        </section>

        {/* Loading */}
        {loading && <LoadingAnimation />}

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Results */}
        {results && !loading && (
          <section className="space-y-6">
            {/* Diagnostics bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'TCI', value: `${results.tci.toFixed(1)}%`, desc: 'Total Connectedness' },
                { label: 'Stable', value: results.diagnostics.is_stable ? '✓ Yes' : '✗ No', desc: 'VAR Stability', warn: !results.diagnostics.is_stable },
                { label: 'Sparsity', value: `${results.diagnostics.sparsity_pct}%`, desc: 'Parameters Zeroed' },
                { label: 'Sample', value: results.diagnostics.effective_sample_size, desc: 'Effective Obs' },
              ].map(({ label, value, desc, warn }) => (
                <div key={label} className={`rounded-xl p-4 border ${warn ? 'bg-orange-900/20 border-orange-700' : 'bg-slate-800 border-slate-700'}`}>
                  <div className="text-xs text-slate-400 uppercase tracking-wider">{label}</div>
                  <div className={`text-2xl font-semibold mt-1 ${warn ? 'text-orange-400' : 'text-white'}`}>{value}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-500">
              Date range: {results.available_date_range} · p={results.diagnostics.lag_order} · {results.diagnostics.total_params_selected}/{results.diagnostics.total_params_possible} params selected
            </p>

            {/* Tabs */}
            <div className="flex gap-6 border-b border-slate-700">
              {['table', 'network'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`pb-2 text-sm font-medium capitalize transition-colors ${activeTab === tab ? 'tab-active' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {tab === 'table' ? 'Connectedness Table' : 'Network Visualization'}
                </button>
              ))}
            </div>

            {activeTab === 'table' && (
              <ResultsTable results={results} />
            )}
            {activeTab === 'network' && (
              <NetworkGraph results={results} />
            )}

            <AIAssessment loading={aiLoading} result={aiResult} />
          </section>
        )}
      </main>

      <footer className="text-center text-slate-600 text-xs py-8 border-t border-slate-800 mt-12">
        Haoran He · Boston College Economics · 2026 · Powered by IMF IFS Data
      </footer>
    </div>
  )
}
