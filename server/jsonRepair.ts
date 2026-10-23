/**
 * Small, deliberate clean-up for models in JSON mode (for example deepseek-chat), which can add text after the JSON
 * object or slightly overshoot a list or text length limit. Nothing here invents content, and the result is still
 * validated with Zod afterwards: values that are wrong in any other way are rejected as before.
 */

interface JsonSchema {
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  maxItems?: number
  maxLength?: number
}

/** Returns the first complete top-level JSON object in `text` (ignoring prose, code fences and anything after it). */
export function extractFirstJsonObject(text: string): unknown {
  const start = text.indexOf('{')
  if (start < 0) throw new Error('no JSON object')
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return JSON.parse(text.slice(start, i + 1))
  }
  throw new Error('unterminated JSON object')
}

const typeOf = (v: unknown): string => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v)

function pick(options: JsonSchema[] | undefined, data: unknown): JsonSchema | undefined {
  const t = typeOf(data)
  return options?.find((o) => (Array.isArray(o.type) ? o.type.includes(t) : o.type === t || (t === 'number' && o.type === 'integer')))
}

function cut(text: string, max: number): string {
  if (text.length <= max) return text
  const room = text.slice(0, max - 1)
  const space = room.lastIndexOf(' ')
  return `${(space > max * 0.6 ? room.slice(0, space) : room).trimEnd()}…`
}

/** Shortens over-long lists and texts to the limits stated in the JSON Schema; everything else is left untouched. */
export function conformToLimits(schema: JsonSchema, data: unknown): unknown {
  const s = pick(schema.anyOf ?? schema.oneOf, data) ?? schema
  if (typeof data === 'string') return s.maxLength !== undefined ? cut(data, s.maxLength) : data
  if (Array.isArray(data)) {
    const list = s.maxItems !== undefined ? data.slice(0, s.maxItems) : data
    return s.items ? list.map((x) => conformToLimits(s.items as JsonSchema, x)) : list
  }
  if (data !== null && typeof data === 'object' && s.properties) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(data)) out[k] = s.properties[k] ? conformToLimits(s.properties[k], v) : v
    return out
  }
  return data
}
