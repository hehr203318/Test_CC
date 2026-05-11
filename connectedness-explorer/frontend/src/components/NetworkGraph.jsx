import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'

const REGION_COLORS = {
  'East Asia': '#60a5fa',
  'Southeast Asia': '#34d399',
  'South Asia': '#a78bfa',
  'Oceania': '#fb923c',
  'Europe': '#f472b6',
  'North America': '#facc15',
  'Latin America': '#f87171',
  'Middle East': '#e879f9',
  'Africa': '#4ade80',
  'Europe/Asia': '#c084fc',
  'Other': '#94a3b8',
}

export default function NetworkGraph({ results }) {
  const svgRef = useRef(null)
  const [shockLog, setShockLog] = useState([])
  const [activeNode, setActiveNode] = useState(null)
  const simulationRef = useRef(null)
  const nodesRef = useRef([])

  const { gfevd_matrix, net_rankings, edge_threshold } = results
  const countries = gfevd_matrix.rows
  const D = gfevd_matrix.values
  const N = countries.length

  const metaByCountry = {}
  for (const r of net_rankings) metaByCountry[r.country] = r

  useEffect(() => {
    const container = svgRef.current?.parentElement
    if (!container) return
    const W = container.clientWidth || 700
    const H = 520

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', W).attr('height', H).attr('class', 'network-svg rounded-xl')

    // Defs: arrowhead marker
    const defs = svg.append('defs')
    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -4 8 8')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', '#475569')

    defs.append('marker')
      .attr('id', 'arrow-active')
      .attr('viewBox', '0 -4 8 8')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', '#60a5fa')

    // Nodes and links
    const nodes = countries.map((name, i) => ({
      id: i,
      name,
      region: net_rankings[0]?.country === name ? net_rankings[0] : (metaByCountry[name] || {}),
      net: metaByCountry[name]?.net ?? 0,
      to: metaByCountry[name]?.to ?? 0,
      from: metaByCountry[name]?.from ?? 0,
    }))
    nodesRef.current = nodes

    // D[i][j] = how much of i's forecast error is from j's shock → edge goes j→i
    const links = []
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (i !== j && D[i][j] > edge_threshold) {
          links.push({ source: j, target: i, value: D[i][j] })
        }
      }
    }

    const nodeRadius = d => Math.max(18, Math.min(40, 14 + d.to * 0.3))
    const nodeColor = d => {
      const r = net_rankings.find(r => r.country === d.name)
      const region = results.gfevd_matrix?.rows ? 'East Asia' : 'Other'
      // Color by region from our available data
      return d.net > 5 ? '#ef4444' : d.net < -5 ? '#3b82f6' : '#94a3b8'
    }

    // Layer groups
    const gLinks = svg.append('g').attr('class', 'links')
    const gRipples = svg.append('g').attr('class', 'ripples')
    const gPulses = svg.append('g').attr('class', 'pulses')
    const gNodes = svg.append('g').attr('class', 'nodes')

    // Draw links
    const linkEls = gLinks.selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#334155')
      .attr('stroke-width', d => Math.max(0.5, d.value / 25))
      .attr('stroke-opacity', 0.6)
      .attr('marker-end', 'url(#arrow)')

    // Draw nodes
    const nodeGroups = gNodes.selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(
        d3.drag()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x; d.fy = d.y
          })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null; d.fy = null
          })
      )
      .on('click', (event, d) => triggerShockAnimation(d, nodes, gRipples, gPulses, linkEls))
      .on('mouseover', (event, d) => showTooltip(event, d))
      .on('mouseout', hideTooltip)

    nodeGroups.append('circle')
      .attr('r', nodeRadius)
      .attr('fill', d => d.net > 5 ? '#1d4ed8' : d.net < -5 ? '#1e3a5f' : '#1e293b')
      .attr('stroke', d => d.net > 5 ? '#ef4444' : d.net < -5 ? '#3b82f6' : '#475569')
      .attr('stroke-width', 2)

    nodeGroups.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.3em')
      .attr('fill', 'white')
      .attr('font-size', d => nodeRadius(d) > 28 ? 10 : 8)
      .attr('font-family', 'Inter, sans-serif')
      .attr('pointer-events', 'none')
      .text(d => d.name.split(' ').map(w => w[0]).join('').slice(0, 3))

    // NET label below node
    nodeGroups.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', d => nodeRadius(d) + 12)
      .attr('fill', d => d.net > 0 ? '#fca5a5' : '#93c5fd')
      .attr('font-size', 9)
      .attr('font-family', 'Inter, sans-serif')
      .attr('pointer-events', 'none')
      .text(d => `${d.net > 0 ? '+' : ''}${d.net.toFixed(1)}`)

    // Tooltip div
    const tooltip = d3.select('body').append('div')
      .attr('class', 'fixed hidden z-50 pointer-events-none bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-xs text-slate-200 shadow-2xl max-w-xs')
      .style('transition', 'opacity 0.15s')

    function showTooltip(event, d) {
      tooltip
        .classed('hidden', false)
        .html(`
          <div class="font-semibold text-white mb-1">${d.name}</div>
          <div>TO: <span class="text-amber-400">${d.to.toFixed(1)}</span></div>
          <div>FROM: <span class="text-amber-400">${d.from.toFixed(1)}</span></div>
          <div>NET: <span class="${d.net > 0 ? 'text-red-400' : 'text-blue-400'} font-semibold">${d.net > 0 ? '+' : ''}${d.net.toFixed(1)}</span></div>
          <div class="text-slate-400 mt-1 text-xs">Click to simulate shock</div>
        `)
        .style('left', (event.pageX + 12) + 'px')
        .style('top', (event.pageY - 30) + 'px')
    }
    function hideTooltip() {
      tooltip.classed('hidden', true)
    }

    // Force simulation
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(130).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-350))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide().radius(d => nodeRadius(d) + 15))
      .on('tick', () => {
        linkEls
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => {
            const r = nodeRadius(d.target)
            const dx = d.target.x - d.source.x
            const dy = d.target.y - d.source.y
            const dist = Math.sqrt(dx * dx + dy * dy) || 1
            return d.target.x - (dx / dist) * (r + 10)
          })
          .attr('y2', d => {
            const r = nodeRadius(d.target)
            const dx = d.target.x - d.source.x
            const dy = d.target.y - d.source.y
            const dist = Math.sqrt(dx * dx + dy * dy) || 1
            return d.target.y - (dy / dist) * (r + 10)
          })
        nodeGroups.attr('transform', d => `translate(${d.x},${d.y})`)
      })

    simulationRef.current = simulation

    function triggerShockAnimation(sourceNode, allNodes, gRipple, gPulse, linkEls) {
      setActiveNode(sourceNode.name)
      const srcIdx = sourceNode.id
      const log = []

      // Highlight source
      gRipple.selectAll('*').remove()
      gPulse.selectAll('*').remove()

      // Flash source node
      gRipple.append('circle')
        .attr('cx', sourceNode.x).attr('cy', sourceNode.y)
        .attr('r', nodeRadius(sourceNode))
        .attr('fill', '#facc15').attr('opacity', 0.4)
        .transition().duration(400).attr('opacity', 0).remove()

      // First wave
      allNodes.forEach(target => {
        if (target.id === srcIdx) return
        // D[target][src] = how much of target's error is explained by source shock
        const strength = D[target.id][srcIdx]
        if (strength <= edge_threshold * 0.5) return

        log.push(`→ ${target.name}: ${strength.toFixed(1)}%`)

        // Animate pulse circle traveling along edge
        const pulse = gPulse.append('circle')
          .attr('r', 6)
          .attr('fill', '#60a5fa')
          .attr('opacity', Math.min(0.9, strength / 60))
          .attr('cx', sourceNode.x)
          .attr('cy', sourceNode.y)

        pulse.transition()
          .duration(900)
          .ease(d3.easeCubicInOut)
          .attr('cx', target.x)
          .attr('cy', target.y)
          .on('end', function () {
            d3.select(this).remove()
            // Ripple at target
            for (let wave = 0; wave < 3; wave++) {
              gRipple.append('circle')
                .attr('cx', target.x).attr('cy', target.y)
                .attr('r', nodeRadius(target))
                .attr('fill', 'none')
                .attr('stroke', '#60a5fa')
                .attr('stroke-width', 2)
                .attr('opacity', 0.8 * strength / 100)
                .transition()
                .duration(1200)
                .delay(wave * 300)
                .attr('r', nodeRadius(target) + 35 * Math.min(1, strength / 50))
                .attr('opacity', 0)
                .remove()
            }

            // Second wave (attenuated)
            allNodes.forEach(target2 => {
              if (target2.id === srcIdx || target2.id === target.id) return
              const strength2 = D[target2.id][target.id] * strength / 100
              if (strength2 < 3) return

              setTimeout(() => {
                const pulse2 = gPulse.append('circle')
                  .attr('r', 4)
                  .attr('fill', '#818cf8')
                  .attr('opacity', Math.min(0.7, strength2 / 40))
                  .attr('cx', target.x).attr('cy', target.y)

                pulse2.transition()
                  .duration(700)
                  .ease(d3.easeCubicInOut)
                  .attr('cx', target2.x).attr('cy', target2.y)
                  .on('end', function () {
                    d3.select(this).remove()
                    gRipple.append('circle')
                      .attr('cx', target2.x).attr('cy', target2.y)
                      .attr('r', nodeRadius(target2))
                      .attr('fill', 'none')
                      .attr('stroke', '#818cf8')
                      .attr('stroke-width', 1.5)
                      .attr('opacity', 0.5)
                      .transition().duration(900)
                      .attr('r', nodeRadius(target2) + 20)
                      .attr('opacity', 0).remove()
                  })
              }, 600)
            })
          })
      })

      setShockLog([`Shock from ${sourceNode.name}:`, ...log])
    }

    return () => {
      simulation.stop()
      tooltip.remove()
    }
  }, [results])

  return (
    <div className="space-y-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
        <div className="px-6 py-3 border-b border-slate-700 flex items-center justify-between">
          <h3 className="font-serif text-lg text-white">Network Visualization</h3>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Net Transmitter (NET &gt; 5)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Net Receiver (NET &lt; -5)
            </span>
          </div>
        </div>
        <div className="p-2">
          <svg ref={svgRef} style={{ width: '100%', display: 'block' }} />
        </div>
        <div className="px-6 py-2 border-t border-slate-700 text-xs text-slate-500">
          Click any node to simulate a GDP shock and watch spillovers propagate. Drag nodes to rearrange.
          Edges shown where GFEVD &gt; {edge_threshold.toFixed(1)}%.
        </div>
      </div>

      {/* Shock log */}
      {shockLog.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl px-5 py-4">
          <p className="text-xs font-medium text-slate-300 mb-2">{shockLog[0]}</p>
          <div className="flex flex-wrap gap-2">
            {shockLog.slice(1).map((line, i) => (
              <span key={i} className="px-2.5 py-1 rounded-lg bg-slate-700 text-xs text-blue-300">
                {line}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* NET rankings mini bar */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <h4 className="text-sm font-medium text-slate-300 mb-3">Net Spillover Rankings</h4>
        <div className="space-y-2">
          {net_rankings.map(r => {
            const maxAbs = Math.max(...net_rankings.map(x => Math.abs(x.net)), 1)
            const pct = (Math.abs(r.net) / maxAbs) * 100
            return (
              <div key={r.country} className="flex items-center gap-3">
                <div className="w-28 text-xs text-slate-300 text-right truncate">{r.country}</div>
                <div className="flex-1 flex items-center gap-1">
                  {r.net < 0 && (
                    <div className="flex-1 flex justify-end">
                      <div
                        className="h-4 rounded bg-blue-600/70"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                  <div className="w-px h-4 bg-slate-600 mx-1" />
                  {r.net >= 0 && (
                    <div className="flex-1">
                      <div
                        className="h-4 rounded bg-red-600/70"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className={`w-14 text-xs font-semibold text-right ${r.net > 0 ? 'text-red-400' : 'text-blue-400'}`}>
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
