import { describe, it, expect } from 'vitest'
import { checkObjective, hasObjectiveCheck } from '../objectives'
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

function makeHat(type = 'event_whenflagclicked') {
  return makeBlock(type, 'event')
}

function makeLoop(type = 'controls_whileUntil') {
  return makeBlock(type, 'control')
}

function makeMotion(type = 'scratch_movesteps') {
  return makeBlock(type, 'motion')
}

function makeSensing(type = 'scratch_touchingmouse') {
  return makeBlock(type, 'sensing')
}

function makeIf() {
  return makeBlock('controls_if', 'control')
}

function makeAskWait() {
  return makeBlock('scratch_askandwait', 'sensing')
}

function makeAnswer() {
  return makeBlock('scratch_answer', 'sensing')
}

function makeLogicCompare() {
  return makeBlock('logic_compare', 'logic')
}

function makeGoto() {
  return makeBlock('scratch_goto', 'motion')
}

function makeKey() {
  return makeBlock('event_whenkeypressed', 'event')
}

function makeBounce() {
  return makeBlock('scratch_ifonedgebounce', 'motion')
}

function makeChangeY() {
  return makeBlock('scratch_changey', 'motion')
}

function makeCostume(type = 'scratch_nextcostume') {
  return makeBlock(type, 'looks')
}

describe('checkObjective', () => {
  it('returns null for null/undefined objectiveId', () => {
    expect(checkObjective(null, [])).toBeNull()
    expect(checkObjective(undefined, [])).toBeNull()
  })

  it('returns null for unknown objective id', () => {
    expect(checkObjective('nonexistent', [makeHat()])).toBeNull()
  })

  it('returns {progress: 0, complete: false} for empty blocks', () => {
    const result = checkObjective('animation', [])
    expect(result).toEqual({ progress: 0, complete: false })
  })

  describe('animation objective', () => {
    it('completes with hat + motion + loop', () => {
      const blocks = [makeHat(), makeLoop(), makeMotion()]
      const result = checkObjective('animation', blocks)
      expect(result?.complete).toBe(true)
      expect(result?.progress).toBe(1)
    })

    it('completes with hat + motion + costume', () => {
      const blocks = [makeHat(), makeCostume(), makeMotion()]
      const result = checkObjective('animation', blocks)
      expect(result?.complete).toBe(true)
    })

    it('incomplete with only hat + motion (no loop or costume)', () => {
      const blocks = [makeHat(), makeMotion()]
      const result = checkObjective('animation', blocks)
      expect(result?.complete).toBe(false)
      expect(result!.progress).toBeGreaterThan(0)
    })
  })

  describe('cat-mouse objective', () => {
    it('completes with all components', () => {
      const blocks = [makeHat(), makeLoop(), makeGoto(), makeIf()]
      const result = checkObjective('cat-mouse', blocks)
      expect(result?.complete).toBe(true)
    })

    it('incomplete without conditional', () => {
      const blocks = [makeHat(), makeLoop(), makeGoto()]
      const result = checkObjective('cat-mouse', blocks)
      expect(result?.complete).toBe(false)
    })
  })

  describe('quiz objective', () => {
    it('completes with hat + ask + if + answer', () => {
      const blocks = [makeHat(), makeAskWait(), makeIf(), makeAnswer()]
      const result = checkObjective('quiz', blocks)
      expect(result?.complete).toBe(true)
    })
  })

  describe('pong objective', () => {
    it('completes with hat + loop + bounce + key', () => {
      const blocks = [makeHat(), makeLoop(), makeBounce(), makeKey()]
      const result = checkObjective('pong', blocks)
      expect(result?.complete).toBe(true)
    })
  })

  describe('falling objective', () => {
    it('completes with hat + loop + changeY + if', () => {
      const blocks = [makeHat(), makeLoop(), makeChangeY(), makeIf()]
      const result = checkObjective('falling', blocks)
      expect(result?.complete).toBe(true)
    })
  })
})

describe('hasObjectiveCheck', () => {
  it('returns true for known check keys', () => {
    expect(hasObjectiveCheck('animation')).toBe(true)
    expect(hasObjectiveCheck('cat-mouse')).toBe(true)
    expect(hasObjectiveCheck('quiz')).toBe(true)
    expect(hasObjectiveCheck('pong')).toBe(true)
    expect(hasObjectiveCheck('falling')).toBe(true)
  })

  it('returns false for unknown keys', () => {
    expect(hasObjectiveCheck('unknown')).toBe(false)
    expect(hasObjectiveCheck(null)).toBe(false)
    expect(hasObjectiveCheck(undefined)).toBe(false)
  })
})
