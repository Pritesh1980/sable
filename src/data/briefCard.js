import { refKey } from './imageRef'
import { isSameOrigin, resolveImageBytes, resolveImageRef } from './imageResolver'
import { getImageNote, normalizeReferenceImages } from './planning'
import { trimChars, trimEndChars } from './textTrim'
import { normalizeBriefCrop } from './referenceImages'

export const BRIEF_CARD_WIDTH = 1080
export const BRIEF_CARD_HEIGHT = 1350
export const MAX_BRIEF_CARD_PHOTOS = 4

export const DEFAULT_BRIEF_FONTS = {
  display: '"Playfair Display", Georgia, serif',
  body: '"DM Sans", system-ui, sans-serif',
  mono: '"DM Mono", monospace',
}

export const BRIEF_CARD_THEME = {
  bg: '#141210',
  surface: '#1e1c19',
  mutedSurface: '#2a2723',
  border: '#2e2b26',
  cream: '#f0ebe0',
  muted: '#9e9a8e',
  accent: '#c0392b',
}

const segmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter('en', { granularity: 'grapheme' })
  : null

const PICTOGRAPHIC = /\p{Extended_Pictographic}/u

export function splitGraphemes(text) {
  const input = String(text ?? '')
  if (!input) return []
  if (segmenter) {
    return Array.from(segmenter.segment(input), (part) => part.segment)
  }
  return Array.from(input)
}

function isWideGrapheme(cluster) {
  if (!cluster) return false
  const cp = cluster.codePointAt(0) || 0
  return cp > 0x1f000 || PICTOGRAPHIC.test(cluster) || cluster.length > 2
}

function defaultMeasureText(text, fontSize, { mono = false } = {}) {
  const clusters = splitGraphemes(text)
  let width = 0
  for (const cluster of clusters) {
    if (cluster === ' ') width += fontSize * 0.3
    else if (isWideGrapheme(cluster)) width += fontSize * 1.05
    else if (mono) width += fontSize * 0.62
    else if ('ilI1.,:;|!'.includes(cluster)) width += fontSize * 0.32
    else if ('mwMW@#%&'.includes(cluster)) width += fontSize * 0.82
    else width += fontSize * 0.56
  }
  return width
}

function clampLineWithEllipsis(text, maxWidth, measure) {
  const trimmed = trimEndChars(text, ' \t')
  if (measure(trimmed) <= maxWidth) return trimmed
  const clusters = splitGraphemes(trimmed)
  let low = 0
  let high = clusters.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    const candidate = `${trimEndChars(clusters.slice(0, mid).join(''), ' \t')}…`
    if (measure(candidate) <= maxWidth) low = mid
    else high = mid - 1
  }
  const safeCount = Math.max(1, low)
  return `${trimEndChars(clusters.slice(0, safeCount).join(''), ' \t')}…`
}

function breakLongWord(word, maxWidth, measure) {
  const clusters = splitGraphemes(word)
  const parts = []
  let current = ''
  for (const cluster of clusters) {
    const next = current + cluster
    if (current && measure(next) > maxWidth) {
      parts.push(current)
      current = cluster
    } else {
      current = next
    }
  }
  if (current) parts.push(current)
  return parts
}

export function wrapTextLines(text, { maxWidth, maxLines = 4, measure }) {
  const raw = String(text ?? '').replace(/\r\n|\r/g, '\n').trim()
  if (!raw || maxLines <= 0) return { lines: [], truncated: false }

  const paragraphs = raw.split('\n')
  const allLines = []

  for (const paragraph of paragraphs) {
    const collapsed = paragraph.split(/\s+/).filter(Boolean)
    if (collapsed.length === 0) continue

    const tokens = []
    for (const word of collapsed) {
      if (measure(word) > maxWidth) {
        tokens.push(...breakLongWord(word, maxWidth, measure))
      } else {
        tokens.push(word)
      }
    }

    let current = ''
    for (const token of tokens) {
      const candidate = current ? `${current} ${token}` : token
      if (!current || measure(candidate) <= maxWidth) {
        current = candidate
      } else {
        allLines.push(current)
        current = token
      }
    }
    if (current) allLines.push(current)
  }

  if (allLines.length <= maxLines) {
    return { lines: allLines, truncated: false }
  }

  const visible = allLines.slice(0, maxLines)
  const overflowTail = allLines.slice(maxLines - 1).join(' ')
  visible[maxLines - 1] = clampLineWithEllipsis(overflowTail, maxWidth, measure)
  return { lines: visible, truncated: true }
}

export function formatSkippedWebImagesNotice(skippedWebCount) {
  if (!skippedWebCount || skippedWebCount <= 0) return ''
  return `${skippedWebCount} web image${skippedWebCount === 1 ? '' : 's'} not included`
}

function formatArtistLine(idea, artists = []) {
  if (typeof idea?.artistLine === 'string' && idea.artistLine.trim()) {
    return idea.artistLine.trim()
  }
  const linkedIds = Array.isArray(idea?.linkedArtists) ? idea.linkedArtists : []
  if (!linkedIds.length || !Array.isArray(artists) || !artists.length) return ''
  const linked = artists.filter((artist) => linkedIds.includes(artist.id))
  if (!linked.length) return ''
  const labels = linked.slice(0, 3).map((artist) => {
    if (artist.name && artist.handle) return `${artist.name} (@${artist.handle})`
    return artist.name || `@${artist.handle}`
  })
  const extra = linked.length > 3 ? ` +${linked.length - 3}` : ''
  return `For ${labels.join(' · ')}${extra}`
}

function inferCardPhotos(idea) {
  const eligible = []
  let skippedWebCount = 0
  for (const image of normalizeReferenceImages(idea?.images)) {
    if (refKey(image)) {
      eligible.push(image)
      continue
    }
    const resolved = resolveImageRef(image)
    if (!resolved.src) continue
    if (!isSameOrigin(resolved.src)) {
      skippedWebCount += 1
    } else {
      eligible.push(image)
    }
  }
  return {
    photoCount: Math.min(MAX_BRIEF_CARD_PHOTOS, eligible.length),
    photoNotes: eligible.slice(0, MAX_BRIEF_CARD_PHOTOS).map(getImageNote),
    overflowCount: Math.max(0, eligible.length - MAX_BRIEF_CARD_PHOTOS),
    skippedWebCount,
  }
}

function layoutPhotoSlots(box, count, notes = []) {
  if (!box || count <= 0) return []
  const gap = Math.round(box.width * 0.02)
  const { x, y, width, height } = box
  const colW = Math.floor((width - gap) / 2)
  const rowH = Math.floor((height - gap) / 2)

  if (count === 1) {
    return [{ index: 0, x, y, width, height, note: notes[0] || '' }]
  }
  if (count === 2) {
    return [
      { index: 0, x, y, width: colW, height, note: notes[0] || '' },
      { index: 1, x: x + colW + gap, y, width: width - colW - gap, height, note: notes[1] || '' },
    ]
  }
  if (count === 3) {
    const rightX = x + colW + gap
    const rightW = width - colW - gap
    return [
      { index: 0, x, y, width: colW, height, note: notes[0] || '' },
      { index: 1, x: rightX, y, width: rightW, height: rowH, note: notes[1] || '' },
      { index: 2, x: rightX, y: y + rowH + gap, width: rightW, height: height - rowH - gap, note: notes[2] || '' },
    ]
  }
  const rightX = x + colW + gap
  const rightW = width - colW - gap
  const bottomY = y + rowH + gap
  const bottomH = height - rowH - gap
  return [
    { index: 0, x, y, width: colW, height: rowH, note: notes[0] || '' },
    { index: 1, x: rightX, y, width: rightW, height: rowH, note: notes[1] || '' },
    { index: 2, x, y: bottomY, width: colW, height: bottomH, note: notes[2] || '' },
    { index: 3, x: rightX, y: bottomY, width: rightW, height: bottomH, note: notes[3] || '' },
  ]
}

function layoutPills(items, { x, y, width, fontSize, gapX, gapY, measure }) {
  const height = Math.round(fontSize * 1.7)
  const padX = Math.round(fontSize * 0.75)
  const right = x + width
  const makePill = (item) => {
    const label = clampLineWithEllipsis(item.label, width - padX * 2, measure)
    return { ...item, label, width: Math.ceil(measure(label) + padX * 2), height, fontSize, padX }
  }

  const pills = []
  let rowY = y
  let nextX = x
  for (const item of items) {
    const pill = makePill(item)
    if (nextX > x && nextX + pill.width > right) {
      if (rowY !== y) break
      rowY += height + gapY
      nextX = x
    }
    pills.push({ ...pill, x: nextX, y: rowY })
    nextX += pill.width + gapX
  }

  if (pills.length < items.length) {
    // Make room for the count in the last row. Re-measure if removing a tag
    // adds a digit to the count; keep the placement in the first row.
    const firstHidden = pills.length
    const makeBadge = (count) => makePill({ label: `+${count}`, kind: 'overflow' })
    let badge = makeBadge(items.length - pills.length)
    while (true) {
      const last = pills.at(-1)
      nextX = last?.y === rowY ? last.x + last.width + gapX : x
      if (nextX + badge.width <= right || nextX === x) break
      pills.pop()
      badge = makeBadge(items.length - pills.length)
    }
    // A long imported tag may have used the whole row. Keep any later short
    // tags that still fit alongside the count rather than leaving it alone.
    for (let i = firstHidden; i < items.length; i += 1) {
      const pill = makePill(items[i])
      const nextBadge = makeBadge(items.length - pills.length - 1)
      if (nextX + pill.width + gapX + nextBadge.width > right) continue
      pills.push({ ...pill, x: nextX, y: rowY })
      nextX += pill.width + gapX
      badge = nextBadge
    }
    pills.push({ ...badge, x: nextX, y: rowY })
  }
  return pills
}

/**
 * Pure layout for the 1080×1350 Instagram DM brief card (#180).
 * Returns concrete bounding boxes and wrapped text lines without touching DOM/canvas.
 */
export function layoutBriefCard(
  idea = {},
  {
    width = BRIEF_CARD_WIDTH,
    height = BRIEF_CARD_HEIGHT,
    fonts = DEFAULT_BRIEF_FONTS,
    artists = [],
    photoCount,
    skippedWebCount,
    photoNotes,
    overflowCount,
    measureText,
  } = {},
) {
  const inferred = [photoCount, skippedWebCount, photoNotes, overflowCount].includes(undefined)
    ? inferCardPhotos(idea)
    : null
  const count = Math.min(
    MAX_BRIEF_CARD_PHOTOS,
    Math.max(0, photoCount !== undefined ? photoCount : inferred.photoCount),
  )
  const skippedWeb = skippedWebCount !== undefined ? skippedWebCount : inferred.skippedWebCount
  const notes = photoNotes ?? inferred.photoNotes
  const extraPhotos = overflowCount ?? inferred.overflowCount

  const measure = (text, fontSize, fontFamily, opts = {}) => {
    if (typeof measureText === 'function') {
      return measureText(text, `${opts.weight || 400} ${fontSize}px ${fontFamily}`, fontSize)
    }
    return defaultMeasureText(text, fontSize, opts)
  }

  const padX = Math.round(width * 0.0667) // 72px at 1080
  const padY = Math.round(height * 0.0563) // 76px at 1350
  const contentWidth = width - padX * 2
  const frameInset = Math.round(width * 0.0333) // 36px at 1080

  const frame = {
    x: frameInset,
    y: frameInset,
    width: width - frameInset * 2,
    height: height - frameInset * 2,
  }

  const kickerFontSize = Math.round(width * 0.0185) // 20px
  const artistFontSize = Math.round(width * 0.0222) // 24px
  const rawArtistLine = formatArtistLine(idea, artists)
  const wrappedArtist = rawArtistLine
    ? wrapTextLines(rawArtistLine, {
        maxWidth: contentWidth,
        maxLines: 1,
        measure: (t) => measure(t, artistFontSize, fonts.body),
      })
    : { lines: [], truncated: false }
  const artistLine = wrappedArtist.lines[0] || ''
  const headerHeight = artistLine ? Math.round(kickerFontSize * 1.4 + artistFontSize * 1.6) : Math.round(kickerFontSize * 1.5)
  const header = {
    kicker: 'SABLE · TATTOO BRIEF',
    kickerFontSize,
    artistLine,
    artistTruncated: wrappedArtist.truncated,
    artistFontSize,
    box: {
      x: padX,
      y: padY,
      width: contentWidth,
      height: headerHeight,
    },
  }

  const sectionGap = Math.round(height * 0.022)
  const bodyTop = header.box.y + header.box.height + sectionGap
  let cursorY = bodyTop

  // Title (display serif)
  const titleFontSize = Math.round(width * (count === 0 ? 0.067 : 0.052))
  const titleLineHeight = Math.round(titleFontSize * 1.18)
  const maxTitleLines = count > 0 ? 2 : 3
  const titleText = String(idea?.title ?? '').trim() || 'Untitled idea'
  const wrappedTitle = wrapTextLines(titleText, {
    maxWidth: contentWidth,
    maxLines: maxTitleLines,
    measure: (t) => measure(t, titleFontSize, fonts.display, { weight: 600 }),
  })
  const titleLines = wrappedTitle.lines.length ? wrappedTitle.lines : ['Untitled idea']
  const title = {
    lines: titleLines,
    truncated: wrappedTitle.truncated,
    fontSize: titleFontSize,
    lineHeight: titleLineHeight,
    font: `600 ${titleFontSize}px ${fonts.display}`,
    box: {
      x: padX,
      y: cursorY,
      width: contentWidth,
      height: titleLines.length * titleLineHeight,
    },
  }

  cursorY = title.box.y + title.box.height + Math.round(height * 0.018)

  // Placement & style tag pills
  const rawPills = [
    ...(idea?.placement ? [{ label: String(idea.placement).toUpperCase(), kind: 'placement' }] : []),
    ...((idea?.tags || []).filter(Boolean).map((tag) => ({ label: String(tag).toUpperCase(), kind: 'tag' }))),
  ]

  const pillFontSize = Math.round(width * 0.025)
  const pills = layoutPills(rawPills, {
    x: padX,
    y: cursorY,
    width: contentWidth,
    fontSize: pillFontSize,
    gapX: Math.round(width * 0.011),
    gapY: Math.round(height * 0.009),
    measure: (text) => measure(text, pillFontSize, fonts.mono, { mono: true }),
  })
  const lastPill = pills.at(-1)

  const pillsBox = {
    x: padX,
    y: cursorY,
    width: contentWidth,
    height: lastPill ? lastPill.y + lastPill.height - cursorY : 0,
  }

  if (pills.length > 0) {
    cursorY = pillsBox.y + pillsBox.height + Math.round(height * 0.02)
  }

  // Footer reservation at bottom of card
  const footerHeight = Math.round(width * 0.026)
  const footerY = height - padY - footerHeight
  const skippedNotice = formatSkippedWebImagesNotice(skippedWeb)
  const footer = {
    brand: 'SABLE',
    notice: skippedNotice,
    fontSize: Math.round(width * 0.0175),
    box: {
      x: padX,
      y: footerY,
      width: contentWidth,
      height: footerHeight,
    },
  }

  // Reserve space for photos when count > 0
  const targetPhotoHeight = count === 0
    ? 0
    : count <= 2
      ? Math.round(height * 0.43)
      : Math.round(height * 0.46)

  const descFontSize = Math.round(width * (count === 0 ? 0.034 : 0.026))
  const descLineHeight = Math.round(descFontSize * 1.42)
  const availableBeforeFooter = Math.max(0, footer.box.y - sectionGap - cursorY)
  const maxDescSpace = count > 0
    ? Math.max(descLineHeight * 2, availableBeforeFooter - targetPhotoHeight - sectionGap)
    : availableBeforeFooter
  const maxDescLines = Math.max(1, Math.min(count > 0 ? 5 : 14, Math.floor(maxDescSpace / descLineHeight)))

  const wrappedDesc = wrapTextLines(idea?.description || '', {
    maxWidth: contentWidth,
    maxLines: maxDescLines,
    measure: (t) => measure(t, descFontSize, fonts.body),
  })

  const description = {
    lines: wrappedDesc.lines,
    truncated: wrappedDesc.truncated,
    fontSize: descFontSize,
    lineHeight: descLineHeight,
    font: `400 ${descFontSize}px ${fonts.body}`,
    box: {
      x: padX,
      y: cursorY,
      width: contentWidth,
      height: wrappedDesc.lines.length * descLineHeight,
    },
  }

  if (description.box.height > 0) {
    cursorY = description.box.y + description.box.height + sectionGap
  }

  let photosBox = null
  if (count > 0) {
    const remainingHeight = Math.max(0, footer.box.y - sectionGap - cursorY)
    const halfWidth = Math.floor((contentWidth - Math.round(contentWidth * 0.02)) / 2)
    const gridHeight = count === 2 ? Math.min(remainingHeight, Math.floor(halfWidth * 1.25)) : remainingHeight
    photosBox = {
      x: padX,
      y: cursorY,
      width: contentWidth,
      height: gridHeight,
    }
  }

  if (count === 0 || count === 2) {
    // Centre the content between the masthead and footer when it does not
    // use the whole card, without increasing crop just to fill the space.
    const end = photosBox || (description.box.height ? description.box : lastPill ? pillsBox : title.box)
    const offset = Math.max(0, Math.round((footerY - sectionGap - end.y - end.height) / 2))
    for (const box of [title.box, pillsBox, description.box, photosBox, ...pills]) {
      if (box) box.y += offset
    }
  }

  const captionSize = Math.round(width * 0.026)
  const captionLineHeight = Math.round(captionSize * 1.24)
  const captionPad = Math.round(width * 0.015)
  const captionRows = new Map()
  // The three-photo layout is asymmetric; its caption bands are independent.
  const captionRow = (slot) => count === 3 ? slot.index : slot.y
  const captionedSlots = layoutPhotoSlots(photosBox, count, notes).map((slot) => {
    const { lines } = wrapTextLines(slot.note, {
      maxWidth: slot.width - captionPad * 2,
      maxLines: 2,
      measure: (text) => measure(text, captionSize, fonts.body),
    })
    const row = captionRow(slot)
    captionRows.set(row, Math.max(captionRows.get(row) || 0, lines.length))
    return {
      ...slot,
      caption: { lines, fontSize: captionSize, lineHeight: captionLineHeight, pad: captionPad },
    }
  })
  const slots = captionedSlots.map((slot) => {
    const lines = captionRows.get(captionRow(slot))
    const captionHeight = lines ? captionLineHeight * lines + captionPad * 2 : 0
    return { ...slot, imageHeight: slot.height - captionHeight }
  })

  return {
    width,
    height,
    fonts,
    theme: BRIEF_CARD_THEME,
    frame,
    header,
    title,
    pills,
    pillsBox,
    description,
    photos: {
      box: photosBox,
      slots,
      overflowLabel: extraPhotos > 0 ? `+${extraPhotos} more reference${extraPhotos === 1 ? '' : 's'}` : '',
      overflowFontSize: captionSize,
      skippedWebCount: skippedWeb,
      skippedNotice,
    },
    footer,
  }
}

const IMAGE_LOAD_TIMEOUT_MS = 8000

function loadDomImage(src, { timeoutMs = IMAGE_LOAD_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined' || !src) {
      resolve(null)
      return
    }
    const image = new Image()
    if (/^https?:/i.test(src)) {
      image.crossOrigin = 'anonymous'
    }
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      image.onload = null
      image.onerror = null
      resolve(result)
    }
    const timer = setTimeout(() => {
      image.src = ''
      finish(null)
    }, timeoutMs)
    image.onload = () => finish(image)
    image.onerror = () => finish(null)
    image.src = src
  })
}

/**
 * Resolves up to 4 ready photos for the brief card while skipping cross-origin
 * `{ url }` images that would taint the canvas (#180).
 */
export async function collectBriefCardPhotos(
  images = [],
  { loadImage = loadDomImage, onlyReadyKeys = true } = {},
) {
  const normalized = normalizeReferenceImages(images)
  const candidates = []
  let skippedWebCount = 0
  const unavailableIndices = []
  const skippedWebIndices = []

  for (const [sourceIndex, image] of normalized.entries()) {
    const key = refKey(image)
    const note = getImageNote(image)
    if (!key) {
      const resolved = resolveImageRef(image)
      if (!resolved.src) { unavailableIndices.push(sourceIndex); continue }
      if (!isSameOrigin(resolved.src)) {
        skippedWebCount += 1
        skippedWebIndices.push(sourceIndex)
        continue
      }
      candidates.push({ image, note, sourceIndex, directSrc: resolved.src })
      continue
    }

    const sync = resolveImageRef(image)
    if (onlyReadyKeys && sync.status !== 'ready') {
      unavailableIndices.push(sourceIndex)
      continue
    }
    candidates.push({ image, note, sourceIndex, directSrc: isSameOrigin(sync.src) ? sync.src : '' })
  }

  const photos = []
  for (const candidate of candidates) {
    if (photos.length >= MAX_BRIEF_CARD_PHOTOS) break
    let src = candidate.directSrc
    let release = () => {}
    if (!src) {
      const bytes = await resolveImageBytes(candidate.image)
      src = bytes.src
      release = bytes.release
    }
    if (!src) {
      release()
      unavailableIndices.push(candidate.sourceIndex)
      continue
    }
    try {
      const element = await loadImage(src)
      if (element) {
        photos.push({ element, note: candidate.note, sourceIndex: candidate.sourceIndex,
          ref: candidate.image, crop: candidate.image.briefCrop })
      } else unavailableIndices.push(candidate.sourceIndex)
    } catch {
      unavailableIndices.push(candidate.sourceIndex)
    } finally {
      release()
    }
  }

  return {
    photos,
    unavailableCount: unavailableIndices.length,
    unavailableIndices,
    skippedWebIndices,
    // Count omitted reference entries, not decoded photos. This keeps the
    // number independent of decode order without fetching surplus images.
    overflowCount: photos.length === MAX_BRIEF_CARD_PHOTOS ? candidates.length - photos.length : 0,
    skippedWebCount,
    skippedNotice: formatSkippedWebImagesNotice(skippedWebCount),
  }
}

export function computeBriefCardCrop(iw, ih, width, height, crop) {
  const { x, y, zoom } = normalizeBriefCrop(crop) || { x: 0.5, y: 0.5, zoom: 1 }
  const scale = Math.max(width / iw, height / ih) * zoom
  const sw = width / scale
  const sh = height / scale
  return { sx: Math.max(0, iw - sw) * x, sy: Math.max(0, ih - sh) * y, sw, sh }
}

function drawCoverImage(ctx, img, slot, crop) {
  const iw = img.naturalWidth || img.width || slot.width
  const ih = img.naturalHeight || img.height || slot.height
  const { sx, sy, sw, sh } = computeBriefCardCrop(iw, ih, slot.width, slot.height, crop)

  ctx.save()
  ctx.beginPath()
  ctx.rect(slot.x, slot.y, slot.width, slot.height)
  ctx.clip()
  ctx.drawImage(img, sx, sy, sw, sh, slot.x, slot.y, slot.width, slot.height)
  ctx.restore()
}

export function drawBriefCardOnCanvas(canvas, layout, photos = []) {
  canvas.width = layout.width
  canvas.height = layout.height
  const ctx = canvas.getContext?.('2d')
  if (!ctx) return false

  const { theme, fonts, frame, header, title, pills, description, footer } = layout

  // Background & border frame
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, layout.width, layout.height)

  ctx.strokeStyle = theme.border
  ctx.lineWidth = 2
  ctx.strokeRect(frame.x, frame.y, frame.width, frame.height)

  ctx.textBaseline = 'top'

  // Header kicker & optional artist line
  ctx.fillStyle = theme.accent
  ctx.font = `500 ${header.kickerFontSize}px ${fonts.mono}`
  ctx.fillText(header.kicker, header.box.x, header.box.y)

  if (header.artistLine) {
    ctx.fillStyle = theme.muted
    ctx.font = `400 ${header.artistFontSize}px ${fonts.body}`
    ctx.fillText(
      header.artistLine,
      header.box.x,
      header.box.y + Math.round(header.kickerFontSize * 1.55),
    )
  }

  // Title
  ctx.fillStyle = theme.cream
  ctx.font = title.font
  title.lines.forEach((line, index) => {
    ctx.fillText(line, title.box.x, title.box.y + index * title.lineHeight)
  })

  // Placement & style tag pills
  for (const pill of pills) {
    ctx.fillStyle = pill.kind === 'placement' ? 'rgba(192, 57, 43, 0.14)' : theme.surface
    ctx.fillRect(pill.x, pill.y, pill.width, pill.height)
    ctx.strokeStyle = pill.kind === 'placement' ? theme.accent : theme.border
    ctx.lineWidth = 1.5
    ctx.strokeRect(pill.x, pill.y, pill.width, pill.height)

    ctx.fillStyle = pill.kind === 'overflow' ? theme.muted : theme.cream
    ctx.font = `400 ${pill.fontSize}px ${fonts.mono}`
    const textY = pill.y + Math.round((pill.height - pill.fontSize) / 2)
    ctx.fillText(pill.label, pill.x + pill.padX, textY)
  }

  // Description
  ctx.fillStyle = theme.cream
  ctx.font = description.font
  description.lines.forEach((line, index) => {
    ctx.fillText(line, description.box.x, description.box.y + index * description.lineHeight)
  })

  // Reference photos
  for (const slot of layout.photos.slots) {
    ctx.fillStyle = theme.surface
    ctx.fillRect(slot.x, slot.y, slot.width, slot.height)
    const photo = photos[slot.index]
    if (photo?.element) {
      drawCoverImage(ctx, photo.element, { ...slot, height: slot.imageHeight }, photo.crop)
      const { lines, fontSize, lineHeight, pad } = slot.caption
      ctx.fillStyle = theme.cream
      ctx.font = `400 ${fontSize}px ${fonts.body}`
      lines.forEach((line, index) => {
        ctx.fillText(line, slot.x + pad, slot.y + slot.imageHeight + pad + index * lineHeight)
      })
    }
    ctx.strokeStyle = theme.border
    ctx.lineWidth = 1.5
    ctx.strokeRect(slot.x, slot.y, slot.width, slot.height)
  }

  // Footer hairline + brand (the skipped-web notice stays in the editor, not on the card)
  const footerLineY = footer.box.y - 14
  ctx.strokeStyle = theme.border
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(footer.box.x, footerLineY)
  ctx.lineTo(footer.box.x + footer.box.width, footerLineY)
  ctx.stroke()

  if (layout.photos.overflowLabel) {
    ctx.font = `400 ${layout.photos.overflowFontSize}px ${fonts.body}`
    ctx.fillStyle = theme.cream
    ctx.fillText(layout.photos.overflowLabel, footer.box.x, footer.box.y)
  }

  ctx.font = `400 ${footer.fontSize}px ${fonts.mono}`
  ctx.fillStyle = theme.muted
  const brandWidth = ctx.measureText ? ctx.measureText(footer.brand).width : footer.brand.length * footer.fontSize * 0.6
  ctx.fillText(footer.brand, footer.box.x + footer.box.width - brandWidth, footer.box.y)

  return true
}

// document.fonts.ready only waits for faces already in use; the card's title weight
// may never have rendered, so ask for each face it draws with before measuring.
async function loadBriefCardFonts(fonts) {
  const faces = typeof document === 'undefined' ? undefined : document.fonts
  if (!faces) return
  if (typeof faces.load === 'function') {
    await Promise.allSettled([
      `600 64px ${fonts.display}`,
      `400 28px ${fonts.body}`,
      `400 20px ${fonts.mono}`,
      `500 20px ${fonts.mono}`,
    ].map((spec) => faces.load(spec)))
  }
  try {
    await faces.ready
  } catch {
    // Proceed with fallback fonts if font loading rejects
  }
}

function canvasToPngBlob(canvas, hasContext) {
  if (!hasContext) {
    return Promise.reject(new Error('Canvas 2D context is unavailable'))
  }
  return new Promise((resolve, reject) => {
    if (typeof canvas?.toBlob !== 'function') {
      reject(new Error('Canvas PNG export is unavailable'))
      return
    }
    try {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
          return
        }
        reject(new Error('Canvas PNG encoding returned an empty blob'))
      }, 'image/png')
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

export function briefCardFilename(idea) {
  const raw = String(idea?.title ?? 'idea').toLowerCase()
  let slug = ''
  let prevDash = false
  for (const ch of raw) {
    const isAlphaNum = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')
    if (isAlphaNum) {
      slug += ch
      prevDash = false
    } else if (!prevDash && slug.length > 0) {
      slug += '-'
      prevDash = true
    }
  }
  const clean = trimChars(slug, '-').slice(0, 48) || 'idea'
  return `sable-brief-${clean}.png`
}

export function requestBriefCardDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  try {
    link.href = url
    link.download = filename
    document.body.append(link)
    link.click()
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  } finally {
    link.remove()
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function canSharePngFile(nav, file) {
  try {
    return Boolean(nav.canShare({ files: [file] }))
  } catch {
    return false
  }
}

export async function shareOrDownloadBriefCard(
  blob,
  filename,
  {
    nav = typeof navigator !== 'undefined' ? navigator : undefined,
    download = requestBriefCardDownload,
  } = {},
) {
  if (typeof File === 'function' && typeof nav?.share === 'function' && typeof nav?.canShare === 'function') {
    const file = new File([blob], filename, { type: 'image/png' })
    if (canSharePngFile(nav, file)) {
      try {
        await nav.share({ files: [file] })
        return { method: 'share', filename }
      } catch (error) {
        if (error?.name === 'AbortError') {
          return { method: 'aborted', filename }
        }
        // NotAllowedError etc.: the PNG is ready, so hand it over as a download.
      }
    }
  }
  download(blob, filename)
  return { method: 'download', filename }
}

/**
 * Waits for web fonts, resolves ready local/blob photos, renders the 1080×1350
 * card onto a canvas, and shares or downloads the resulting PNG (#180).
 */
export async function prepareBriefCardImage(
  idea,
  {
    artists = [],
    width = BRIEF_CARD_WIDTH,
    height = BRIEF_CARD_HEIGHT,
    fonts = DEFAULT_BRIEF_FONTS,
    onlyReadyKeys = true,
    loadImage,
    createCanvas = () => document.createElement('canvas'),
  } = {},
) {
  await loadBriefCardFonts(fonts)

  const selection = await collectBriefCardPhotos(idea?.images, {
    loadImage,
    onlyReadyKeys,
  })
  const { photos, overflowCount, skippedWebCount } = selection

  const canvas = createCanvas()
  canvas.width = width
  canvas.height = height
  let ctx = null
  try {
    ctx = canvas.getContext?.('2d') || null
  } catch {
    ctx = null
  }

  const measureText = ctx
    ? (text, fontSpec, fontSize) => {
        ctx.font = fontSpec
        const measured = ctx.measureText?.(text)?.width
        return typeof measured === 'number' && measured > 0
          ? measured
          : defaultMeasureText(text, fontSize)
      }
    : undefined

  const layout = layoutBriefCard(idea, {
    width,
    height,
    fonts,
    artists,
    photoCount: photos.length,
    skippedWebCount,
    photoNotes: photos.map((p) => p.note),
    overflowCount,
    measureText,
  })

  const drawn = ctx ? drawBriefCardOnCanvas(canvas, layout, photos) : false
  const blob = await canvasToPngBlob(canvas, drawn)
  const filename = briefCardFilename(idea)
  return {
    ...selection,
    blob,
    filename,
    layout,
    photoCount: photos.length,
  }
}

// Compatibility/imperative path; editor sharing uses its already-prepared PNG
// so navigator.share is reached synchronously from the user's tap.
export async function exportBriefCardImage(idea, options = {}) {
  const prepared = await prepareBriefCardImage(idea, options)
  const delivery = await shareOrDownloadBriefCard(prepared.blob, prepared.filename, options)
  return { ...prepared, ...delivery }
}
