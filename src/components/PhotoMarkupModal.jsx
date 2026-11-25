import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { refKey } from '../data/imageRef'
import { isSameOrigin, resolveImageRef } from '../data/imageResolver'
import {
  MAX_CIRCLE_RADIUS,
  MAX_MARK_LABEL_LENGTH,
  MAX_PHOTO_MARKS,
  MIN_CIRCLE_RADIUS,
  buildMarkFromPoints,
  createDefaultMark,
  createMarkupHistory,
  normalizeMarkLabel,
  normalizePhotoMarkup,
  pushMarkupHistory,
  redoMarkupHistory,
  replaceMarkupPresent,
  sanitizeLiveLabel,
  undoMarkupHistory,
} from '../data/photoMarkup'
import useImageBytes from '../hooks/useImageBytes'
import { useFocusOnOpen } from '../hooks/useDialogFocus'

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value))
}

function normalizeClientPoint(svg, clientX, clientY, iw = 1, ih = 1) {
  const rect = svg?.getBoundingClientRect?.()
  if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0.5, y: 0.5 }
  const safeIw = iw > 0 ? iw : rect.width
  const safeIh = ih > 0 ? ih : rect.height
  const scale = Math.min(rect.width / safeIw, rect.height / safeIh)
  const fitW = safeIw * scale
  const fitH = safeIh * scale
  const fitLeft = rect.left + (rect.width - fitW) / 2
  const fitTop = rect.top + (rect.height - fitH) / 2
  return {
    x: clamp((clientX - fitLeft) / (fitW || 1), 0, 1),
    y: clamp((clientY - fitTop) / (fitH || 1), 0, 1),
  }
}

function labelAnchorFor(mark) {
  if (mark.kind === 'circle') {
    return { x: mark.x, y: clamp(mark.y + mark.r + 0.03, 0.08, 0.92) }
  }
  return { x: mark.x, y: clamp(mark.y + 0.03, 0.08, 0.92) }
}

function renderSvgArrow(mark, iw, ih, strokeW, headLen, isSelected = false) {
  const x1 = mark.x * iw
  const y1 = mark.y * ih
  const x2 = mark.toX * iw
  const y2 = mark.toY * ih
  const len = Math.hypot(x2 - x1, y2 - y1)
  let wings = ''
  if (len >= 2) {
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const spread = Math.PI / 6
    const wx1 = x2 - headLen * Math.cos(angle - spread)
    const wy1 = y2 - headLen * Math.sin(angle - spread)
    const wx2 = x2 - headLen * Math.cos(angle + spread)
    const wy2 = y2 - headLen * Math.sin(angle + spread)
    wings = `M ${wx1} ${wy1} L ${x2} ${y2} L ${wx2} ${wy2}`
  }
  const d = `M ${x1} ${y1} L ${x2} ${y2} ${wings}`
  return (
    <g>
      <path d={d} fill="none" stroke="rgba(19, 17, 16, 0.88)" strokeWidth={strokeW + 4} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={isSelected ? '#efe9dc' : '#d9483b'} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  )
}

function AdjustSlider({ label, min, max, step = 0.01, value, onChange }) {
  const sliderId = useId()
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs text-cream-muted">
        <label htmlFor={sliderId}>{label}</label>
        <output htmlFor={sliderId}>{Math.round(value * 100)}%</output>
      </div>
      <input
        id={sliderId}
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full min-h-11 accent-cream"
      />
    </div>
  )
}

/**
 * Non-destructive on-device reference markup editor (`#208`).
 * Reads locally readable bytes without modifying original files or image refs.
 */
export default function PhotoMarkupModal({ image, index, onApply, onClose }) {
  const dialogRef = useRef(null)
  const imgRef = useRef(null)
  const svgRef = useRef(null)
  const titleId = useId()
  const labelInputId = useId()

  const syncRef = resolveImageRef(image)
  const hasKey = Boolean(refKey(image))
  const isExternalWeb = !hasKey && Boolean(syncRef.src) && !isSameOrigin(syncRef.src)
  const bytes = useImageBytes(isExternalWeb ? null : image)

  const initialMarks = useMemo(() => normalizePhotoMarkup(image?.markup) || [], [image])
  const initialIncludeInBrief = useMemo(
    () => !(initialMarks.length > 0 && image?.includeMarkupInBrief === false),
    [initialMarks.length, image?.includeMarkupInBrief],
  )

  const [history, setHistory] = useState(() => createMarkupHistory(initialMarks))
  const [selectedId, setSelectedId] = useState(() => initialMarks[0]?.id || null)
  const [includeInBrief, setIncludeInBrief] = useState(initialIncludeInBrief)
  const [tool, setTool] = useState('circle')
  const [dragState, setDragState] = useState(null)
  const [naturalSize, setNaturalSize] = useState(null)
  const [decodeError, setDecodeError] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [typingLabel, setTypingLabel] = useState(null)
  const coalesceKeyRef = useRef(null)
  const keepEditingRef = useFocusOnOpen(confirmDiscard)

  const marks = history.present
  const isDirty = useMemo(() => {
    const marksChanged = JSON.stringify(marks) !== JSON.stringify(initialMarks)
    const toggleRelevant = marks.length > 0 || initialMarks.length > 0
    return marksChanged || (toggleRelevant && includeInBrief !== initialIncludeInBrief)
  }, [marks, initialMarks, includeInBrief, initialIncludeInBrief])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined
    const previousFocus = document.activeElement
    if (typeof dialog.showModal === 'function') {
      try {
        if (!dialog.open) dialog.showModal()
      } catch {
        dialog.setAttribute('open', '')
      }
    } else {
      dialog.setAttribute('open', '')
    }
    return () => {
      if (typeof dialog.close === 'function' && dialog.open) {
        dialog.returnValue = ''
        dialog.close()
      } else {
        dialog.removeAttribute('open')
      }
      if (previousFocus && typeof previousFocus.focus === 'function' && previousFocus.isConnected) {
        previousFocus.focus()
      }
    }
  }, [])

  useEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      setNaturalSize((prev) => prev || { width: img.naturalWidth, height: img.naturalHeight })
    }
  }, [bytes.src])

  const unavailableMessage = useMemo(() => {
    if (isExternalWeb) {
      return 'Web image links stay referenced in your idea, but cannot be marked up until saved on this device.'
    }
    if (bytes.status === 'unavailable' || bytes.status === 'none') {
      return 'This photo is not available offline right now. It stays in your idea and can be marked up once its bytes can be read.'
    }
    if (decodeError) {
      return 'Could not load this photo for markup. It stays in your idea and can be marked up once its bytes can be read.'
    }
    return ''
  }, [isExternalWeb, bytes.status, decodeError])

  const canEdit = !unavailableMessage && bytes.status === 'ready' && Boolean(naturalSize)
  const activeSelectedId = marks.some((mark) => mark.id === selectedId) ? selectedId : (marks[0]?.id || null)
  const selectedMark = marks.find((mark) => mark.id === activeSelectedId) || null
  const iw = naturalSize?.width || 800
  const ih = naturalSize?.height || 600

  function requestClose() {
    if (isDirty) {
      setConfirmDiscard(true)
      return
    }
    if (dialogRef.current) dialogRef.current.returnValue = ''
    onClose()
  }

  function resetEditingTransient() {
    setTypingLabel(null)
    coalesceKeyRef.current = null
  }

  function commitMarks(nextMarks, nextSelectedId = activeSelectedId) {
    resetEditingTransient()
    setHistory((prev) => pushMarkupHistory(prev, nextMarks))
    setSelectedId(nextSelectedId)
  }

  function handlePointerDown(event) {
    if (!canEdit || event.button !== 0 || marks.length >= MAX_PHOTO_MARKS) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const pt = normalizeClientPoint(svgRef.current, event.clientX, event.clientY, iw, ih)
    setDragState({ pointerId: event.pointerId, start: pt, end: pt })
  }

  function handlePointerMove(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) return
    const pt = normalizeClientPoint(svgRef.current, event.clientX, event.clientY, iw, ih)
    setDragState((prev) => (prev && prev.pointerId === event.pointerId ? { ...prev, end: pt } : prev))
  }

  function finishDrag(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) return
    const end = normalizeClientPoint(svgRef.current, event.clientX, event.clientY, iw, ih)
    const created = buildMarkFromPoints(tool, dragState.start, end, { iw, ih })
    setDragState(null)
    if (!created) return
    commitMarks([...marks, created], created.id)
  }

  function cancelDrag(event) {
    if (dragState && (event.pointerId === undefined || dragState.pointerId === event.pointerId)) {
      setDragState(null)
    }
  }

  function placeDefaultMark() {
    if (!canEdit || marks.length >= MAX_PHOTO_MARKS) return
    const created = createDefaultMark(tool, marks)
    if (!created) return
    commitMarks([...marks, created], created.id)
  }

  function updateSelectedLabel(rawValue) {
    if (!selectedMark) return
    const live = sanitizeLiveLabel(rawValue)
    setTypingLabel({ id: selectedMark.id, value: live })
    const clean = normalizeMarkLabel(live)
    const nextMarks = marks.map((mark) => {
      if (mark.id !== selectedMark.id) return mark
      const copy = { ...mark }
      if (clean) copy.label = clean
      else delete copy.label
      return copy
    })
    const key = `label:${selectedMark.id}`
    if (coalesceKeyRef.current !== key) {
      coalesceKeyRef.current = key
      setHistory((prev) => pushMarkupHistory(prev, nextMarks))
    } else {
      setHistory((prev) => replaceMarkupPresent(prev, nextMarks))
    }
  }

  function updateSelectedField(field, value) {
    if (!selectedMark || !Number.isFinite(value)) return
    setTypingLabel(null)
    const nextMarks = marks.map((mark) => (
      mark.id === selectedMark.id ? { ...mark, [field]: value } : mark
    ))
    const key = `adjust:${selectedMark.id}:${field}`
    if (coalesceKeyRef.current !== key) {
      coalesceKeyRef.current = key
      setHistory((prev) => pushMarkupHistory(prev, nextMarks))
    } else {
      setHistory((prev) => replaceMarkupPresent(prev, nextMarks))
    }
  }

  function removeSelectedMark() {
    if (!selectedMark) return
    const remaining = marks.filter((mark) => mark.id !== selectedMark.id)
    commitMarks(remaining, remaining[0]?.id || null)
  }

  function clearAllMarks() {
    if (!marks.length) return
    commitMarks([], null)
  }

  function handleUndo() {
    resetEditingTransient()
    setHistory((prev) => undoMarkupHistory(prev))
  }

  function handleRedo() {
    resetEditingTransient()
    setHistory((prev) => redoMarkupHistory(prev))
  }

  function handleApply() {
    if (unavailableMessage || bytes.status !== 'ready') return
    resetEditingTransient()
    if (dialogRef.current) dialogRef.current.returnValue = 'apply'
    onApply(marks, includeInBrief)
  }

  const draftPreview = useMemo(() => {
    if (!dragState) return null
    return buildMarkFromPoints(tool, dragState.start, dragState.end, { id: '__draft__', iw, ih })
  }, [dragState, tool, iw, ih])

  const renderedMarks = draftPreview ? [...marks, draftPreview] : marks
  const strokeW = Math.max(3, Math.round(Math.min(iw, ih) * 0.008))
  const headLen = Math.max(14, Math.round(Math.min(iw, ih) * 0.045))

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return
        event.preventDefault()
        event.stopPropagation()
        if (confirmDiscard) setConfirmDiscard(false)
        else requestClose()
      }}
      onCancel={(event) => {
        event.preventDefault()
        if (confirmDiscard) setConfirmDiscard(false)
        else requestClose()
      }}
      onClose={() => {
        if (dialogRef.current) dialogRef.current.returnValue = ''
      }}
      className="fixed inset-0 m-0 h-dvh w-screen max-h-none max-w-none bg-ink-black p-0 text-cream"
    >
      <div className="flex h-full flex-col">
        <header className="border-b border-ink-border bg-ink-black px-4 pb-3 pt-safe-top pt-3">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-accent">Non-destructive markup</p>
              <h1 id={titleId} className="truncate font-display text-xl text-cream">Mark up reference {index + 1}</h1>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close markup editor"
              className="min-h-11 min-w-11 px-3 text-sm text-cream-muted hover:text-cream focus-visible:outline-2 focus-visible:outline-cream"
            >
              Close
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto max-w-3xl space-y-4">
            {confirmDiscard && (
              <div role="alert" className="border border-accent bg-ink-card p-3 space-y-3">
                <p className="text-sm text-cream">Discard unsaved markup changes?</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    ref={keepEditingRef}
                    type="button"
                    onClick={() => setConfirmDiscard(false)}
                    className="min-h-11 border border-cream-muted px-4 text-sm text-cream focus-visible:outline-2 focus-visible:outline-cream"
                  >
                    Keep editing
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDiscard(false)
                      if (dialogRef.current) dialogRef.current.returnValue = ''
                      onClose()
                    }}
                    className="min-h-11 border border-accent px-4 text-sm text-accent focus-visible:outline-2 focus-visible:outline-cream"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}

            {unavailableMessage ? (
              <div className="border border-ink-border bg-ink-card p-5 space-y-2">
                <p className="text-sm text-cream">{unavailableMessage}</p>
                <p className="text-xs text-cream-muted">
                  Your original reference entry, notes, and any existing annotations stay unchanged.
                </p>
              </div>
            ) : bytes.status === 'loading' ? (
              <div className="border border-ink-border bg-ink-card p-8 text-center text-sm text-cream-muted" aria-busy="true">
                Checking photo availability…
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Markup tools">
                  <button
                    type="button"
                    aria-pressed={tool === 'circle'}
                    onClick={() => setTool('circle')}
                    disabled={!canEdit}
                    className={`min-h-11 min-w-11 border px-3 text-sm transition-colors ${
                      tool === 'circle'
                        ? 'border-accent bg-accent/15 text-cream'
                        : 'border-ink-border text-cream-muted hover:text-cream'
                    } disabled:opacity-40`}
                  >
                    Circle
                  </button>
                  <button
                    type="button"
                    aria-pressed={tool === 'arrow'}
                    onClick={() => setTool('arrow')}
                    disabled={!canEdit}
                    className={`min-h-11 min-w-11 border px-3 text-sm transition-colors ${
                      tool === 'arrow'
                        ? 'border-accent bg-accent/15 text-cream'
                        : 'border-ink-border text-cream-muted hover:text-cream'
                    } disabled:opacity-40`}
                  >
                    Arrow
                  </button>
                  <button
                    type="button"
                    onClick={placeDefaultMark}
                    disabled={!canEdit || marks.length >= MAX_PHOTO_MARKS}
                    className="min-h-11 border border-ink-border px-3 text-sm text-cream-muted hover:text-cream disabled:opacity-40"
                  >
                    + Place mark
                  </button>
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={!canEdit || history.past.length === 0}
                    className="min-h-11 min-w-11 border border-ink-border px-3 text-sm text-cream-muted hover:text-cream disabled:opacity-40"
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={handleRedo}
                    disabled={!canEdit || history.future.length === 0}
                    className="min-h-11 min-w-11 border border-ink-border px-3 text-sm text-cream-muted hover:text-cream disabled:opacity-40"
                  >
                    Redo
                  </button>
                  <button
                    type="button"
                    onClick={clearAllMarks}
                    disabled={!canEdit || marks.length === 0}
                    className="min-h-11 border border-ink-border px-3 text-sm text-cream-muted hover:text-accent disabled:opacity-40"
                  >
                    Clear all
                  </button>
                </div>

                <div className="flex justify-center border border-ink-border bg-ink-card p-2">
                  <div
                    className="markup-stage relative max-h-[48dvh] overflow-hidden"
                    style={{
                      aspectRatio: naturalSize ? `${naturalSize.width} / ${naturalSize.height}` : '1 / 1',
                      width: naturalSize
                        ? `min(100%, 540px, calc(48dvh * ${naturalSize.width / naturalSize.height}))`
                        : 'min(100%, 420px)',
                      WebkitUserSelect: 'none',
                      userSelect: 'none',
                    }}
                  >
                    <img
                      ref={imgRef}
                      src={bytes.src}
                      alt={`Reference ${index + 1} for markup`}
                      draggable={false}
                      onLoad={(event) => {
                        const img = event.currentTarget
                        setNaturalSize({
                          width: img.naturalWidth || 800,
                          height: img.naturalHeight || 600,
                        })
                      }}
                      onError={() => setDecodeError(true)}
                      className="block h-full w-full select-none object-fill"
                    />
                    {naturalSize && (
                      <>
                        <svg
                          ref={svgRef}
                          data-testid="markup-stage"
                          viewBox={`0 0 ${iw} ${ih}`}
                          onPointerDown={handlePointerDown}
                          onPointerMove={handlePointerMove}
                          onPointerUp={finishDrag}
                          onPointerCancel={cancelDrag}
                          onLostPointerCapture={cancelDrag}
                          className="markup-stage absolute inset-0 h-full w-full cursor-crosshair"
                          style={{ WebkitUserSelect: 'none', userSelect: 'none', touchAction: 'none' }}
                          aria-label={`Markup canvas for reference ${index + 1}`}
                        >
                          {renderedMarks.map((mark) => (
                            mark.kind === 'circle' ? (
                              <g key={mark.id}>
                                <circle
                                  cx={mark.x * iw}
                                  cy={mark.y * ih}
                                  r={mark.r * Math.min(iw, ih)}
                                  fill="none"
                                  stroke="rgba(19, 17, 16, 0.88)"
                                  strokeWidth={strokeW + 4}
                                />
                                <circle
                                  cx={mark.x * iw}
                                  cy={mark.y * ih}
                                  r={mark.r * Math.min(iw, ih)}
                                  fill="none"
                                  stroke={mark.id === activeSelectedId ? '#efe9dc' : '#d9483b'}
                                  strokeWidth={strokeW}
                                />
                              </g>
                            ) : (
                              <g key={mark.id}>{renderSvgArrow(mark, iw, ih, strokeW, headLen, mark.id === activeSelectedId)}</g>
                            )
                          ))}
                        </svg>
                        <div className="pointer-events-none absolute inset-0 overflow-hidden">
                          {renderedMarks.filter((mark) => mark.label).map((mark) => {
                            const pos = labelAnchorFor(mark)
                            return (
                              <span
                                key={`${mark.id}-label`}
                                className="absolute -translate-x-1/2 border border-accent bg-ink-black/90 px-2 py-0.5 text-xs text-cream shadow-sm whitespace-nowrap max-w-[80%] truncate"
                                style={{
                                  left: `${clamp(pos.x * 100, 8, 92)}%`,
                                  top: `${clamp(pos.y * 100, 4, 90)}%`,
                                }}
                              >
                                {mark.label}
                              </span>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <p className="text-xs text-cream-muted">
                  Drag or tap on the photo to add a {tool}. Originals and saved notes stay untouched ({marks.length}/{MAX_PHOTO_MARKS} marks).
                </p>

                {marks.length > 0 && (
                  <div className="space-y-3 border border-ink-border bg-ink-card p-3">
                    <div className="flex flex-wrap gap-2">
                      {marks.map((mark, markIndex) => (
                        <button
                          key={mark.id}
                          type="button"
                          aria-pressed={mark.id === activeSelectedId}
                          onClick={() => {
                            resetEditingTransient()
                            setSelectedId(mark.id)
                          }}
                          className={`min-h-11 border px-3 text-xs font-mono transition-colors ${
                            mark.id === activeSelectedId
                              ? 'border-cream bg-ink-muted text-cream'
                              : 'border-ink-border text-cream-muted hover:text-cream'
                          }`}
                        >
                          {markIndex + 1}. {mark.kind === 'circle' ? 'Circle' : 'Arrow'}
                          {mark.label ? ` · ${mark.label}` : ''}
                        </button>
                      ))}
                    </div>

                    {selectedMark && (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <label htmlFor={labelInputId} className="sr-only">Mark label</label>
                          <input
                            id={labelInputId}
                            type="text"
                            aria-label="Mark label"
                            maxLength={MAX_MARK_LABEL_LENGTH}
                            placeholder="Short note (e.g. shading, stem curve)…"
                            value={typingLabel?.id === selectedMark.id ? typingLabel.value : (selectedMark.label || '')}
                            onChange={(event) => updateSelectedLabel(event.target.value)}
                            onBlur={resetEditingTransient}
                            className="min-h-11 flex-1 bg-ink-muted border border-ink-border rounded-xs px-3 text-sm text-cream outline-hidden focus-visible:ring-2 focus-visible:ring-accent placeholder-cream-muted/60"
                          />
                          <button
                            type="button"
                            onClick={removeSelectedMark}
                            className="min-h-11 border border-ink-border px-3 text-sm text-cream-muted hover:text-accent"
                          >
                            Remove mark
                          </button>
                        </div>

                        <details className="border-t border-ink-border pt-2">
                          <summary className="flex min-h-11 cursor-pointer items-center text-xs font-mono uppercase tracking-widest text-cream-muted hover:text-cream">
                            Adjust position & size
                          </summary>
                          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {selectedMark.kind === 'circle' ? (
                              <>
                                <AdjustSlider label="Mark X" min={0} max={1} value={selectedMark.x} onChange={(v) => updateSelectedField('x', v)} />
                                <AdjustSlider label="Mark Y" min={0} max={1} value={selectedMark.y} onChange={(v) => updateSelectedField('y', v)} />
                                <AdjustSlider label="Mark radius" min={MIN_CIRCLE_RADIUS} max={MAX_CIRCLE_RADIUS} value={selectedMark.r} onChange={(v) => updateSelectedField('r', v)} />
                              </>
                            ) : (
                              <>
                                <AdjustSlider label="Start X" min={0} max={1} value={selectedMark.x} onChange={(v) => updateSelectedField('x', v)} />
                                <AdjustSlider label="Start Y" min={0} max={1} value={selectedMark.y} onChange={(v) => updateSelectedField('y', v)} />
                                <AdjustSlider label="Tip X" min={0} max={1} value={selectedMark.toX} onChange={(v) => updateSelectedField('toX', v)} />
                                <AdjustSlider label="Tip Y" min={0} max={1} value={selectedMark.toY} onChange={(v) => updateSelectedField('toY', v)} />
                              </>
                            )}
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  role="switch"
                  aria-checked={includeInBrief}
                  onClick={() => setIncludeInBrief((prev) => !prev)}
                  className="flex min-h-11 w-full items-center justify-between border border-ink-border bg-ink-card px-3 text-sm text-cream hover:border-cream-muted/50"
                >
                  <span>Show markup on brief card</span>
                  <span className="font-mono text-xs uppercase tracking-widest text-cream-muted">
                    {includeInBrief ? 'On' : 'Off'}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>

        <footer className="border-t border-ink-border bg-ink-black px-4 pb-safe pt-3 pb-3">
          <div className="mx-auto flex max-w-3xl items-center justify-end gap-3">
            <button
              type="button"
              onClick={requestClose}
              className="min-h-11 border border-ink-border px-4 text-sm text-cream-muted hover:text-cream"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!canEdit}
              className="min-h-11 border border-accent bg-accent px-4 text-sm text-cream hover:bg-accent-hover disabled:opacity-40"
            >
              Apply markup
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  )
}
