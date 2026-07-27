/**
 * useTTS — 文本转语音播放 Hook（分段朗读 + 预加载缓存 + 暂停/继续/重开）
 *
 * 按段落分割文本，每段 ≤ 512 字符，确保在句子边界断句。
 * 逐段调用 TTS API，播放当前段时同步预取下一段音频，确保连贯性。
 * 支持暂停、继续、重新开始。
 */
import { useRef, useState, useCallback, useEffect } from 'react'
import { getBaseUrl } from '../api/client'

type TTSState = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

const MAX_SEGMENT_LEN = 512
const SENTENCE_ENDINGS = /([。！？!?；;\n])/g

/** 将文本分割为 ≤ maxLen 的段，在句子边界断句 */
function splitTextIntoSegments(text: string, maxLen = MAX_SEGMENT_LEN): string[] {
  const segments: string[] = []
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)

  for (const para of paragraphs) {
    if (para.length <= maxLen) { segments.push(para); continue }

    const parts = para.split(SENTENCE_ENDINGS)
    const sentences: string[] = []
    let current = ''
    for (let i = 0; i < parts.length; i++) {
      current += parts[i]
      if (SENTENCE_ENDINGS.test(parts[i] || '')) { sentences.push(current.trim()); current = '' }
    }
    if (current.trim()) sentences.push(current.trim())

    let buf = ''
    for (const sentence of sentences) {
      if (sentence.length > maxLen) {
        if (buf.trim()) { segments.push(buf.trim()); buf = '' }
        for (let j = 0; j < sentence.length; j += maxLen) segments.push(sentence.slice(j, j + maxLen).trim())
      } else if ((buf + sentence).length > maxLen) {
        if (buf.trim()) { segments.push(buf.trim()); buf = '' }
        buf = sentence
      } else { buf += sentence }
    }
    if (buf.trim()) segments.push(buf.trim())
  }
  return segments.filter(Boolean)
}

// 缓存项：预取的音频 Blob + 对象 URL
type CacheEntry = { blob: Blob; url: string }

export function useTTS() {
  const [state, setState] = useState<TTSState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [segments, setSegments] = useState<string[]>([])

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const cancelledRef = useRef(false)
  const pausedRef = useRef(false)
  const segmentsRef = useRef<string[]>([])
  const voiceRef = useRef<string | undefined>(undefined)
  // 预取缓存：segment index → { blob, url }
  const cacheRef = useRef<Map<number, CacheEntry>>(new Map())
  // 当前正在进行的预取请求（用于取消）
  const prefetchAbortRef = useRef<AbortController | null>(null)

  /** 清理所有缓存 URL */
  const clearCache = useCallback(() => {
    for (const [, entry] of cacheRef.current) {
      URL.revokeObjectURL(entry.url)
    }
    cacheRef.current.clear()
  }, [])

  /** 清理指定索引之外的缓存 */
  const pruneCache = useCallback((keepIndex: number) => {
    for (const [idx, entry] of cacheRef.current) {
      if (idx !== keepIndex && idx !== keepIndex + 1) {
        URL.revokeObjectURL(entry.url)
        cacheRef.current.delete(idx)
      }
    }
  }, [])

  const cleanup = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    if (prefetchAbortRef.current) { prefetchAbortRef.current.abort(); prefetchAbortRef.current = null }
    clearCache()
  }, [clearCache])

  /** 获取指定段的音频（优先用缓存） */
  const fetchSegmentAudio = useCallback(async (index: number, segs: string[], voice?: string): Promise<CacheEntry> => {
    // 检查缓存
    const cached = cacheRef.current.get(index)
    if (cached) return cached

    // 同步获取
    const baseUrl = getBaseUrl()
    const res = await fetch(`${baseUrl}/api/tts/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: segs[index], ...(voice ? { voice } : {}) }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      throw new Error(err.detail || err.error || `TTS 请求失败 (${res.status})`)
    }

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const entry: CacheEntry = { blob, url }
    cacheRef.current.set(index, entry)
    return entry
  }, [])

  /** 预取下一段音频（非阻塞，失败静默） */
  const prefetchNext = useCallback((index: number, segs: string[], voice?: string) => {
    const nextIndex = index + 1
    if (nextIndex >= segs.length) return
    if (cacheRef.current.has(nextIndex)) return // 已缓存

    // 取消之前的预取
    if (prefetchAbortRef.current) prefetchAbortRef.current.abort()
    const ctrl = new AbortController()
    prefetchAbortRef.current = ctrl

    const baseUrl = getBaseUrl()
    fetch(`${baseUrl}/api/tts/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: segs[nextIndex], ...(voice ? { voice } : {}) }),
      signal: ctrl.signal,
    })
      .then((res) => res.blob())
      .then((blob) => {
        if (cancelledRef.current || ctrl.signal.aborted) return
        const url = URL.createObjectURL(blob)
        cacheRef.current.set(nextIndex, { blob, url })
      })
      .catch(() => { /* 预取失败静默，播放时会重试 */ })
  }, [])

  const stop = useCallback(() => {
    cancelledRef.current = true
    pausedRef.current = false
    cleanup()
    setState('idle')
    setCurrentIndex(-1)
    setSegments([])
    segmentsRef.current = []
  }, [cleanup])

  const pause = useCallback(() => {
    if (audioRef.current && state === 'playing') {
      audioRef.current.pause()
      pausedRef.current = true
      setState('paused')
    }
  }, [state])

  const resume = useCallback(() => {
    if (audioRef.current && state === 'paused') {
      pausedRef.current = false
      audioRef.current.play().catch(() => {})
      setState('playing')
    }
  }, [state])

  /** 从指定索引开始播放 */
  const playFromIndex = useCallback(async (startIndex: number, segs: string[], voice?: string) => {
    for (let i = startIndex; i < segs.length; i++) {
      if (cancelledRef.current) return

      // 暂停等待
      while (pausedRef.current && !cancelledRef.current) {
        await new Promise((r) => setTimeout(r, 200))
      }
      if (cancelledRef.current) return

      setCurrentIndex(i)

      // 检查缓存：如果有缓存直接播放（无 loading 态）
      const hasCache = cacheRef.current.has(i)
      if (!hasCache) setState('loading')

      try {
        // 获取音频（缓存命中则立即返回）
        const entry = await fetchSegmentAudio(i, segs, voice)
        if (cancelledRef.current) return

        // 立即预取下一段
        prefetchNext(i, segs, voice)

        // 清理旧缓存（只保留当前和下一段）
        pruneCache(i)

        // 播放
        const audio = new Audio(entry.url)
        audioRef.current = audio
        setState('playing')

        await new Promise<void>((resolve) => {
          audio.onended = () => { resolve() }
          audio.onerror = () => { resolve() }
          audio.play().catch(() => resolve())
        })

        if (cancelledRef.current) { audio.pause(); return }
      } catch (err) {
        if (cancelledRef.current) return
        setState('error')
        setError(err instanceof Error ? err.message : 'TTS 请求失败')
        return
      }
    }

    // 全部播放完毕
    if (!cancelledRef.current) {
      clearCache()
      setState('idle')
      setCurrentIndex(-1)
      setSegments([])
      segmentsRef.current = []
    }
  }, [fetchSegmentAudio, prefetchNext, pruneCache, clearCache])

  const restart = useCallback(() => {
    cleanup()
    pausedRef.current = false
    const segs = segmentsRef.current
    const voice = voiceRef.current
    if (segs.length > 0) {
      cancelledRef.current = false
      playFromIndex(0, segs, voice)
    }
  }, [cleanup, playFromIndex])

  const speak = useCallback(async (text: string, voice?: string) => {
    if (!text.trim()) return
    cancelledRef.current = false
    pausedRef.current = false
    cleanup()

    const segs = splitTextIntoSegments(text)
    if (segs.length === 0) return

    setSegments(segs)
    segmentsRef.current = segs
    voiceRef.current = voice
    setError(null)
    setState('loading')

    await playFromIndex(0, segs, voice)
  }, [cleanup, playFromIndex])

  // 组件卸载时清理
  useEffect(() => {
    return () => { cancelledRef.current = true; cleanup() }
  }, [cleanup])

  return {
    state,
    error,
    speak,
    stop,
    pause,
    resume,
    restart,
    segments,
    currentIndex,
    isPlaying: state === 'playing' || state === 'loading',
    isPaused: state === 'paused',
    isLoading: state === 'loading',
    progress: { current: currentIndex + 1, total: segments.length },
  }
}
