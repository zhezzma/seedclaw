import { generateSecMsGecToken, TRUSTED_CLIENT_TOKEN, CHROMIUM_FULL_VERSION } from './drm.ts'

type configure = {
  voice?: string
  lang?: string
  outputFormat?: string
  rate?: string
  pitch?: string
  volume?: string
  timeout?: number
}

class EdgeTTS {
  private voice: string
  private lang: string
  private outputFormat: string
  private rate: string
  private pitch: string
  private volume: string
  private timeout: number

  constructor({
    voice = 'zh-CN-XiaoyiNeural',
    lang = 'zh-CN',
    outputFormat = 'audio-24khz-48kbitrate-mono-mp3',
    rate = 'default',
    pitch = 'default',
    volume = 'default',
    timeout = 30000
  }: configure = {}) {
    this.voice = voice
    this.lang = lang
    this.outputFormat = outputFormat
    this.rate = rate
    this.pitch = pitch
    this.volume = volume
    this.timeout = timeout
  }

  async _connectWebSocket(): Promise<WebSocket | any> {
    const secToken = await generateSecMsGecToken()
    const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secToken}&Sec-MS-GEC-Version=1-${CHROMIUM_FULL_VERSION}`

    const configMessage = `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n
            {
              "context": {
                "synthesis": {
                  "audio": {
                    "metadataoptions": {
                      "sentenceBoundaryEnabled": "false",
                      "wordBoundaryEnabled": "true"
                    },
                    "outputFormat": "${this.outputFormat}"
                  }
                }
              }
            }
          `

    // @ts-ignore - Use Tauri plugin to set custom User-Agent with "Edg/" (required by server)
    const isTauri = !!(window.__TAURI_INTERNALS__ || window.__TAURI__)

    if (isTauri) {
      // Tauri WebSocket Plugin - allows setting custom headers including User-Agent
      const module = await import('@tauri-apps/plugin-websocket')
      const TauriWebSocket = module.default

      const ws = await TauriWebSocket.connect(url, {
        headers: {
          "Pragma": "no-cache",
          "Cache-Control": "no-cache",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0",
          "Origin": "http://localhost:1420",
          "Accept-Encoding": "gzip, deflate, br, zstd",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
        }
      })

      // Message queue for early messages before handler is set
      let messageQueue: any[] = []
      let messageHandler: ((ev: MessageEvent) => void) | null = null

      const adapter: any = {
        readyState: 1,
        send: async (data: string | ArrayBuffer | Uint8Array) => {
          if (typeof data === 'string') {
            await ws.send(data)
          } else if (data instanceof ArrayBuffer) {
            await ws.send(Array.from(new Uint8Array(data)))
          } else if ((data as any) instanceof Uint8Array) {
            await ws.send(Array.from(data))
          }
        },
        close: () => ws.disconnect(),
        set onmessage(handler: (ev: MessageEvent) => void) {
          messageHandler = handler
          while (messageQueue.length > 0) {
            handler(messageQueue.shift())
          }
        },
        onerror: null as any,
        onclose: null as any
      }

      ws.addListener((msg: any) => {
        if (msg.type === 'Text') {
          const event = { data: msg.data } as MessageEvent
          if (messageHandler) messageHandler(event)
          else messageQueue.push(event)
        } else if (msg.type === 'Binary') {
          const event = { data: new Uint8Array(msg.data).buffer } as MessageEvent
          if (messageHandler) messageHandler(event)
          else messageQueue.push(event)
        } else if (msg.type === 'Close') {
          if (adapter.onclose) {
            adapter.onclose({ code: msg.data?.code, reason: msg.data?.reason, wasClean: true } as CloseEvent)
          }
        }
      })

      await ws.send(configMessage)
      return adapter

    } else {
      // Standard WebSocket for browsers
      const ws = new WebSocket(url)
      ws.binaryType = 'arraybuffer'

      return new Promise((resolve, reject) => {
        ws.onopen = () => {
          ws.send(configMessage)
          resolve(ws)
        }
        ws.onerror = () => {
          reject(new Error(`WebSocket connection failed`))
        }
        ws.onclose = (e) => {
          if (e.code !== 1000) {
            reject(new Error(`WebSocket closed: code=${e.code}, reason=${e.reason || 'none'}`))
          }
        }
      })
    }
  }

  async stream(text: string, callbacks: {
    onChunk: (data: Uint8Array) => void,
    onEnd: () => void,
    onError: (err: any) => void
  }): Promise<void> {
    let wsConnect: WebSocket | any

    try {
      wsConnect = await this._connectWebSocket()
    } catch (e) {
      callbacks.onError(e)
      return
    }

    const timeout = setTimeout(() => {
      callbacks.onError('Timed out')
      if (wsConnect) wsConnect.close()
    }, this.timeout)

    wsConnect.onmessage = (event: MessageEvent) => {
      const data = event.data
      if (data instanceof ArrayBuffer) {
        const view = new Uint8Array(data)
        // Find "Path:audio\r\n" separator
        const separator = [80, 97, 116, 104, 58, 97, 117, 100, 105, 111, 13, 10]
        let matchIndex = -1
        const searchLimit = Math.min(view.length, 256)

        for (let i = 0; i < searchLimit - separator.length; i++) {
          let match = true
          for (let j = 0; j < separator.length; j++) {
            if (view[i + j] !== separator[j]) { match = false; break }
          }
          if (match) { matchIndex = i; break }
        }

        if (matchIndex !== -1) {
          callbacks.onChunk(view.slice(matchIndex + separator.length))
        }
      } else if (typeof data === 'string' && data.includes('Path:turn.end')) {
        wsConnect.close()
        clearTimeout(timeout)
        callbacks.onEnd()
      }
    }

    wsConnect.onerror = (error: any) => callbacks.onError(error)

    const requestId = Array.from(window.crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0')).join('')

    await wsConnect.send(`X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n` +
      `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${this.lang}">
          <voice name="${this.voice}">
              <prosody rate="${this.rate}" pitch="${this.pitch}" volume="${this.volume}">
                  ${text}
              </prosody>
          </voice>
      </speak>`)
  }

  async ttsPromise(text: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = []
      this.stream(text, {
        onChunk: (data) => chunks.push(data),
        onEnd: () => resolve(new Blob(chunks as unknown as BufferSource[], { type: 'audio/mpeg' })),
        onError: (err) => reject(err)
      }).catch(reject)
    })
  }
}

export { EdgeTTS }