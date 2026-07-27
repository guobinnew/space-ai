/**
 * useTTS — 文本转语音播放 Hook（分段朗读）
 *
 * 按段落分割文本，每段 ≤ 512 字符，确保在句子边界断句。
 * 逐段调用 TTS API，前一段播放完成后自动播放下一段。
 */
import { useRef, useState, useCallback } from 'react'
import { getBaseUrl } from '../api/client'

type TTSState = 'idle' | 'loading' | 'playing' | 'error'

const MAX_SEGMENT_LEN = 512

// 句子结束符（中英文）
const SENTENCE_ENDINGS = /([。！？!?；;\n])/g

/**
 * 将文本分割为 ≤ maxLen 的段，在句子边界断句
 */
function splitTextIntoSegments(text: string, maxLen = MAX_SEGMENT_LEN): string[] {
  const segments: string[] = []

  // 1. 按段落分割（空行分隔）
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)

  for (const para of paragraphs) {
    if (para.length <= maxLen) {
      segments.push(para)
      continue
    }

    // 2. 段落太长，按句子分割
    // 用正则保留分隔符：把句子和结束符拼回去
    const parts = para.split(SENTENCE_ENDINGS)
    const sentences: string[] = []
    let current = ''
    for (let i = 0; i < parts.length; i++) {
      current += parts[i]
      // 如果当前 part 是结束符，结束当前句子
      if (SENTENCE_ENDINGS.test(parts[i] || '')) {
        sentences.push(current.trim())
        current = ''
      }
    }
    if (current.trim()) sentences.push(current.trim())

    // 3. 合并短句 / 拆分长句
    let buf = ''
    for (const sentence of sentences) {
      if (sentence.length > maxLen) {
        // 先把缓冲区冲掉
        if (buf.trim()) { segments.push(buf.trim()); buf = '' }
        // 长句硬切
        for (let j = 0; j < sentence.length; j += maxLen) {
          segments.push(sentence.slice(j, j + maxLen).trim())
        }
      } else if ((buf + sentence).length > maxLen) {
        // 加上这句就超了，先冲掉缓冲区
        if (buf.trim()) { segments.push(buf.trim()); buf = '' }
        buf = sentence
      } else {
        buf += sentence
      }
    }
    if (buf.trim()) segments.push(buf.trim())
  }

  return segments.filter(Boolean)
}

export function useTTS() {
  const [state, setState] = useState<TTSState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 })
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const cancelledRef = useRef(false)

  const stop = useCallback(() => {
    cancelledRef.current = true
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setState('idle')
    setProgress({ current: 0, total: 0 })
  }, [])

  const speak = useCallback(async (text: string, voice?: string) => {
    if (!text.trim()) return

    // 停止当前播放
    cancelledRef.current = false
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    // 分段
    const segments = splitTextIntoSegments(text)
    if (segments.length === 0) return

    setProgress({ current: 0, total: segments.length })
    setState('loading')
    setError(null)

    const baseUrl = getBaseUrl()

    for (let i = 0; i < segments.length; i++) {
      if (cancelledRef.current) return

      setProgress({ current: i + 1, total: segments.length })
      setState('loading')

      try {
        const res = await fetch(`${baseUrl}/api/tts/speak`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: segments[i], ...(voice ? { voice } : {}) }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          throw new Error(err.detail || err.error || err.message || `TTS 请求失败 (${res.status})`)
        }

        if (cancelledRef.current) return

        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioRef.current = audio

        // 等待当前段播放完毕再继续下一段
        await new Promise<void>((resolve) => {
          audio.onended = () => { URL.revokeObjectURL(url); resolve() }
          audio.onerror = () => { URL.revokeObjectURL(url); resolve() }
          audio.play().catch(() => resolve())
        })

        if (cancelledRef.current) {
          audio.pause()
          return
        }
      } catch (err) {
        if (cancelledRef.current) return
        setState('error')
        setError(err instanceof Error ? err.message : 'TTS 请求失败')
        return
      }
    }

    if (!cancelledRef.current) {
      setState('idle')
      setProgress({ current: 0, total: 0 })
    }
  }, [])

  return {
    state,
    error,
    speak,
    stop,
    progress,
    isPlaying: state === 'playing' || state === 'loading',
    isLoading: state === 'loading',
  }
}
