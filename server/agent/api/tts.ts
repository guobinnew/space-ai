/**
 * TTS API — 将文本合成为语音
 *
 * POST /api/tts/speak  { text, voice? }
 *   → 调用当前激活 Provider 的 TTS 模型
 *   → 返回音频
 *
 * 支持两种 TTS 格式：
 *   1. OpenAI 兼容: POST {baseUrl}/audio/speech → 返回 audio/mpeg 二进制流
 *   2. MiMo: POST {baseUrl}/chat/completions → 返回 JSON { choices[].message.audio.data } base64
 */

import { ProviderService } from '../services/providerService'

const providerSvc = new ProviderService()

function isMiMo(nameOrModel: string): boolean {
  return nameOrModel.toLowerCase().includes('mimo')
}

/** OpenAI 兼容 TTS */
async function openaiTTS(baseUrl: string, apiKey: string, model: string, input: string, voice: string): Promise<Response> {
  const url = `${baseUrl.replace(/\/+$/, '')}/audio/speech`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input, voice }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    return Response.json({ error: 'TTS API error', status: res.status, detail: err.slice(0, 500) }, { status: 502 })
  }
  const audio = await res.arrayBuffer()
  return new Response(audio, {
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Length': audio.byteLength.toString(),
      'Cache-Control': 'no-cache',
    },
  })
}

/** MiMo TTS — 通过 chat/completions 接口 */
async function mimoTTS(baseUrl: string, apiKey: string, model: string, input: string, voice: string): Promise<Response> {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'user', content: '用自然的语气朗读' },
        { role: 'assistant', content: input },
      ],
      audio: { format: 'wav', voice: voice || 'mimo_default' },
      stream: false,
    }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    return Response.json({ error: 'MiMo TTS error', status: res.status, detail: err.slice(0, 500) }, { status: 502 })
  }
  const json = await res.json() as { choices?: Array<{ message?: { audio?: { data?: string } } }> }
  const base64Data = json?.choices?.[0]?.message?.audio?.data
  if (!base64Data) {
    return Response.json({ error: 'MiMo TTS response missing audio data' }, { status: 502 })
  }
  const audio = Buffer.from(base64Data, 'base64')
  return new Response(audio, {
    headers: {
      'Content-Type': 'audio/wav',
      'Content-Length': audio.length.toString(),
      'Cache-Control': 'no-cache',
    },
  })
}

export async function handleTtsApi(req: Request, url: URL): Promise<Response> {
  try {
    if (req.method !== 'POST' || !url.pathname.endsWith('/speak')) {
      return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405 })
    }

    const body = await req.json() as { text?: string; voice?: string }
    if (!body.text?.trim()) {
      return Response.json({ error: 'Missing "text" field' }, { status: 400 })
    }

    // 获取默认 Provider 的 TTS 配置
    const { providers, defaultId } = await providerSvc.listProviders()
    const active = defaultId ? providers.find((p) => p.id === defaultId) : undefined
    if (!active) {
      return Response.json({ error: 'No active provider' }, { status: 400 })
    }

    const modelId = active.models.tts
    if (!modelId) {
      return Response.json({ error: 'Active provider has no TTS model configured' }, { status: 400 })
    }

    const baseUrl = (active.ttsBaseUrl || active.baseUrl).replace(/\/+$/, '')
    const voice = body.voice || active.ttsVoice || 'alloy'

    // 根据 Provider 特征选择 TTS 实现
    if (isMiMo(active.name) || isMiMo(modelId)) {
      console.log(`[TTS] MiMo mode: model=${modelId}, voice=${voice}, baseUrl=${baseUrl}`)
      return await mimoTTS(baseUrl, active.apiKey, modelId, body.text, voice)
    }
    console.log(`[TTS] OpenAI mode: model=${modelId}, voice=${voice}, baseUrl=${baseUrl}`)
    return await openaiTTS(baseUrl, active.apiKey, modelId, body.text, voice)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: 'TTS error', detail: msg }, { status: 500 })
  }
}
