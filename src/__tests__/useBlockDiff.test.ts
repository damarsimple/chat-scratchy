import { describe, it, expect } from 'vitest'
import { analyzeBlockDiff } from '../useBlockDiff'
import type { BlockData } from '../scratchPatterns'

function makeBlock(id: string): BlockData {
  return { id, type: 'test', category: 'other', inputs: {}, children: [] }
}

describe('analyzeBlockDiff', () => {
  it('returns unknown for history with < 2 entries', () => {
    expect(analyzeBlockDiff([])).toEqual({ status: 'unknown' })
    expect(analyzeBlockDiff([{ snapshot: [makeBlock('a')], at: 1 }])).toEqual({ status: 'unknown' })
  })

  it('returns no_change when snapshots are identical', () => {
    const history = [
      { snapshot: [makeBlock('a'), makeBlock('b')], at: 1 },
      { snapshot: [makeBlock('a'), makeBlock('b')], at: 2 },
    ]
    expect(analyzeBlockDiff(history)).toEqual({ status: 'no_change' })
  })

  it('returns reverted when current matches an older snapshot', () => {
    const history = [
      { snapshot: [makeBlock('a')], at: 1 },
      { snapshot: [makeBlock('a'), makeBlock('b')], at: 2 },
      { snapshot: [makeBlock('a')], at: 3 },
    ]
    expect(analyzeBlockDiff(history)).toEqual({ status: 'reverted' })
  })

  it('returns progressing when blocks are added', () => {
    const history = [
      { snapshot: [makeBlock('a')], at: 1 },
      { snapshot: [makeBlock('a'), makeBlock('b')], at: 2 },
    ]
    expect(analyzeBlockDiff(history)).toEqual({ status: 'progressing' })
  })

  it('returns deleting_more_than_adding when many blocks removed', () => {
    const history = [
      { snapshot: [makeBlock('a'), makeBlock('b'), makeBlock('c'), makeBlock('d')], at: 1 },
      { snapshot: [makeBlock('a')], at: 2 },
    ]
    expect(analyzeBlockDiff(history)).toEqual({ status: 'deleting_more_than_adding' })
  })
})
