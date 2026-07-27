/**
 * useTTS — 文本转语音播放 Hook
 *
 * 调用服务端 TTS API 获取音频，通过 HTMLAudioElement 播放
 */
import { useRef, useState, useCallback } from 'react'
import { getBaseUrl } from '../api/client'

type TTSState = 'idle' | 'loading' | 'playing' | 'error'

export function useTTS() {
  const [state, setState] = useState<TTSState>('idle')
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const speak = useCallback(async (text: string, voice = 'alloy') => {
    if (!text.trim()) return

    // 停止当前播放
    stop()

    setState('loading')
    setError(null)

    try {
      const baseUrl = await getBaseUrl()
      const res = await fetch(`${baseUrl}/api/tts/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(err.error || err.message || 'TTS 请求失败')
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)

      audio.onended = () => {
        setState('idle')
        URL.revokeObjectURL(url)
      }
      audio.onerror = () => {
        setState('error')
        setError('音频播放失败')
        URL.revokeObjectURL(url)
      }

      audioRef.current = audio
      await audio.play()
      setState('playing')
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'TTS 请求失败')
    }
  }, [])

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setState('idle')
  }, [])

  return { state, error, speak, stop, isPlaying: state === 'playing', isLoading: state === 'loading' }
}
