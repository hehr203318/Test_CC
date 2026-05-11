import { useState, useEffect } from 'react'

const STEPS = [
  'Estimating Elastic-Net VAR…',
  'Running Post-Selection OLS…',
  'Computing GFEVD at horizon H=10…',
  'Building connectedness network…',
]

export default function LoadingAnimation() {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setStep(s => (s + 1) % STEPS.length), 1800)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-6">
      <div className="flex gap-2">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="pulse-dot w-3 h-3 rounded-full bg-blue-500"
            style={{ animation: `pulse-dot 1.4s ease-in-out infinite ${i * 0.2}s` }}
          />
        ))}
      </div>
      <p className="text-slate-400 text-sm tracking-wide">{STEPS[step]}</p>
      <div className="flex gap-2">
        {STEPS.map((_, i) => (
          <div key={i} className={`h-1 w-16 rounded-full transition-colors duration-500 ${i <= step ? 'bg-blue-500' : 'bg-slate-700'}`} />
        ))}
      </div>
    </div>
  )
}
