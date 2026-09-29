import { compileRefinementPrompt, validateRefinementRequest, variantIdForJob } from '../../shared/imageJobs'

export const RESULT_VARIANT_PROVIDERS = [
  { id: 'chatgpt', label: 'ChatGPT' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'adobe-firefly', label: 'Adobe Firefly' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'claude', label: 'Claude' },
  { id: 'other', label: 'Other' },
]

let fallbackVariantIdCounter = 0

function clean(value) {
  return String(value || '').trim()
}

function normaliseProvider(provider) {
  return RESULT_VARIANT_PROVIDERS.some((item) => item.id === provider) ? provider : 'other'
}

function normaliseRating(value) {
  const rating = Number.parseInt(value, 10)
  if (Number.isNaN(rating)) return 0
  return Math.max(0, Math.min(5, rating))
}

function hasVariantContent(input) {
  return Boolean(clean(input.imageUrl) || clean(input.response) || clean(input.notes))
}

function isVariantObject(variant) {
  return Boolean(variant) && typeof variant === 'object' && !Array.isArray(variant)
}

function invalidMetadata() {
  throw new TypeError('invalid_variant_metadata')
}

function requireMetadata(condition) {
  if (!condition) invalidMetadata()
}

function validMetadataText(value, maxLength = 256) {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= maxLength
}

function matchesExactly(pattern, value) {
  return typeof value === 'string' && pattern.exec(value)?.[0] === value
}

function validTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value
}

function normaliseGeneration(input, trustedRelay, createdAt) {
  requireMetadata(isVariantObject(input) && input.version === 1
    && RESULT_VARIANT_PROVIDERS.some((item) => item.id === input.provider))
  const generation = { version: 1, provider: input.provider }
  for (const field of ['model', 'profileId']) {
    if (input[field] !== undefined || trustedRelay) {
      requireMetadata(field === 'model' ? validMetadataText(input[field], 128)
        : matchesExactly(/^[a-z][a-z0-9-]{0,63}$/, input[field]))
      generation[field] = input[field]
    }
  }
  const timestamp = input.createdAt === undefined && !trustedRelay ? createdAt : input.createdAt
  requireMetadata(validTimestamp(timestamp))
  generation.createdAt = timestamp
  generation.provenance = trustedRelay ? 'relay' : 'user-import'
  if (trustedRelay) {
    requireMetadata(input.provider === 'openai' && input.provenance === 'relay')
    try {
      variantIdForJob(input.jobId)
    } catch {
      invalidMetadata()
    }
    generation.jobId = input.jobId
  }
  return generation
}

// Saved metadata is intentionally smaller than the wire request. Build the
// wire-only fields temporarily to reuse its exact-text and combined-size checks.
function normaliseRefinement(input) {
  requireMetadata(isVariantObject(input))
  const { version, change, keep, palette } = input
  try {
    validateRefinementRequest({
      version, operation: 'refine', profileId: 'openai-refine-v1', change, keep, palette,
      prompt: compileRefinementPrompt({ change, keep, palette }),
    })
  } catch {
    invalidMetadata()
  }
  return { version, change, keep, palette }
}

function normaliseMetadata(input, options, createdAt) {
  const metadata = {}
  if (input.operation !== undefined) {
    requireMetadata(input.operation === 'refine')
    metadata.operation = input.operation
  }
  for (const field of ['parentVariantId', 'sourceConceptId']) {
    if (input[field] !== undefined) {
      requireMetadata((field === 'parentVariantId' && input[field] === null) || validMetadataText(input[field]))
      metadata[field] = input[field]
    }
  }
  if (input.sourceImageDigest !== undefined) {
    requireMetadata(matchesExactly(/^[0-9a-f]{64}$/, input.sourceImageDigest))
    metadata.sourceImageDigest = input.sourceImageDigest
  }
  if (input.refinement !== undefined) metadata.refinement = normaliseRefinement(input.refinement)
  // Only the owner-checked relay importer may opt in. User-selected provider
  // labels and supplied provenance/jobId on the normal path are attribution only.
  const trustedRelay = options.provenance === 'relay'
  if (input.generation !== undefined || trustedRelay) {
    metadata.generation = normaliseGeneration(input.generation, trustedRelay, createdAt)
  }
  return metadata
}

function generateVariantId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  fallbackVariantIdCounter += 1
  return `${Date.now()}-${fallbackVariantIdCounter}`
}

export function getProviderLabel(provider) {
  return RESULT_VARIANT_PROVIDERS.find((item) => item.id === provider)?.label || 'Other'
}

export function createConceptVariant(input, options = {}) {
  if (!hasVariantContent(input || {})) return null
  const createdAt = options.createdAt || new Date().toISOString()
  const metadata = normaliseMetadata(input, options, createdAt)
  let id = options.id || generateVariantId()
  if (options.provenance === 'relay') {
    id = variantIdForJob(metadata.generation.jobId)
    requireMetadata(options.id === undefined || options.id === id)
  }
  return {
    id,
    provider: normaliseProvider(input.provider || 'other'),
    title: clean(input.title),
    imageUrl: clean(input.imageUrl),
    response: clean(input.response),
    notes: clean(input.notes),
    rating: normaliseRating(input.rating),
    isBest: Boolean(input.isBest),
    createdAt,
    ...metadata,
  }
}

export function getConceptVariants(concept) {
  if (!Array.isArray(concept?.variants)) return []
  return concept.variants.every(isVariantObject) ? concept.variants : []
}

export function sortConceptVariants(variants = []) {
  return [...variants].sort((left, right) => {
    if (left.isBest && !right.isBest) return -1
    if (!left.isBest && right.isBest) return 1
    return new Date(right.createdAt || 0) - new Date(left.createdAt || 0)
  })
}

export function addConceptVariant(concept, input, options = {}) {
  const variant = createConceptVariant(input, options)
  if (!variant) return concept

  const existing = getConceptVariants(concept).map((item) => (
    variant.isBest ? { ...item, isBest: false } : item
  ))

  return { ...concept, variants: [variant, ...existing] }
}

// The caller supplies a normalized saved variant. Reconciliation must not
// overwrite any user edits or change an existing Best choice.
export function upsertRefinementVariant(concept, variant) {
  const existing = getConceptVariants(concept)
  if (existing.some((item) => item.id === variant.id)) return concept
  return { ...concept, variants: [variant, ...existing] }
}

export function markBestVariant(concept, variantId) {
  const variants = getConceptVariants(concept)
  if (!variants.some((variant) => variant.id === variantId)) return concept

  return {
    ...concept,
    variants: variants.map((variant) => ({
      ...variant,
      isBest: variant.id === variantId,
    })),
  }
}

export function updateVariantRating(concept, variantId, rating) {
  return {
    ...concept,
    variants: getConceptVariants(concept).map((variant) => (
      variant.id === variantId ? { ...variant, rating: normaliseRating(rating) } : variant
    )),
  }
}

export function removeConceptVariant(concept, variantId) {
  return {
    ...concept,
    variants: getConceptVariants(concept).filter((variant) => variant.id !== variantId),
  }
}
