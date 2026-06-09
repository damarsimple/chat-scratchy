import { describe, it, expect } from 'vitest'
import { runPatternMatcher, SCRATCH_PATTERNS } from '../scratchPatterns'
import type { BlockData } from '../scratchPatterns'

function makeBlock(type: string, category: string, opts?: Partial<BlockData>): BlockData {
  return {
    id: opts?.id ?? `b-${Math.random().toString(36).slice(2, 8)}`,
    type,
    category,
    inputs: opts?.inputs ?? {},
    children: opts?.children ?? [],
  }
}

describe('SCRATCH_PATTERNS', () => {
  it('has 5 patterns defined', () => {
    expect(SCRATCH_PATTERNS.length).toBe(5)
  })

  it('each pattern has required fields', () => {
    for (const p of SCRATCH_PATTERNS) {
      expect(p.id).toBeTruthy()
      expect(p.description).toBeTruthy()
      expect(['high', 'medium', 'low']).toContain(p.severity)
      expect(typeof p.detect).toBe('function')
      expect(p.hint).toBeTruthy()
    }
  })
})

describe('runPatternMatcher', () => {
  it('returns empty array for empty blocks', () => {
    expect(runPatternMatcher([])).toEqual([])
  })

  it('detects no_start_block when no hat and no loop', () => {
    const blocks = [makeBlock('scratch_movesteps', 'motion')]
    const matched = runPatternMatcher(blocks)
    expect(matched.some(p => p.id === 'no_start_block')).toBe(true)
  })

  it('does not detect no_start_block when hat exists', () => {
    const blocks = [makeBlock('event_whenflagclicked', 'event')]
    const matched = runPatternMatcher(blocks)
    expect(matched.some(p => p.id === 'no_start_block')).toBe(false)
  })

  it('detects motion_without_loop when motion + hat but no loop', () => {
    const blocks = [
      makeBlock('event_whenflagclicked', 'event'),
      makeBlock('scratch_movesteps', 'motion'),
    ]
    const matched = runPatternMatcher(blocks)
    expect(matched.some(p => p.id === 'motion_without_loop')).toBe(true)
  })

  it('does not detect motion_without_loop when loop exists', () => {
    const blocks = [
      makeBlock('event_whenflagclicked', 'event'),
      makeBlock('scratch_movesteps', 'motion'),
      makeBlock('controls_whileUntil', 'control'),
    ]
    const matched = runPatternMatcher(blocks)
    expect(matched.some(p => p.id === 'motion_without_loop')).toBe(false)
  })

  it('detects condition_without_loop when if exists but no loop', () => {
    const blocks = [
      makeBlock('event_whenflagclicked', 'event'),
      makeBlock('controls_if', 'control'),
    ]
    const matched = runPatternMatcher(blocks)
    expect(matched.some(p => p.id === 'condition_without_loop')).toBe(true)
  })

  it('detects sprite_offscreen when goto coordinates are out of range', () => {
    const blocks = [
      makeBlock('scratch_goto', 'motion', { inputs: { X: 300, Y: 0 } }),
    ]
    const matched = runPatternMatcher(blocks)
    expect(matched.some(p => p.id === 'sprite_offscreen')).toBe(true)
  })

  it('does not detect sprite_offscreen when coordinates are in range', () => {
    const blocks = [
      makeBlock('scratch_goto', 'motion', { inputs: { X: 100, Y: 100 } }),
    ]
    const matched = runPatternMatcher(blocks)
    expect(matched.some(p => p.id === 'sprite_offscreen')).toBe(false)
  })
})
