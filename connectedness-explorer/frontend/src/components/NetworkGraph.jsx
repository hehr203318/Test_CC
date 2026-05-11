import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

const SHORT = {
  'United States': 'USA',
  'United Kingdom': 'UK',
  'South Korea': 'S.Korea',
  'Hong Kong SAR': 'HK SAR',
  'Saudi Arabia': 'S.Arabia',
  'South Africa': 'S.Africa',
  'New Zealand': 'N.Zealand',
}
const shortName = name => SHORT[name] || name.split(' ').slice(0, 2).join(' ')

export default function NetworkGraph({ results }) {
  const svgRef = useRef(null)
  const hintRef = useRef(null)

  const { gfevd_matrix, net_rankings, edge_threshold } = results
  const countries = gfevd_matrix.rows
  const D = gfevd_matrix.values
  const N = countries.length

  const metaByCountry = {}
  for (const r of net_rankings) metaByCountry[r.country] = r

  useEffect(() => {
    const container = svgRef.current?.parentElement
    if (!container) return
    const W = Math.max(container.clientWidth, 600)
    const H = 650

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', W).attr('height', H).attr('class', 'network-svg rounded-xl')

    // ── Defs ──────────────────────────────────────────────────────────────
    const defs = svg.append('defs')
    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -4 8 8').attr('refX', 8).attr('refY', 0)
      .attr('markerWidth', 5).attr('markerHeight', 5).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', '#64748b')

    // ── Data ──────────────────────────────────────────────────────────────
    const simNodes = countries.map((name, i) => ({
      id: i, name,
      net: metaByCountry[name]?.net ?? 0,
      to:  metaByCountry[name]?.to  ?? 0,
      from:metaByCountry[name]?.from?? 0,
    }))

    // D[i][j] = i receives from j  →  edge direction: j → i
    // Use a lower visual threshold (half the GFEVD threshold) so sparse models still show edges.
    // Additionally guarantee each node shows its top-2 outgoing connections.
    const VIS_THRESHOLD = edge_threshold * 0.5
    const linkSet = new Map()   // key: `${source}-${target}` → value object
    const addLink = (src, tgt, val) => {
      const key = `${src}-${tgt}`
      if (!linkSet.has(key)) linkSet.set(key, { source: src, target: tgt, value: val })
    }
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++)
        if (i !== j && D[i][j] > VIS_THRESHOLD)
          addLink(j, i, D[i][j])

    // Guarantee top-2 outgoing per source node (j transmits to i with highest D[i][j])
    for (let j = 0; j < N; j++) {
      const outgoing = []
      for (let i = 0; i < N; i++)
        if (i !== j) outgoing.push({ src: j, tgt: i, val: D[i][j] })
      outgoing.sort((a, b) => b.val - a.val)
      outgoing.slice(0, 2).forEach(({ src, tgt, val }) => addLink(src, tgt, val))
    }
    const linkData = [...linkSet.values()]

    const nodeR = d => Math.max(24, Math.min(46, 18 + d.to * 0.38))

    // ── SVG layers ────────────────────────────────────────────────────────
    const gLinks   = svg.append('g')
    const gRipples = svg.append('g')
    const gPulses  = svg.append('g')
    const gNodes   = svg.append('g')

    // ── Edges ─────────────────────────────────────────────────────────────
    const linkEls = gLinks.selectAll('line')
      .data(linkData).join('line')
      .attr('stroke', '#334155')
      .attr('stroke-width', d => Math.max(1.5, d.value / 8))   // 2–9 px
      .attr('stroke-opacity', 0.75)
      .attr('marker-end', 'url(#arrow)')

    // ── Nodes ─────────────────────────────────────────────────────────────
    const nodeGroups = gNodes.selectAll('g')
      .data(simNodes).join('g')
      .attr('cursor', 'pointer')
      .call(d3.drag()
        .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y })
        .on('end',   (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null }))
      .on('click', (e, d) => triggerShock(d))
      .on('mouseover', showTip)
      .on('mouseout', () => tip.classed('hidden', true))

    // outer glow ring  (transmitter=green, receiver=red)
    nodeGroups.append('circle')
      .attr('r', d => nodeR(d) + 5)
      .attr('fill', 'none')
      .attr('stroke', d => d.net > 5 ? '#22c55e40' : d.net < -5 ? '#ef444440' : '#47556940')
      .attr('stroke-width', 4)

    // body
    nodeGroups.append('circle')
      .attr('r', nodeR)
      .attr('fill', d => d.net > 5 ? '#14291e' : d.net < -5 ? '#1e3a5f' : '#1e293b')
      .attr('stroke', d => d.net > 5 ? '#22c55e' : d.net < -5 ? '#ef4444' : '#475569')
      .attr('stroke-width', 2.5)

    // abbreviated country name
    nodeGroups.append('text')
      .attr('text-anchor', 'middle').attr('dy', '-0.15em')
      .attr('fill', '#e2e8f0').attr('font-size', 10).attr('font-weight', '600')
      .attr('font-family', 'Inter, sans-serif').attr('pointer-events', 'none')
      .text(d => shortName(d.name).split(' ')[0])

    nodeGroups.append('text')
      .attr('text-anchor', 'middle').attr('dy', '0.95em')
      .attr('fill', '#94a3b8').attr('font-size', 9)
      .attr('font-family', 'Inter, sans-serif').attr('pointer-events', 'none')
      .text(d => shortName(d.name).split(' ')[1] || '')

    // NET value below node
    nodeGroups.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', d => nodeR(d) + 15)
      .attr('fill', d => d.net > 0 ? '#4ade80' : '#f87171')
      .attr('font-size', 9).attr('font-weight', '600')
      .attr('font-family', 'Inter, sans-serif').attr('pointer-events', 'none')
      .text(d => `${d.net > 0 ? '+' : ''}${d.net.toFixed(1)}`)

    // ── Tooltip ───────────────────────────────────────────────────────────
    const tip = d3.select('body').append('div')
      .classed('fixed hidden z-50 pointer-events-none bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-xs text-slate-200 shadow-2xl', true)

    function showTip(event, d) {
      tip.classed('hidden', false)
        .html(`
          <div class="font-semibold text-white mb-1.5">${d.name}</div>
          <div class="flex gap-3">
            <span>TO <b class="text-red-400">${d.to.toFixed(1)}</b></span>
            <span>FROM <b class="text-blue-400">${d.from.toFixed(1)}</b></span>
            <span>NET <b class="${d.net > 0 ? 'text-green-400' : 'text-red-400'}">${d.net > 0 ? '+' : ''}${d.net.toFixed(1)}</b></span>
          </div>
          <div class="text-slate-500 mt-1.5">Click to simulate shock propagation</div>
        `)
        .style('left', (event.pageX + 14) + 'px')
        .style('top',  (event.pageY - 40) + 'px')
    }

    // ── Force simulation ──────────────────────────────────────────────────
    const sim = d3.forceSimulation(simNodes)
      .force('link',      d3.forceLink(linkData).id(d => d.id).distance(170).strength(0.3))
      .force('charge',    d3.forceManyBody().strength(-550))
      .force('center',    d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide().radius(d => nodeR(d) + 20))
      .force('x',         d3.forceX(W / 2).strength(0.04))
      .force('y',         d3.forceY(H / 2).strength(0.04))
      .on('tick', () => {
        // Clamp nodes within SVG bounds
        simNodes.forEach(d => {
          const r = nodeR(d) + 4
          d.x = Math.max(r, Math.min(W - r, d.x))
          d.y = Math.max(r, Math.min(H - r, d.y))
        })

        linkEls
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => {
            const r = nodeR(d.target) + 11
            const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y
            const dist = Math.hypot(dx, dy) || 1
            return d.target.x - dx / dist * r
          })
          .attr('y2', d => {
            const r = nodeR(d.target) + 11
            const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y
            const dist = Math.hypot(dx, dy) || 1
            return d.target.y - dy / dist * r
          })
        nodeGroups.attr('transform', d => `translate(${d.x},${d.y})`)
      })

    // ── Shock propagation ─────────────────────────────────────────────────
    // Each edge gets its own max-hops budget based on its GFEVD value:
    //   weakest edge above threshold → 3 hops
    //   strongest edge in the network → 9 hops
    //   others mapped linearly in between
    // Visual brightness decays with remaining life fraction, so strong edges
    // stay bright through hop 9 while weak edges dim and stop after hop 3.
    const TRAVEL_MS = 700
    const MAX_HOPS  = 9
    const MIN_GFEVD = 3
    const HOP_COLOR = hop => d3.interpolateRgb('#60a5fa', '#f472b6')(hop / MAX_HOPS)

    let maxGFEVD = 0
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++)
        if (i !== j && D[i][j] > maxGFEVD) maxGFEVD = D[i][j]
    maxGFEVD = Math.max(maxGFEVD, MIN_GFEVD + 0.1)

    // Map a GFEVD value → how many hops this edge lives (3–9)
    const edgeLife = gval =>
      Math.round(3 + 6 * Math.max(0, Math.min(1, (gval - MIN_GFEVD) / (maxGFEVD - MIN_GFEVD))))

    function triggerShock(clickedNode) {
      if (hintRef.current) hintRef.current.style.display = 'none'
      gPulses.selectAll('*').remove()
      gRipples.selectAll('*').remove()
      ripple(clickedNode, 0, '#facc15')
      runWave(0, new Set([clickedNode.id]))
    }

    // sources: Set<nodeIdx> — nodes emitting this wave
    function runWave(hop, sources) {
      if (hop >= MAX_HOPS || sources.size === 0) return

      const color   = HOP_COLOR(hop)
      const nextSet = new Set()

      sources.forEach(fromIdx => {
        const fromNode = simNodes.find(n => n.id === fromIdx)
        if (!fromNode) return

        simNodes.forEach(target => {
          if (target.id === fromIdx) return
          const gval = D[target.id][fromIdx]
          if (gval < MIN_GFEVD) return

          const life = edgeLife(gval)
          if (hop >= life) return           // this edge has exhausted its hops

          // Remaining life fraction → drives size and opacity
          const frac  = (life - hop) / life          // 1.0 at hop 0 → small near end
          const r0    = Math.max(5, 22 * frac * Math.min(1.5, gval / 16))
          const alpha = Math.max(0.28, 0.92 * frac)

          const pulse = gPulses.append('circle')
            .attr('cx', fromNode.x).attr('cy', fromNode.y)
            .attr('r', r0).attr('fill', color).attr('opacity', alpha)

          pulse.transition()
            .duration(TRAVEL_MS).ease(d3.easeCubicInOut)
            .attr('cx', target.x).attr('cy', target.y)
            .on('end', () => pulse.remove())

          nextSet.add(target.id)
        })
      })

      if (nextSet.size === 0) return

      setTimeout(() => {
        nextSet.forEach(idx => {
          const node = simNodes.find(n => n.id === idx)
          if (node) ripple(node, hop + 1, HOP_COLOR(hop + 1))
        })
        runWave(hop + 1, nextSet)
      }, TRAVEL_MS + 60)
    }

    function ripple(node, hop, color = '#60a5fa') {
      const rings  = hop <= 2 ? 3 : hop <= 5 ? 2 : 1
      const baseR  = nodeR(node)
      const spread = Math.max(10, 45 * Math.pow(0.82, hop))
      const alpha  = Math.max(0.28, 0.85 * Math.pow(0.88, hop))
      const sw     = Math.max(1, 3.5 * Math.pow(0.82, hop))

      for (let w = 0; w < rings; w++) {
        gRipples.append('circle')
          .attr('cx', node.x).attr('cy', node.y)
          .attr('r', baseR).attr('fill', 'none')
          .attr('stroke', color).attr('stroke-width', sw)
          .attr('opacity', alpha)
          .transition().duration(950).delay(w * 270)
          .attr('r', baseR + spread)
          .attr('opacity', 0)
          .remove()
      }
    }

    return () => { sim.stop(); tip.remove() }
  }, [results])

  return (
    <div className="space-y-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
        <div className="px-6 py-3 border-b border-slate-700 flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-serif text-lg text-white">Network Visualization</h3>
          <div className="flex items-center gap-5 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Net Transmitter
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Net Receiver
            </span>
          </div>
        </div>

        <div className="relative">
          <svg ref={svgRef} style={{ width: '100%', display: 'block' }} />
          {/* Click hint — hidden after first node click */}
          <div ref={hintRef} className="absolute inset-0 flex items-end justify-center pb-16 pointer-events-none">
            <div className="flex items-center gap-2 bg-slate-900/75 backdrop-blur-sm border border-blue-700/50 rounded-full px-4 py-2 text-sm text-blue-300 animate-pulse shadow-lg">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.672 1.911a1 1 0 10-1.932.518l.259.966a1 1 0 001.932-.518l-.26-.966zM2.429 4.74a1 1 0 10-.517 1.932l.966.259a1 1 0 00.517-1.932l-.966-.26zm8.814-.569a1 1 0 00-1.415-1.414l-.707.707a1 1 0 101.415 1.415l.707-.708zm-7.071 7.072l.707-.707A1 1 0 003.465 9.12l-.708.707a1 1 0 001.415 1.415zm3.2-5.171a1 1 0 00-1.3 1.3l4 10a1 1 0 001.823.075l1.38-2.759 3.018 3.02a1 1 0 001.414-1.415l-3.019-3.02 2.76-1.379a1 1 0 00-.076-1.822l-10-4z"/>
              </svg>
              Click any country node to simulate a shock
            </div>
          </div>
        </div>

        <div className="px-6 py-2 border-t border-slate-700 text-xs text-slate-500">
          Click any node to simulate a GDP shock — pulses propagate up to 9 hops, shrinking and fading with each step.
          Color shifts <span className="text-blue-400">blue</span> → <span className="text-pink-400">pink</span> as shocks travel further.
          Edge width reflects spillover intensity.
        </div>
      </div>

      {/* NET rankings bar */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <h4 className="text-sm font-medium text-slate-300 mb-3">Net Spillover Rankings</h4>
        <div className="space-y-2">
          {net_rankings.map(r => {
            const maxAbs = Math.max(...net_rankings.map(x => Math.abs(x.net)), 1)
            const pct = (Math.abs(r.net) / maxAbs) * 100
            return (
              <div key={r.country} className="flex items-center gap-3">
                <div className="w-28 text-xs text-slate-300 text-right truncate">{r.country}</div>
                <div className="flex-1 flex items-center">
                  <div className="flex-1 flex justify-end pr-1">
                    {r.net < 0 && <div className="h-3.5 rounded bg-red-600/70" style={{ width: `${pct}%` }} />}
                  </div>
                  <div className="w-px h-4 bg-slate-600" />
                  <div className="flex-1 pl-1">
                    {r.net >= 0 && <div className="h-3.5 rounded bg-green-600/70" style={{ width: `${pct}%` }} />}
                  </div>
                </div>
                <div className={`w-14 text-xs font-semibold text-right ${r.net > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {r.net > 0 ? '+' : ''}{r.net.toFixed(1)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
