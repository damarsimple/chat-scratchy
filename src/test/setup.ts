import '@testing-library/jest-dom/vitest'

// Stub TextDecoder/TextEncoder (used by streaming code)
if (typeof globalThis.TextDecoder === 'undefined') {
  const { TextDecoder, TextEncoder } = await import('util')
  globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder
  globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder
}
