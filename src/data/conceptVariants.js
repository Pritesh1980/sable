export const RESULT_VARIANT_PROVIDERS = [
  { id: 'chatgpt', label: 'ChatGPT' },
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

  return {
    id: options.id || generateVariantId(),
    provider: normaliseProvider(input.provider || 'other'),
    title: clean(input.title),
    imageUrl: clean(input.imageUrl),
    response: clean(input.response),
    notes: clean(input.notes),
    rating: normaliseRating(input.rating),
    isBest: Boolean(input.isBest),
    createdAt: options.createdAt || new Date().toISOString(),
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
