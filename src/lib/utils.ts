type ClassValue = string | number | bigint | boolean | null | undefined | Record<string, unknown> | ClassValue[]

function toClassName(value: ClassValue): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  if (typeof value === 'boolean' || value == null) return ''
  if (Array.isArray(value)) return value.map(toClassName).filter(Boolean).join(' ')
  return Object.entries(value)
    .filter(([, v]) => Boolean(v))
    .map(([k]) => k)
    .join(' ')
}

export function cn(...inputs: ClassValue[]): string {
  return inputs.map(toClassName).filter(Boolean).join(' ')
}
