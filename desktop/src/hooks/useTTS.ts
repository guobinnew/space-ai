/**
 * useTTS — 文本转语音播放 Hook
 *
 * 长度窗口缓存机制：
 *   播放当前段时，后台按窗口大小（WINDOW_CHARS）预取后续段。
 *   累计已缓存段的总字符数，未达窗口则继续预取；
 *   消费一段后从累计中扣除其长度，触发补充预取。
 */
import { useRef, useState, useCallback, useEffect } from 'react'
import { getBaseUrl } from '../api/client'

type TTSState = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

const MAX_SEGMENT_LEN = 512
const SENTENCE_ENDINGS = /([。！？!?；;\n])/g
/** 预取窗口：累计缓存段的总字符数达到此值后停止预取 */
const WINDOW_CHARS = 128 * 1024

/** 将文本分割为 ≤ maxLen 的段 */
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

  // 缓存
  const cacheRef = useRef<Map<number, CacheEntry>>(new Map())
  // 已缓存段的总字符数
  const cachedCharsRef = useRef(0)
  // 下一个要预取的段索引
  const nextPrefetchIdxRef = useRef(0)
  // 预取锁（防止并发预取）
  const prefetchingRef = useRef(false)

  const clearCache = useCallback(() => {
    for (const [, entry] of cacheRef.current) URL.revokeObjectURL(entry.url)
    cacheRef.current.clear()
    cachedCharsRef.current = 0
    nextPrefetchIdxRef.current = 0
  }, [])

  const cleanup = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    clearCache()
  }, [clearCache])

  /** 获取指定段音频（优先缓存） */
  const fetchSegmentAudio = useCallback(async (index: number, segs: string[], voice?: string): Promise<CacheEntry> => {
    const cached = cacheRef.current.get(index)
    if (cached) return cached

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

  /**
   * 预取循环：按窗口大小预取后续段
   * 从 nextPrefetchIdxRef 开始，累计字符数直到 ≥ WINDOW_CHARS
   */
  const refillCache = useCallback(async (segs: string[], voice?: string) => {
    if (prefetchingRef.current) return
    prefetchingRef.current = true

    try {
      while (
        !cancelledRef.current &&
        cachedCharsRef.current < WINDOW_CHARS &&
        nextPrefetchIdxRef.current < segs.length
      ) {
        const idx = nextPrefetchIdxRef.current
        if (cacheRef.current.has(idx)) {
          // 已缓存（可能由 fetchSegmentAudio 同步获取过），只累加长度
          cachedCharsRef.current += segs[idx]?.length || 0
          nextPrefetchIdxRef.current++
          continue
        }
        // 同步获取并存入缓存
        const entry = await fetchSegmentAudio(idx, segs, voice)
        if (cancelledRef.current) break
        cachedCharsRef.current += segs[idx]?.length || 0
        nextPrefetchIdxRef.current++
      }
    } finally {
      prefetchingRef.current = false
    }
  }, [fetchSegmentAudio])

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
    // 初始化预取起点
    nextPrefetchIdxRef.current = startIndex
    cachedCharsRef.current = 0

    for (let i = startIndex; i < segs.length; i++) {
      if (cancelledRef.current) return
      while (pausedRef.current && !cancelledRef.current) {
        await new Promise((r) => setTimeout(r, 200))
      }
      if (cancelledRef.current) return

      setCurrentIndex(i)
      const hasCache = cacheRef.current.has(i)
      if (!hasCache) setState('loading')

      try {
        const entry = await fetchSegmentAudio(i, segs, voice)
        if (cancelledRef.current) return

        // 启动后台预取（填充窗口）
        refillCache(segs, voice)

        // 播放
        const audio = new Audio(entry.url)
        audioRef.current = audio
        setState('playing')

        await new Promise<void>((resolve) => {
          audio.onended = () => resolve()
          audio.onerror = () => resolve()
          audio.play().catch(() => resolve())
        })

        if (cancelledRef.current) { audio.pause(); return }

        // 消费完毕：从缓存中移除，扣减累计长度
        cacheRef.current.delete(i)
        cachedCharsRef.current = Math.max(0, cachedCharsRef.current - (segs[i]?.length || 0))
        URL.revokeObjectURL(entry.url)

        // 触发补充预取（窗口有空位了）
        refillCache(segs, voice)
      } catch (err) {
        if (cancelledRef.current) return
        setState('error')
        setError(err instanceof Error ? err.message : 'TTS 请求失败')
        return
      }
    }

    if (!cancelledRef.current) {
      clearCache()
      setState('idle')
      setCurrentIndex(-1)
      setSegments([])
      segmentsRef.current = []
    }
  }, [fetchSegmentAudio, refillCache, clearCache])

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

  useEffect(() => {
    return () => { cancelledRef.current = true; cleanup() }
  }, [cleanup])

  return {
    state, error, speak, stop, pause, resume, restart,
    segments, currentIndex,
    isPlaying: state === 'playing' || state === 'loading',
    isPaused: state === 'paused',
    isLoading: state === 'loading',
    progress: { current: currentIndex + 1, total: segments.length },
  }
}
