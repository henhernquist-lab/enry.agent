# NIM Vision / Multimodal Support

> Research date: July 8, 2026
> Scope: Can enry.agent's 4 NIM-hosted models accept image input
> through the existing OpenAI-compatible chat completions API at
> `https://integrate.api.nvidia.com/v1`?

---

## Per-Model Verdict

### DeepSeek V4 Pro — ❌ No

| Attribute | Detail |
| :--- | :--- |
| **NIM ID** | `deepseek-ai/deepseek-v4-pro` |
| **Input modality** | Text only |
| **Image support via NIM** | None |
| **Source** | [NVIDIA NIM docs: DeepSeek V4 Pro](https://docs.api.nvidia.com/nim/reference/deepseek-ai-deepseek-v4-pro) |

The NIM-hosted DeepSeek V4 Pro is a text-only language model. It has no vision
encoder. Sending `image_url` content parts in the messages array will result
in an error or be silently ignored.

---

### MiniMax M3 — ✅ Yes

| Attribute | Detail |
| :--- | :--- |
| **NIM ID** | `minimax/minimax-m3` |
| **Input modality** | Text + Image + Video |
| **Image format** | Standard OpenAI-compatible `image_url` in content array |
| **Image sources** | Public URL or base64 data URI (`data:image/jpeg;base64,…`) |
| **Supported file types** | JPG, JPEG, PNG, GIF |
| **Source** | [MiniMax M3 NIM docs](https://docs.api.nvidia.com/nim/vision-language-models/) |

**API shape (identical to OpenAI Vision API):**

```json
{
  "model": "minimax/minimax-m3",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "What is in this image?" },
        {
          "type": "image_url",
          "image_url": {
            "url": "https://example.com/photo.jpg"
          }
        }
      ]
    }
  ]
}
```

Base64 variant:

```json
{
  "type": "image_url",
  "image_url": {
    "url": "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAE..."
  }
}
```

**Compatibility with enry.agent:** Fully compatible. The existing
`createOpenAI({ baseURL: 'https://integrate.api.nvidia.com/v1', apiKey })`
pattern and `@ai-sdk/openai` library support multimodal messages natively —
the content array with `image_url` parts is standard OpenAI format.

---

### Qwen 3.5 122B — ✅ Yes

| Attribute | Detail |
| :--- | :--- |
| **NIM ID** | `qwen/qwen3.5-122b-a10b` |
| **Input modality** | Text + Image + Video |
| **Image format** | Standard OpenAI-compatible `image_url` in content array |
| **Image sources** | Public URL or base64 data URI |
| **Supported file types** | GIF, JPG, JPEG, PNG |
| **Max images per prompt** | 5 (default; configurable via `NIM_MAX_IMAGES_PER_PROMPT`) |
| **Image preprocessing** | `mm_processor_kwargs` with `shortest_edge` / `longest_edge` pixel controls |
| **Source** | [NVIDIA NIM: Qwen Vision Language Models](https://docs.nvidia.com/nim/vision-language-models/1.7.0/examples/qwen/api.html) |

**API shape:** Same OpenAI-compatible format as MiniMax M3 above. Both URL and
base64 are supported. Qwen uses "early fusion" training — vision and text
tokens were trained jointly from the start, not bolted on afterward.

---

### GLM 5.2 — ❌ No

| Attribute | Detail |
| :--- | :--- |
| **NIM ID** | `z-ai/glm-5.2` |
| **Input modality** | Text only |
| **Image support via NIM** | None |
| **Source** | [NVIDIA NIM docs: GLM 5.2](https://docs.api.nvidia.com/nim/reference/z-ai-glm-5.2) |

GLM 5.2 is a text-only model on NIM — designed for long-horizon reasoning,
repository-scale coding, and agentic orchestration. No vision encoder is
exposed through the NIM endpoint. While Zhipu AI may offer multimodal GLM
variants elsewhere, the `z-ai/glm-5.2` NIM container is text-only.

---

## Summary

| Model | Vision via NIM? | Image format | Video? |
| :--- | :---: | :--- | :---: |
| DeepSeek V4 Pro | ❌ | — | — |
| MiniMax M3 | ✅ | URL or base64 (`image_url`) | ✅ |
| Qwen 3.5 122B | ✅ | URL or base64 (`image_url`) | ✅ |
| GLM 5.2 | ❌ | — | — |

**2 of 4 models support image input via NIM.** Both use the exact same
OpenAI-compatible `image_url` content-part format, meaning the same code
handles both — no model-specific branching needed.

---

## Recommendation

### Use MiniMax M3 for image analysis

| Factor | Why MiniMax M3 wins |
| :--- | :--- |
| **Latency** | Fastest of the 4 models (~9–15× faster prefill/decoding at long context). Image analysis is already slow — you don't want a slow model on top of that. |
| **Multimodal** | Native text + image + video. Qwen also has this, but MiniMax M3 is the documented "fast" pick. |
| **Already in use** | The model selector in `/api/chat` already supports MiniMax M3. No new model wiring needed. |
| **API shape** | Identical to Qwen — standard `image_url` content parts. Zero code changes to the NIM client setup. |
| **Cost** | 22B active params (vs Qwen's 10B — still efficient). Lower overall inference cost than DeepSeek V4 Pro or GLM 5.2. |

**Alternative:** Qwen 3.5 122B is also a strong candidate. It uses "early
fusion" multimodal training for tighter text-image integration and has the
lowest active params (10B). However, MiniMax M3's speed advantage makes it the
better first choice for an interactive image-analysis feature. If image
analysis becomes a heavy-use path, adding Qwen as a fallback or budget option
is straightforward since both use the same API format.

### What building image analysis looks like

No new NIM client or auth pattern needed. The existing chat route already
has everything:

```ts
// src/app/api/chat/route.ts — already does this
const client = createOpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.MINIMAX_API_KEY,  // ← already configured
})

// To add image support, just pass content arrays in messages:
const messages = [
  {
    role: 'user',
    content: [
      { type: 'text', text: 'Analyze this screenshot.' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,…' } },
    ],
  },
]
```

The `@ai-sdk/openai` library handles multimodal message serialization
natively — no additional dependencies or API changes.

---

## Sources

- [NVIDIA NIM: DeepSeek V4 Pro](https://docs.api.nvidia.com/nim/reference/deepseek-ai-deepseek-v4-pro)
- [NVIDIA NIM: MiniMax M3](https://docs.api.nvidia.com/nim/vision-language-models/)
- [NVIDIA NIM: Qwen 3.5 122B Vision](https://docs.nvidia.com/nim/vision-language-models/1.7.0/examples/qwen/api.html)
- [NVIDIA NIM: GLM 5.2](https://docs.api.nvidia.com/nim/reference/z-ai-glm-5.2)
- [NGC Catalog: GLM 5.2](https://catalog.ngc.nvidia.com/orgs/nim/teams/zai-org/models/glm-52)
