// Embeddings from BGE-M3 running in Ollama on this machine. Nothing leaves it.

export const MODEL = "bge-m3"
const OLLAMA = process.env.OLLAMA_HOST ?? "http://localhost:11434"

export type Embed = (texts: string[]) => Promise<Float32Array[]>

export const HOW_TO_START = `Ollama isn't running. Install it once (brew install ollama), start it (ollama serve, or open the app) and download the model once (ollama pull ${MODEL}).`

/** Whether Ollama is up with the model downloaded. */
export async function ollamaReady(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA}/api/tags`)
    const { models } = (await response.json()) as { models: { name: string }[] }
    return models.some((m) => m.name.startsWith(MODEL))
  } catch {
    return false
  }
}

export const embedWithOllama: Embed = async (texts) => {
  const response = await fetch(`${OLLAMA}/api/embed`, {
    method: "POST",
    body: JSON.stringify({ model: MODEL, input: texts }),
  })
  if (!response.ok) throw new Error(`Ollama: ${await response.text()}`)
  const { embeddings } = (await response.json()) as { embeddings: number[][] }
  return embeddings.map((e) => normalize(Float32Array.from(e)))
}

/** Scales a vector to length 1, so a dot product is its cosine similarity. */
export function normalize(vector: Float32Array): Float32Array {
  const length = Math.hypot(...vector) || 1
  return vector.map((x) => x / length)
}
