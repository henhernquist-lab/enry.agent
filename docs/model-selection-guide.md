# Model Selection Guide

enry.agent's 4 NIM models — which one to use for what.

All models use NVIDIA NIM inference endpoints at `https://integrate.api.nvidia.com/v1` via OpenAI-compatible `/v1/chat/completions`.

---

## Model Profiles

### DeepSeek V4 Pro

| Attribute | Value |
| :--- | :--- |
| **NIM ID** | `deepseek-ai/deepseek-v4-pro` |
| **Architecture** | Mixture-of-Experts (MoE) |
| **Params** | 1.6T total / 49B active per token |
| **Context window** | 1M tokens |
| **Inference speed** | ~150 tok/sec/user on GB200 NVL72; significantly optimized vs prior gen (73% fewer FLOPs, 90% less KV cache at 1M) |
| **Reasoning modes** | Non-think (fast), Think High (logical analysis), Think Max (deep reasoning) |
| **Key innovation** | Hybrid attention (Compressed Sparse + Heavily Compressed Attention); persistent reasoning traces across tool-use turns; XML-based DSML tool-call format |

**Strengths:**
- **Code generation**: Excellent. Trained for multi-file repo analysis and complex multi-step coding tasks.
- **Summarization**: Strong. 1M context processes massive docs/codebases in one pass.
- **Structured JSON**: Optimized. Uses dedicated `|DSML|` XML tokens reducing JSON-in-string parsing errors.
- **Casual conversation / chat**: Primary strength. Supports persistent reasoning traces across user turns — avoids re-prompting failures common in other models when using tools.

**Best for:** Complex tasks, agentic workflows, heavy reasoning, multi-turn tool use. The default model for a reason.

---

### MiniMax M3

| Attribute | Value |
| :--- | :--- |
| **NIM ID** | `minimax/minimax-m3` |
| **Architecture** | Mixture-of-Experts (MoE) |
| **Params** | 428B total / 22B active per token |
| **Context window** | 1M tokens |
| **Inference speed** | Fast. 9× faster prefill, 15× faster decoding vs standard sparse attention at 1M context. Supports MXFP8 quantization. |
| **Key innovation** | MiniMax Sparse Attention (MSA) — pre-filters relevance blocks, replacing quadratic attention with fast contiguous KV cache access. Native multimodal (text + image + video). |

**Strengths:**
- **Code generation**: Strong for large codebases. Long context handles multi-file analysis and extended sessions.
- **Summarization**: Excellent for long-form and multimodal (e.g. 30-min video summaries).
- **Structured JSON**: Reliable via dedicated NIM parser (`minimax-m3-nom`), good for tool calling.
- **Casual conversation**: Fast, responsive, capable generalist. Best latency among the 4 models.

**Best for:** General tasks where speed matters, multimodal inputs, fast-turnaround tool calls, lower-cost inference (22B active params). The "fast and capable" pick.

---

### Qwen 3.5 122B

| Attribute | Value |
| :--- | :--- |
| **NIM ID** | `qwen/qwen3.5-122b-a10b` |
| **Architecture** | Mixture-of-Experts (MoE) |
| **Params** | 122B total / 10B active per token |
| **Context window** | 262K native; up to 1M with YaRN scaling |
| **Inference speed** | ~51 tok/sec on optimized H100; best intelligence-to-cost ratio with only 10B active params |
| **Key innovation** | "Early fusion" multimodal training — vision and text tokens trained jointly, not bolted on. Native support for images (png, jpg) and video (mp4, mov, webm). |

**Strengths:**
- **Code generation**: Strong for complex multi-step dev tasks and architectural reasoning.
- **Summarization**: Good. Large context handles big documents; strong at RAG pipelines.
- **Structured JSON**: Very strong. Reliably adheres to complex, strictly formatted output schemas — great for API-driven agentic workflows.
- **Casual conversation**: Good analytical depth. Best for conversations requiring reasoned analysis rather than speed.

**Weaknesses:**
- Requires careful deployment config (quantization, kernel tuning) to hit peak performance.
- 122B total params still needs significant VRAM; benefits from FP8/int8 quantization.

**Best for:** Analysis-heavy tasks, RAG, structured output pipelines, multimodal reasoning on a budget (10B active). The "large reasoning model" pick.

---

### GLM 5.2

| Attribute | Value |
| :--- | :--- |
| **NIM ID** | `z-ai/glm-5.2` |
| **Architecture** | Mixture-of-Experts (MoE) |
| **Params** | 753B total / ~40B active per token |
| **Context window** | 1M tokens (optimized for "usable" long-context — coherence across full window, not just retention) |
| **Inference speed** | Uses IndexShare to reduce per-token overhead at long context; speculative decoding via Multi-Token Prediction (MTP) layer boosts output velocity |
| **Reasoning modes** | High (fast, simple tasks), Max (deep reasoning for complex/architectural problems) |
| **License** | MIT — fully open weights |

**Strengths:**
- **Code generation**: Exceptional at repository-scale. Trained specifically for long-horizon software engineering — cross-file refactors, debugging complex dependency chains, understanding unfamiliar codebases.
- **Summarization**: Strong at long-context coherence. 1M usable window.
- **Structured JSON**: Highly proficient as a reasoning-heavy, agent-focused model. Reliable for tool orchestration.
- **Casual conversation**: Good at staying on-task over long multi-step interactions. Designed for agentic loops (Cline, Claude Code, Roo Code compatibility).

**Weaknesses:**
- New (June 2026) — less independent community benchmarking than the others.
- 753B params = substantial compute for self-hosting (though MIT license allows it).

**Best for:** Repository-scale coding, long-horizon agentic tasks, multi-step automated workflows, instruction-following. The "versatile all-rounder" pick with a coding edge.

---

## Decision Table

| If the task is… | Use… | Why |
| :--- | :--- | :--- |
| **Complex multi-turn reasoning / agentic orchestration** | DeepSeek V4 Pro | Persistent reasoning traces across tool calls, strongest all-around |
| **Fast, general-purpose chat or tool calls** | MiniMax M3 | Lowest latency (22B active), 9–15× faster at long context |
| **Structured JSON / API output / strict schema adherence** | Qwen 3.5 122B | Strongest structured output fidelity, 10B active = efficient |
| **Heavy RAG / long-document analysis** | DeepSeek V4 Pro or GLM 5.2 | Both have 1M usable context and strong retrieval coherence |
| **Repository-scale code (multi-file refactors, large codebases)** | GLM 5.2 | Purpose-built for agentic SE; MIT license for flexibility |
| **Budget-conscious or high-throughput (cost-optimized)** | MiniMax M3 or Qwen 3.5 122B | 22B and 10B active params respectively |
| **Multimodal (text + images + video)** | MiniMax M3 or Qwen 3.5 122B | Both have native multimodal; MiniMax stronger on video |
| **Deep analytical reasoning (architecture, strategy, debugging)** | DeepSeek V4 Pro (Think Max) or Qwen 3.5 122B | DeepSeek for max depth, Qwen for good depth at lower cost |
| **Instruction-following / staying on-task over long sessions** | GLM 5.2 | Trained for long-horizon adherence |
| **Conversational / casual chat** | MiniMax M3 | Fastest responses, natural conversation flow |
| **Quick structured extraction (e.g., meal macros, flashcard parsing)** | MiniMax M3 or GLM 5.2 | Fast turnaround + reliable structured output |

---

## Quick Reference: Which Model Does enry.agent Use Where

| Feature / Route | Model Used | Rationale |
| :--- | :--- | :--- |
| **Main chat** (`/api/chat`) | *User-selectable* (default: DeepSeek V4 Pro) | User picks in the model selector |
| **Automations / generate** (`/api/automations/generate`) | GLM 5.2 | Fast general-purpose generation (flashcards, meal macros, repo chat) |
| **Article → Notes** (`/api/article-notes`) | DeepSeek V4 Pro | Complex multi-stage: fetch → extract → summarize → flashcard generation |
| **Embeddings** (`/api/memories`, semantic search) | Qwen (via NIM embeddings) | Embedding endpoint, not chat |

---

## Sources

- [NVIDIA NIM: DeepSeek-V4-Pro](https://docs.api.nvidia.com/nim/reference/deepseek-ai-deepseek-v4-pro)
- [NVIDIA Blog: Build with DeepSeek V4](https://developer.nvidia.com/blog/build-with-deepseek-v4-using-nvidia-blackwell-and-gpu-accelerated-endpoints/)
- [NVIDIA Blog: MiniMax M3](https://developer.nvidia.com/blog/deploy-long-context-reasoning-and-agentic-workflows-with-minimax-m3-on-nvidia-accelerated-infrastructure/)
- [NVIDIA NIM: Qwen3.5-122B-A10B](https://docs.api.nvidia.com/nim/reference/qwen-qwen3-5-122b-a10b)
- [NVIDIA NGC: GLM-5.2](https://catalog.ngc.nvidia.com/orgs/nim/teams/zai-org/models/glm-52)
- [Verdent: What Is GLM-5.2](https://www.verdent.ai/guides/what-is-glm-5-2)
