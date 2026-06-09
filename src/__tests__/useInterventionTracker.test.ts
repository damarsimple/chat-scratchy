import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useInterventionTracker } from '../useInterventionTracker'
import type { BlockData } from '../scratchPatterns'

function makeBlocks(ids: string[]): BlockData[] {
  return ids.map(id => ({ id, type: 'test', category: 'other', inputs: {}, children: [] }))
}

describe('useInterventionTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('records interventions', () => {
    const { result } = renderHook(() => useInterventionTracker())

    act(() => {
      result.current.recordIntervention(
        { patternId: 'test-pattern', message: 'hint' },
        makeBlocks(['a']),
      )
    })

    const recent = result.current.getRecentInterventions()
    expect(recent).toHaveLength(1)
    expect(recent[0].patternId).toBe('test-pattern')
  })

  it('resolves intervention as helped when blocks change', () => {
    const { result } = renderHook(() => useInterventionTracker())

    act(() => {
      result.current.recordIntervention(
        { patternId: 'p1', message: 'try something' },
        makeBlocks(['a']),
      )
    })

    // Advance past minimum elapsed time
    act(() => {
      vi.advanceTimersByTime(15_000)
    })

    act(() => {
      result.current.resolveWithBlockChange(makeBlocks(['a', 'b']))
    })

    const recent = result.current.getRecentInterventions()
    expect(recent[0].outcome).toBe('helped')
  })

  it('resolves intervention as ignored when blocks unchanged after timeout', () => {
    const { result } = renderHook(() => useInterventionTracker())

    act(() => {
      result.current.recordIntervention(
        { patternId: 'p1', message: 'hint' },
        makeBlocks(['a']),
      )
    })

    // Advance past ignore timeout (180s)
    act(() => {
      vi.advanceTimersByTime(200_000)
    })

    act(() => {
      result.current.resolveWithBlockChange(makeBlocks(['a']))
    })

    const recent = result.current.getRecentInterventions()
    expect(recent[0].outcome).toBe('ignored')
  })

  it('expirePending marks old interventions as ignored', () => {
    const { result } = renderHook(() => useInterventionTracker())

    act(() => {
      result.current.recordIntervention(
        { patternId: 'p1', message: 'hint' },
        makeBlocks(['a']),
      )
    })

    act(() => {
      vi.advanceTimersByTime(200_000)
    })

    act(() => {
      result.current.expirePending()
    })

    const recent = result.current.getRecentInterventions()
    expect(recent[0].outcome).toBe('ignored')
  })

  it('getEffectivenessRate computes correct percentage', () => {
    const { result } = renderHook(() => useInterventionTracker())

    // Record two interventions with the same initial snapshot
    act(() => {
      result.current.recordIntervention({ patternId: 'p1', message: 'h1' }, makeBlocks(['a']))
      result.current.recordIntervention({ patternId: 'p2', message: 'h2' }, makeBlocks(['a']))
    })

    // Advance past minimum elapsed time
    act(() => {
      vi.advanceTimersByTime(15_000)
    })

    // Resolve with changed blocks → both become 'helped' since both snapshots differ from new state
    act(() => {
      result.current.resolveWithBlockChange(makeBlocks(['a', 'new']))
    })

    expect(result.current.getEffectivenessRate()).toBe(100)

    // Now record a second round: one helped, one expired
    act(() => {
      result.current.recordIntervention({ patternId: 'p3', message: 'h3' }, makeBlocks(['x']))
    })

    // Advance past minimum, resolve with change → helped
    act(() => {
      vi.advanceTimersByTime(15_000)
    })
    act(() => {
      result.current.resolveWithBlockChange(makeBlocks(['x', 'y']))
    })

    // Record another, advance past timeout without block change, expire it
    act(() => {
      result.current.recordIntervention({ patternId: 'p4', message: 'h4' }, makeBlocks(['z']))
    })
    act(() => {
      vi.advanceTimersByTime(200_000)
    })
    act(() => {
      result.current.expirePending()
    })

    // 3 helped out of 4 resolved → 75%
    expect(result.current.getEffectivenessRate()).toBe(75)
  })

  it('getEffectivenessRate returns null when no resolved interventions', () => {
    const { result } = renderHook(() => useInterventionTracker())
    expect(result.current.getEffectivenessRate()).toBeNull()
  })
})
