// On-device image embedder — the ONLY module allowed to touch
// @huggingface/transformers, and only via dynamic import so the ML runtime
// (and its model download) never enters the eager bundle. A contract test in
// src/test/styleIndex.test.js enforces this.
//
// Model choice: CLIP ViT-B/32 (q8). The issue-#19 spike showed CLIP and SigLIP
// organise the library equally well on same-artist retrieval (27.9% vs 27.2%,
// chance 2.7%) and CLIP is ~2× faster; revisit with a WebGPU benchmark if
// quality ever feels lacking. Changing EMBEDDING_MODEL_ID invalidates nothing —
// styleIndex keys vectors by model id, so old vectors are simply ignored.
export const EMBEDDING_MODEL_ID = 'Xenova/clip-vit-base-patch32'

let embedderPromise = null

// Returns an `embed(src) → unit vector (number[])` function, creating the
// pipeline once per session. WebGPU when available, WASM otherwise.
export function getEmbedder() {
  if (!embedderPromise) {
    embedderPromise = createEmbedder().catch((e) => {
      embedderPromise = null // allow retry after e.g. an offline model download failure
      throw e
    })
  }
  return embedderPromise
}

async function createEmbedder() {
  const { AutoProcessor, CLIPVisionModelWithProjection, RawImage } = await import('@huggingface/transformers')
  const processor = await AutoProcessor.from_pretrained(EMBEDDING_MODEL_ID)
  let model
  try {
    model = await CLIPVisionModelWithProjection.from_pretrained(EMBEDDING_MODEL_ID, { dtype: 'q8', device: 'webgpu' })
  } catch {
    model = await CLIPVisionModelWithProjection.from_pretrained(EMBEDDING_MODEL_ID, { dtype: 'q8' })
  }
  return async function embed(src) {
    const image = await readImage(src, RawImage)
    const inputs = await processor(image)
    const { image_embeds } = await model(inputs)
    const v = Array.from(image_embeds.data)
    const norm = Math.hypot(...v)
    return norm === 0 ? v : v.map((x) => x / norm)
  }
}

// RawImage.read uses createImageBitmap, which cannot decode SVGs (e.g. the
// demo artwork). Fall back to rasterising through an <img> + canvas, which
// renders anything the browser can display.
async function readImage(src, RawImage) {
  try {
    return await RawImage.read(src)
  } catch (e) {
    if (typeof document === 'undefined') throw e
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.crossOrigin = 'anonymous'
      el.onload = () => resolve(el)
      el.onerror = () => reject(e)
      el.src = src
    })
    const w = img.naturalWidth || 512
    const h = img.naturalHeight || 512
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, w, h)
    const { data } = ctx.getImageData(0, 0, w, h)
    return new RawImage(data, w, h, 4)
  }
}
