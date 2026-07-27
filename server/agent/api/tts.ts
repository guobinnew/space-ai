/**
 * TTS API — 将文本合成为语音
 *
 * POST /api/tts/speak  { text }
 *   → 调用当前激活 Provider 的 TTS 模型
 *   → 返回音频流 (audio/mpeg)
 *
 * 支持的 API 格式：OpenAI-compatible TTS (POST /audio/speech)
 */

import { ProviderService } from '../services/providerService'

const TTS_ENDPOINT = '/audio/speech'
const providerSvc = new ProviderService()

export async function handleTtsApi(req: Request, url: URL): Promise<Response> {
  try {
    if (req.method !== 'POST' || !url.pathname.endsWith('/speak')) {
      return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405 })
    }

    const body = await req.json() as { text?: string; voice?: string }
    if (!body.text?.trim()) {
      return Response.json({ error: 'Missing "text" field' }, { status: 400 })
    }

    // 获取激活 Provider 的 TTS 配置
    const { providers, activeId } = await providerSvc.listProviders()
    const active = activeId ? providers.find((p) => p.id === activeId) : undefined
    if (!active) {
      return Response.json({ error: 'No active provider' }, { status: 400 })
    }

    const modelId = active.models.tts
    if (!modelId) {
      return Response.json({ error: 'Active provider has no TTS model configured' }, { status: 400 })
    }

    const baseUrl = (active.ttsBaseUrl || active.baseUrl).replace(/\/+$/, '')
    const apiKey = active.apiKey
    const voice = body.voice || 'alloy'

    // 调用 TTS API
    const ttsUrl = `${baseUrl}${TTS_ENDPOINT}`
    const ttsRes = await fetch(ttsUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        input: body.text,
        voice,
      }),
    })

    if (!ttsRes.ok) {
      const errText = await ttsRes.text().catch(() => '')
      return Response.json({
        error: 'TTS API error',
        status: ttsRes.status,
        detail: errText.slice(0, 500),
      }, { status: 502 })
    }

    // 返回音频流
    const audioBuffer = await ttsRes.arrayBuffer()
    return new Response(audioBuffer, {
      headers: {
        'Content-Type': ttsRes.headers.get('Content-Type') || 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'Cache-Control': 'no-cache',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: 'TTS error', detail: msg }, { status: 500 })
  }
}
