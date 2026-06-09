import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useI18n } from '../i18n'

describe('useI18n', () => {
  it('returns default lang zh', () => {
    const { result } = renderHook(() => useI18n())
    expect(result.current.lang).toBe('zh')
  })

  it('translates known keys in zh', () => {
    const { result } = renderHook(() => useI18n())
    expect(result.current.t('Chats')).toBe('聊天')
    expect(result.current.t('Settings')).toBe('設定')
    expect(result.current.t('Error')).toBe('錯誤')
  })

  it('translates known keys in en', () => {
    const { result } = renderHook(() => useI18n())
    expect(result.current.t('objective_animation_label')).toBe('簡單動畫')
  })

  it('returns key when translation is missing', () => {
    const { result } = renderHook(() => useI18n())
    expect(result.current.t('nonexistent_key_xyz')).toBe('nonexistent_key_xyz')
  })
})
