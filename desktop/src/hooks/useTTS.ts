/**
 * useTTS — 文本转语音播放 Hook（分段朗读 + 暂停/继续/重开）
 *
 * 按段落分割文本，每段 ≤ 512 字符，确保在句子边界断句。
 * 逐段调用 TTS API，前一段播放完成后自动播放下一段。
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

  const cleanup = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
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

  const restart = useCallback(() => {
    cleanup()
    pausedRef.current = false
    // 重新从第一段开始
    const segs = segmentsRef.current
    const voice = voiceRef.current
    if (segs.length > 0) {
      cancelledRef.current = false
      playFromIndex(0, segs, voice)
    }
  }, [])

  /** 从指定索引开始播放 */
  const playFromIndex = useCallback(async (startIndex: number, segs: string[], voice?: string) => {
    const baseUrl = getBaseUrl()

    for (let i = startIndex; i < segs.length; i++) {
      if (cancelledRef.current) return
      // 如果暂停了，等待恢复
      while (pausedRef.current && !cancelledRef.current) {
        await new Promise((r) => setTimeout(r, 200))
      }
      if (cancelledRef.current) return

      setCurrentIndex(i)
      setState('loading')

      try {
        const res = await fetch(`${baseUrl}/api/tts/speak`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: segs[i], ...(voice ? { voice } : {}) }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          throw new Error(err.detail || err.error || `TTS 请求失败 (${res.status})`)
        }
        if (cancelledRef.current) return

        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioRef.current = audio
        setState('playing')

        // 等待播放完毕或暂停
        await new Promise<void>((resolve) => {
          audio.onended = () => { URL.revokeObjectURL(url); resolve() }
          audio.onerror = () => { URL.revokeObjectURL(url); resolve() }
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

    if (!cancelledRef.current) {
      setState('idle')
      setCurrentIndex(-1)
      setSegments([])
      segmentsRef.current = []
    }
  }, [])

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
