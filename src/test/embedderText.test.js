import { describe, it, expect, vi, beforeEach } from 'vitest'

// The real package downloads tens of MB of model; the text half is mocked here
// so the embedder's own logic (model id, normalising, retry) is what's tested.
const tokenizerFrom = vi.fn()
const textModelFrom = vi.fn()

vi.mock('@huggingface/transformers', () => ({
  AutoTokenizer: { from_pretrained: (...args) => tokenizerFrom(...args) },
  CLIPTextModelWithProjection: { from_pretrained: (...args) => textModelFrom(...args) },
}))

async function freshEmbedder() {
  vi.resetModules()
  return import('../data/embedder')
}

beforeEach(() => {
  tokenizerFrom.mockReset()
  textModelFrom.mockReset()
  tokenizerFrom.mockResolvedValue((texts, opts) => ({ texts, opts }))
  textModelFrom.mockResolvedValue(async () => ({ text_embeds: { data: Float32Array.from([3, 4]) } }))
})

describe('getTextEmbedder', () => {
  it('loads the text half of the same CLIP model as the image index', async () => {
    const { getTextEmbedder, EMBEDDING_MODEL_ID } = await freshEmbedder()
    await getTextEmbedder()
    expect(tokenizerFrom).toHaveBeenCalledWith(EMBEDDING_MODEL_ID, expect.anything())
    expect(textModelFrom).toHaveBeenCalledWith(EMBEDDING_MODEL_ID, expect.objectContaining({ dtype: 'q8' }))
  })

  it('returns a unit vector for a phrase', async () => {
    const { getTextEmbedder } = await freshEmbedder()
    const embedText = await getTextEmbedder()
    const vec = await embedText('skull')
    expect(vec[0]).toBeCloseTo(0.6)
    expect(vec[1]).toBeCloseTo(0.8)
  })

  it('tokenises the bare phrase, padded and truncated to CLIP\'s length', async () => {
    const seen = []
    textModelFrom.mockResolvedValue(async (inputs) => {
      seen.push(inputs)
      return { text_embeds: { data: [1, 0] } }
    })
    const { getTextEmbedder } = await freshEmbedder()
    await (await getTextEmbedder())('wolf')
    expect(seen[0]).toEqual({ texts: ['wolf'], opts: { padding: true, truncation: true } })
  })

  it('loads the model once per session', async () => {
    const { getTextEmbedder } = await freshEmbedder()
    await Promise.all([getTextEmbedder(), getTextEmbedder()])
    expect(textModelFrom).toHaveBeenCalledTimes(1)
  })

  it('passes download progress on as a percentage', async () => {
    textModelFrom.mockImplementation(async (_id, { progress_callback }) => {
      progress_callback({ status: 'progress', file: 'onnx/text_model_quantized.onnx', progress: 42.4 })
      progress_callback({ status: 'done', file: 'onnx/text_model_quantized.onnx' })
      return async () => ({ text_embeds: { data: [1, 0] } })
    })
    const { getTextEmbedder } = await freshEmbedder()
    const onProgress = vi.fn()
    await getTextEmbedder({ onProgress })
    expect(onProgress).toHaveBeenCalledWith(42)
  })

  it('can be retried after a failed download', async () => {
    // Offline: the WebGPU attempt and the WASM fallback both fail.
    textModelFrom.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'))
    const { getTextEmbedder } = await freshEmbedder()
    await expect(getTextEmbedder()).rejects.toThrow('offline')
    await expect(getTextEmbedder()).resolves.toBeTypeOf('function')
  })
})
