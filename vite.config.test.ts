import { describe, expect, it } from 'vitest'
import { normalizeBasePath } from './vite.config'

describe('normalizeBasePath', () => {
  it.each([
    [undefined, '/'],
    ['', '/'],
    ['/', '/'],
    ['chat-screenshot-generator', '/chat-screenshot-generator/'],
    ['/chat-screenshot-generator', '/chat-screenshot-generator/'],
    ['/chat-screenshot-generator/', '/chat-screenshot-generator/'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeBasePath(input)).toBe(expected)
  })
})
