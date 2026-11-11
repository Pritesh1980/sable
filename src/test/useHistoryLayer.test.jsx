import { useEffect, useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { flushSync } from 'react-dom'
import { act, render } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router'
import useHistoryLayer from '../hooks/useHistoryLayer'

// #171: drawers that open from the Concepts viewer (STL, try-on, live camera,
// refinement) are plain state, so the browser's Back skipped past them. Each
// one now owns a history entry: Back closes the top layer only.

const probe = {}
function Probe() {
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => { Object.assign(probe, { location, navigate }) })
  return null
}
const here = () => `${probe.location.pathname}${probe.location.search}`
const back = () => act(() => { probe.navigate(-1) })
const forward = () => act(() => { probe.navigate(1) })

const setters = {}
function Layer({ name, initial = null, onPop }) {
  const [value, setValue] = useState(initial)
  useHistoryLayer(name, value, () => { onPop?.(); setValue(null) })
  useEffect(() => { setters[name] = setValue }, [name])
  return value ? <p>{`${name}:${value}`}</p> : null
}

function renderLayers(layers, entries = ['/start', '/page?demo=1']) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Probe />
      <Routes>
        <Route path="/page" element={<>{layers}</>} />
        <Route path="/start" element={<p>start page</p>} />
      </Routes>
    </MemoryRouter>
  )
}

const set = (name, value) => act(() => { setters[name](value) })

describe('useHistoryLayer', () => {
  it('opening pushes an entry; Back closes the layer and stays on the page', () => {
    const onPop = vi.fn()
    const view = renderLayers(<Layer name="layer" onPop={onPop} />)
    set('layer', 'stl')
    expect(here()).toBe('/page?demo=1&layer=stl')
    back()
    expect(onPop).toHaveBeenCalledTimes(1)
    expect(here()).toBe('/page?demo=1')
    expect(view.queryByText('layer:stl')).toBeNull()
  })

  it('closing from the UI goes back, so no entry is left behind', () => {
    const onPop = vi.fn()
    const view = renderLayers(<Layer name="layer" onPop={onPop} />)
    set('layer', 'stl')
    set('layer', null)
    expect(here()).toBe('/page?demo=1')
    expect(onPop).not.toHaveBeenCalled()
    back()
    expect(view.getByText('start page')).toBeInTheDocument()
  })

  it('switching to another layer replaces the entry: one Back closes it', () => {
    const onPop = vi.fn()
    renderLayers(<Layer name="layer" onPop={onPop} />)
    set('layer', 'refine')
    set('layer', 'skin')
    expect(here()).toBe('/page?demo=1&layer=skin')
    back()
    expect(onPop).toHaveBeenCalledTimes(1)
    expect(here()).toBe('/page?demo=1')
  })

  it('stacks: Back closes the top layer and leaves the one under it open', () => {
    const view = renderLayers(<><Layer name="layer" /><Layer name="camera" /></>)
    set('layer', 'skin')
    set('camera', 'live')
    expect(here()).toBe('/page?demo=1&layer=skin&camera=live')
    back()
    expect(view.queryByText('camera:live')).toBeNull()
    expect(view.getByText('layer:skin')).toBeInTheDocument()
    expect(here()).toBe('/page?demo=1&layer=skin')
    back()
    expect(view.queryByText('layer:skin')).toBeNull()
    expect(here()).toBe('/page?demo=1')
  })

  it('a link or reload onto a layer it cannot rebuild drops the param in place', () => {
    const onPop = vi.fn()
    renderLayers(<Layer name="layer" onPop={onPop} />, ['/start', '/page?demo=1&layer=stl'])
    expect(here()).toBe('/page?demo=1')
    expect(onPop).not.toHaveBeenCalled()
    back()
    expect(here()).toBe('/start')
  })

  it('Forward onto a closed layer does not reopen it or strand the page on it', () => {
    const view = renderLayers(<Layer name="layer" />)
    set('layer', 'stl')
    back()
    forward()
    expect(view.queryByText('layer:stl')).toBeNull()
    expect(here()).toBe('/page?demo=1')
  })

  // The Concepts picker (Escape, reopen, Back at once): the router renders
  // location changes as transitions, so a push and the pop straight after it
  // can land in one render that never shows the layer's param. Watching the
  // rendered param alone, the layer never saw itself popped and stayed open
  // over a page whose URL had already left it.
  it('a Back that lands before its entry is ever rendered still closes the layer', () => {
    const onPop = vi.fn()
    const view = renderLayers(<Layer name="layer" onPop={onPop} />)
    act(() => {
      flushSync(() => setters.layer('idea')) // its effect pushes ?layer=idea
      probe.navigate(-1) // and Back lands before that push is rendered
    })
    expect(here()).toBe('/page?demo=1')
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')) })
    expect(onPop).toHaveBeenCalledTimes(1)
    expect(view.queryByText('layer:idea')).toBeNull()
  })

  it('a Back that pops only a layer stacked above leaves this one open', () => {
    const onPop = vi.fn()
    const view = renderLayers(<Layer name="layer" initial={null} onPop={onPop} />)
    set('layer', 'skin')
    const real = window.location.href
    window.history.replaceState(null, '', '/page?demo=1&layer=skin')
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')) })
    window.history.replaceState(null, '', real)
    expect(onPop).not.toHaveBeenCalled()
    expect(view.getByText('layer:skin')).toBeInTheDocument()
  })
})
