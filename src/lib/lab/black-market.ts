// ───────────────────────────────────────────────────────────────────
// The Black Market — curated catalog of experimental community models.
//
// This is NOT the official model registry (src/lib/nim.ts). Nothing here
// is routable, installable, or invokable — it's an editorial gallery of
// interesting community fine-tunes, merges, and research checkpoints.
//
// Data honesty: the descriptive fields below (creator, base model,
// params, license, tags, description) are curated editorial content.
// Live stats (downloads, likes, lastModified) are NOT stored here — the
// /api/lab/black-market route fetches them from the real Hugging Face
// API at request time and the UI shows "—" when unavailable. No
// popularity numbers are ever fabricated.
//
// Future-proofing: `capabilities` declares which future actions a model
// could support (install, benchmark, router, local, compare, rate).
// The UI renders disabled affordances off this today; the execution
// layer plugs in later without restructuring the catalog or the page.
// ───────────────────────────────────────────────────────────────────

export type BlackMarketCollection = 'core' | 'discovery'

export type BlackMarketCategory = 'trending' | 'reasoning' | 'coding' | 'experimental' | 'verified'

export type BlackMarketBadge =
  | 'Experimental' | 'Merge' | 'Fine-Tune' | 'Reasoning' | 'Coding'
  | 'Roleplay' | 'Vision' | 'Long Context' | 'Tool Calling'
  | 'Uncensored' | 'GGUF' | 'MTP'
  // Core model category badges
  | 'General' | 'Lightweight' | 'Heavy Reasoning' | 'Fast Chat' | 'Small High Quality'
  // Discovery-only badges
  | 'Trending' | 'New' | 'Staff Pick' | 'Fast' | 'Creative'

/** Badges shown on Daily Discovery cards. */
export type DiscoveryBadge =
  | 'Trending' | 'New' | 'Staff Pick' | 'Experimental' | 'Fast'
  | 'Reasoning' | 'Coding' | 'Tool Calling' | 'Creative'

export interface BlackMarketModel {
  /** Hugging Face repo id — must be a real, verified repo. */
  hfId: string
  name: string
  creator: string
  baseModel: string
  /** Human-readable parameter count, e.g. "27B". */
  params: string
  license: string
  /** Which curated collection this model belongs to. */
  collection: BlackMarketCollection
  categories: BlackMarketCategory[]
  badges: BlackMarketBadge[]
  /** Discovery-only flair badges (rendered separately on cards). */
  discoveryBadges: DiscoveryBadge[]
  description: string
  // ── Detail panel (editorial) ──
  architecture: string
  mergeInfo: string | null
  trainingNotes: string
  strengths: string[]
  weaknesses: string[]
  limitations: string
  useCases: string[]
  /** Future-action capability flags — all render disabled today. */
  capabilities: {
    install: boolean
    benchmark: boolean
    router: boolean
    gguf: boolean
    /** Ollama / LM Studio / other local runtime. */
    local: boolean
    /** Compare two or more models side-by-side. */
    compare: boolean
    /** Community ratings / reviews. */
    rate: boolean
  }
}

/** Live stats fetched from the HF API — never stored, never invented. */
export interface BlackMarketLiveStats {
  downloads: number | null
  likes: number | null
  lastModified: string | null
  /** false when the HF fetch failed — UI must show "—", not zeros. */
  ok: boolean
}

export type BlackMarketEntry = BlackMarketModel & {
  stats: BlackMarketLiveStats
  /** Whether a live HF inference provider can actually serve this model —
   *  gates the "Add to Enry" action. Resolved live by the API route. */
  servable: boolean
  /** Why it can't be added, when servable is false (shown in the UI). */
  unservableReason: string | null
  /** Whether the current user has already added this model to their registry. */
  added: boolean
}

export const CATEGORY_META: Record<BlackMarketCategory, { emoji: string; label: string; blurb: string }> = {
  trending:     { emoji: '🔥', label: 'Trending',      blurb: 'Most talked-about community models.' },
  reasoning:    { emoji: '🧠', label: 'Reasoning',     blurb: 'Models optimized for planning, logic, and deep thinking.' },
  coding:       { emoji: '💻', label: 'Coding',        blurb: 'Models specialized for software engineering.' },
  experimental: { emoji: '🧪', label: 'Experimental',  blurb: 'Wild community experiments, merges, and research models.' },
  verified:     { emoji: '⭐', label: 'Enry Verified', blurb: 'Models Enry has benchmarked and recommends.' },
}

// ── Future-proofed defaults for capabilities not yet wired ──
const CAPS_ALL_OFF: BlackMarketModel['capabilities'] = {
  install: false,
  benchmark: false,
  router: false,
  gguf: false,
  local: false,
  compare: false,
  rate: false,
}

// ───────────────────────────────────────────────────────────────────
// CORE COMMUNITY MODELS — permanent, curated "classics".
// These are well-known community/base models with hosted inference.
// ───────────────────────────────────────────────────────────────────
export const CORE_COMMUNITY_MODELS: BlackMarketModel[] = [
  {
    hfId: 'NousResearch/Hermes-3-Llama-3.1-8B',
    name: "Nous Hermes 3",
    creator: "Nous Research",
    baseModel: "Llama 3.1 8B",
    params: "8B",
    license: "llama3",
    collection: "core",
    categories: ["reasoning"],
    badges: ["Fine-Tune", "Reasoning", "Tool Calling", "Roleplay"],
    discoveryBadges: [],
    description:
      "Nous Research's flagship open instruct tune: advanced agentic capabilities, multi-turn roleplay coherence, structured output, and long-context reasoning.",
    architecture: "Llama 3.1 8B dense transformer, full-parameter fine-tune with ChatML.",
    mergeInfo: null,
    trainingNotes: "Trained on Nous's curated instruct corpus emphasizing agentic behavior, function calling, and faithful persona adherence.",
    strengths: ["Reliable JSON/structured output", "Function calling", "Persona coherence", "Well-documented prompt format"],
    weaknesses: ["8B ceiling on hard reasoning", "ChatML format required for best results"],
    limitations: "Uses ChatML role tokens; deviating from the documented format degrades quality.",
    useCases: ["Agent scaffolds", "Structured extraction", "Roleplay and persona work"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "Qwen/Qwen3-32B-Instruct",
    name: "Qwen 3 32B Instruct",
    creator: "Alibaba Cloud",
    baseModel: "Qwen 3",
    params: "32B",
    license: "qwen-research",
    collection: "core",
    categories: ["reasoning"],
    badges: ["Reasoning", "Tool Calling", "Coding"],
    discoveryBadges: [],
    description:
      "Alibaba's mid-size flagship with dense reasoning, agentic tool use, and strong multilingual performance across coding and math.",
    architecture: "Dense transformer with mixture-of-experts routing, instruction-tuned.",
    mergeInfo: null,
    trainingNotes: "Pre-trained and aligned on a large multilingual corpus with heavy coding and reasoning emphasis.",
    strengths: ["Strong reasoning for the size", "Multilingual", "Tool use", "Good coding"],
    weaknesses: ["Not as fast as smaller variants", "License restrictions on commercial use"],
    limitations: "Research license may restrict commercial deployment; verify terms before production use.",
    useCases: ["General chat", "Reasoning", "Coding assistance", "Agent tasks"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "Qwen/Qwen3-14B-Instruct",
    name: "Qwen 3 14B Instruct",
    creator: "Alibaba Cloud",
    baseModel: "Qwen 3",
    params: "14B",
    license: "qwen-research",
    collection: "core",
    categories: ["reasoning"],
    badges: ["Fast", "Reasoning", "Coding"],
    discoveryBadges: [],
    description:
      "A faster, smaller Qwen 3 variant that still punches above its weight on reasoning and coding benchmarks.",
    architecture: "Dense transformer, instruction-tuned.",
    mergeInfo: null,
    trainingNotes: "Aligned on the same multilingual corpus as the larger Qwen 3 siblings, distilled to 14B.",
    strengths: ["Fast inference", "Strong quality-per-parameter", "Good code generation"],
    weaknesses: ["Struggles with the hardest reasoning problems", "License restrictions"],
    limitations: "Research license may restrict commercial deployment.",
    useCases: ["Fast general chat", "Code completion", "Lightweight agents"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "google/gemma-3-27b-it",
    name: "Gemma 3 27B IT",
    creator: "Google",
    baseModel: "Gemma 3",
    params: "27B",
    license: "gemma",
    collection: "core",
    categories: ["trending"],
    badges: ["General", "Vision", "Long Context"],
    discoveryBadges: [],
    description:
      "Google's multimodal instruction-tuned model with a massive context window and strong general-purpose performance.",
    architecture: "Dense transformer, instruction-tuned, multimodal capable.",
    mergeInfo: null,
    trainingNotes: "Trained with Google DeepMind's Gemma 3 training recipe and safety filters.",
    strengths: ["Long context", "Multimodal", "Polished general chat"],
    weaknesses: ["Gemma license restrictions", "Can be cautious/refuse-heavy"],
    limitations: "Subject to the Gemma Terms of Use; multimodal capabilities not exposed through Enry today.",
    useCases: ["General chat", "Long-document analysis", "Multimodal experiments"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "google/gemma-3-12b-it",
    name: "Gemma 3 12B IT",
    creator: "Google",
    baseModel: "Gemma 3",
    params: "12B",
    license: "gemma",
    collection: "core",
    categories: ["trending"],
    badges: ["Lightweight", "General"],
    discoveryBadges: [],
    description:
      "A lighter, faster Gemma 3 variant that keeps most of the family's chat quality and long-context strengths.",
    architecture: "Dense transformer, instruction-tuned.",
    mergeInfo: null,
    trainingNotes: "Trained alongside the 27B variant with the same data mix and safety alignment.",
    strengths: ["Fast", "Low resource", "Good general chat"],
    weaknesses: ["Less capable on complex reasoning", "Gemma license restrictions"],
    limitations: "Subject to the Gemma Terms of Use.",
    useCases: ["Fast chat", "Local/edge inference", "General tasks"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "deepseek-ai/DeepSeek-R1-Distill-Llama-70B",
    name: "DeepSeek R1 Distill Llama 70B",
    creator: "DeepSeek",
    baseModel: "Llama 3.3 70B",
    params: "70B",
    license: "mit",
    collection: "core",
    categories: ["reasoning"],
    badges: ["Heavy Reasoning", "Reasoning"],
    discoveryBadges: [],
    description:
      "DeepSeek's reasoning distillation of Llama 3.3 70B — chain-of-thought style reasoning at a practical size.",
    architecture: "Llama 3.3 70B dense transformer, distilled from DeepSeek-R1.",
    mergeInfo: null,
    trainingNotes: "Distilled from DeepSeek-R1 reasoning outputs to bring reasoning traces to the Llama architecture.",
    strengths: ["Strong reasoning traces", "Familiar Llama ecosystem", "Permissive MIT license"],
    weaknesses: ["70B requires significant VRAM", "Reasoning can be verbose"],
    limitations: "Reasoning traces add token length and latency; best for tasks that benefit from explicit reasoning.",
    useCases: ["Math", "Logic puzzles", "Long-form reasoning", "Research assistance"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B",
    name: "DeepSeek R1 Distill Qwen 32B",
    creator: "DeepSeek",
    baseModel: "Qwen 3",
    params: "32B",
    license: "mit",
    collection: "core",
    categories: ["reasoning"],
    badges: ["Reasoning", "Coding"],
    discoveryBadges: [],
    description:
      "A 32B reasoning model that combines Qwen's efficiency with DeepSeek-R1-style chain-of-thought distillation.",
    architecture: "Qwen 3 dense transformer, distilled from DeepSeek-R1.",
    mergeInfo: null,
    trainingNotes: "Distilled from DeepSeek-R1 outputs to produce step-by-step reasoning in a smaller package.",
    strengths: ["Strong reasoning for 32B", "Good code generation", "Permissive MIT license"],
    weaknesses: ["Reasoning verbosity", "Not always faster than non-reasoning models"],
    limitations: "Reasoning traces add token length and latency.",
    useCases: ["Coding with reasoning", "Math", "Step-by-step analysis"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "meta-llama/Llama-3.3-70B-Instruct",
    name: "Llama 3.3 70B Instruct",
    creator: "Meta",
    baseModel: "Llama 3.3",
    params: "70B",
    license: "llama3",
    collection: "core",
    categories: ["trending"],
    badges: ["General", "Long Context"],
    discoveryBadges: [],
    description:
      "Meta's updated 70B generalist: improved instruction following and tool use over Llama 3.1 70B at the same parameter count.",
    architecture: "Llama 3.3 70B dense transformer, instruction-tuned.",
    mergeInfo: null,
    trainingNotes: "Updated post-training recipe improving alignment and tool use over the Llama 3.1 base.",
    strengths: ["Broad general knowledge", "Strong instruction following", "Good tool use"],
    weaknesses: ["70B requires significant resources", "Llama 3 license restrictions"],
    limitations: "Llama 3 community license applies; commercial use above certain thresholds requires a license from Meta.",
    useCases: ["General chat", "Tool use", "Instruction-heavy tasks"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "mistralai/Mistral-Small-3.2-24B-Instruct-2506",
    name: "Mistral Small 3.2 Instruct",
    creator: "Mistral AI",
    baseModel: "Mistral Small",
    params: "24B",
    license: "Apache-2.0",
    collection: "core",
    categories: ["coding", "trending"],
    badges: ["Fast Chat", "Coding", "Tool Calling"],
    discoveryBadges: [],
    description:
      "Mistral's compact generalist tuned for fast chat, coding, and agentic tool use with low latency.",
    architecture: "Mistral Small dense transformer, instruction-tuned.",
    mergeInfo: null,
    trainingNotes: "Trained for low-latency assistant and coding tasks with strong tool-calling alignment.",
    strengths: ["Fast", "Good coding", "Tool calling", "Apache-2.0 license"],
    weaknesses: ["Smaller than frontier models", "Not as strong on deep reasoning"],
    limitations: "Best for fast assistant and coding tasks; hard reasoning may require larger models.",
    useCases: ["Fast coding assistant", "Tool agents", "General chat"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "microsoft/Phi-4",
    name: "Phi-4",
    creator: "Microsoft",
    baseModel: "Phi-4",
    params: "14B",
    license: "mit",
    collection: "core",
    categories: ["trending"],
    badges: ["Small High Quality", "General"],
    discoveryBadges: [],
    description:
      "Microsoft's 14B model that overperforms on reasoning, math, and coding for its size class.",
    architecture: "Phi-4 dense transformer, instruction-tuned.",
    mergeInfo: null,
    trainingNotes: "Trained on a high-quality synthetic-heavy dataset focusing on reasoning and STEM.",
    strengths: ["Excellent quality for 14B", "Strong math/reasoning", "Permissive MIT license"],
    weaknesses: ["Knowledge cutoff limitations", "Smaller context than frontier models"],
    limitations: "Performance is strong for its size but it cannot match the raw knowledge of 70B+ models.",
    useCases: ["Reasoning", "Math", "Coding", "General chat"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
]

// ───────────────────────────────────────────────────────────────────
// DAILY DISCOVERY POOL — candidates for the rotating spotlight.
// The API selects 3–5 servable models each day, avoiding recent repeats.
// ───────────────────────────────────────────────────────────────────
export const DAILY_DISCOVERY_POOL: BlackMarketModel[] = [
  {
    hfId: "NousResearch/Hermes-3-Llama-3.1-70B",
    name: "Nous Hermes 3 70B",
    creator: "Nous Research",
    baseModel: "Llama 3.1 70B",
    params: "70B",
    license: "llama3",
    collection: "discovery",
    categories: ["reasoning"],
    badges: ["Fine-Tune", "Reasoning", "Tool Calling"],
    discoveryBadges: ["Staff Pick", "Reasoning", "Tool Calling"],
    description: "The larger sibling of the 8B Hermes 3, with more headroom for complex reasoning and tool use.",
    architecture: "Llama 3.1 70B dense transformer, full-parameter fine-tune with ChatML.",
    mergeInfo: null,
    trainingNotes: "Fine-tuned on Nous's curated instruct corpus with emphasis on agentic behavior.",
    strengths: ["Larger reasoning headroom", "Strong structured output", "Reliable tool calling"],
    weaknesses: ["Requires more resources", "ChatML format needed"],
    limitations: "Uses ChatML role tokens.",
    useCases: ["Complex agents", "Structured extraction", "Advanced reasoning"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO",
    name: "Nous Hermes 2 Mixtral 8x7B DPO",
    creator: "Nous Research",
    baseModel: "Mixtral 8x7B",
    params: "47B active",
    license: "apache-2.0",
    collection: "discovery",
    categories: ["experimental"],
    badges: ["Fine-Tune", "Experimental", "Reasoning"],
    discoveryBadges: ["Experimental", "Reasoning"],
    description: "A DPO-tuned Mixtral with strong general chat and reasoning quality from the Nous lineage.",
    architecture: "Mixture-of-experts, DPO aligned.",
    mergeInfo: null,
    trainingNotes: "DPO alignment over the Mixtral 8x7B base.",
    strengths: ["Efficient MoE inference", "Apache-2.0", "Solid reasoning"],
    weaknesses: ["MoE can be tricky to serve", "Older generation"],
    limitations: "MoE routing requires compatible inference provider.",
    useCases: ["General chat", "Reasoning experiments"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "cognitivecomputations/Dolphin3.0-Llama3.1-8B",
    name: "Dolphin 3.0 Llama 3.1 8B",
    creator: "Cognitive Computations",
    baseModel: "Llama 3.1 8B",
    params: "8B",
    license: "llama3.1",
    collection: "discovery",
    categories: ["trending"],
    badges: ["Fine-Tune", "Coding", "Tool Calling"],
    discoveryBadges: ["Trending", "Coding", "Tool Calling"],
    description: "The Dolphin lineage's steerable 8B generalist for coding, tool use, and local ownership.",
    architecture: "Llama 3.1 8B dense transformer, instruct fine-tune.",
    mergeInfo: null,
    trainingNotes: "Trained for steerability with minimal built-in refusals.",
    strengths: ["Steerable", "Tool calling", "Good coding for the size"],
    weaknesses: ["8B knowledge limits", "No built-in safety rails"],
    limitations: "Alignment is delegated to the system prompt.",
    useCases: ["Local agents", "Tool-calling experiments"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "cognitivecomputations/Dolphin3.0-Mistral-24B",
    name: "Dolphin 3.0 Mistral 24B",
    creator: "Cognitive Computations",
    baseModel: "Mistral Small 3.2 24B",
    params: "24B",
    license: "apache-2.0",
    collection: "discovery",
    categories: ["trending", "coding"],
    badges: ["Fine-Tune", "Coding", "Tool Calling"],
    discoveryBadges: ["Trending", "Coding"],
    description: "A larger Dolphin tuned on the Mistral Small architecture for fast coding and tool use.",
    architecture: "Mistral Small dense transformer, instruct fine-tune.",
    mergeInfo: null,
    trainingNotes: "Trained with the same steerability recipe as the Llama Dolphin variant.",
    strengths: ["Fast", "Good coding", "Tool calling"],
    weaknesses: ["Requires more resources than 8B"],
    limitations: "Alignment is delegated to the system prompt.",
    useCases: ["Fast coding assistant", "Tool agents"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "teknium/OpenHermes-2.5-Mistral-7B",
    name: "OpenHermes 2.5",
    creator: "Teknium",
    baseModel: "Mistral 7B",
    params: "7B",
    license: "apache-2.0",
    collection: "discovery",
    categories: ["reasoning"],
    badges: ["Fine-Tune", "Reasoning", "Coding"],
    discoveryBadges: ["Reasoning", "Coding"],
    description: "A classic open fine-tune that showed code data boosts non-code benchmarks.",
    architecture: "Mistral 7B dense transformer, instruct fine-tune.",
    mergeInfo: null,
    trainingNotes: "Trained on ~1M GPT-4-quality instructions with a 7–14% code mix.",
    strengths: ["Quality-per-parameter", "Transparent data story", "Apache-2.0"],
    weaknesses: ["Superseded by newer tunes", "Short context by modern standards"],
    limitations: "2023-era model; best treated as a historically important baseline.",
    useCases: ["Data-mix research baseline", "Lightweight local inference"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "teknium/OpenHermes-2-Pro-Mistral-7B",
    name: "OpenHermes 2 Pro",
    creator: "Teknium",
    baseModel: "Mistral 7B",
    params: "7B",
    license: "apache-2.0",
    collection: "discovery",
    categories: ["reasoning"],
    badges: ["Fine-Tune", "Reasoning"],
    discoveryBadges: ["Staff Pick", "Reasoning"],
    description: "An improved OpenHermes tuned for more helpful and harmless assistant behavior.",
    architecture: "Mistral 7B dense transformer, instruct fine-tune.",
    mergeInfo: null,
    trainingNotes: "Refined alignment pass on top of the OpenHermes data mix.",
    strengths: ["Helpful assistant behavior", "Apache-2.0"],
    weaknesses: ["7B ceiling", "Short context"],
    limitations: "Older generation; best as a lightweight baseline.",
    useCases: ["Lightweight chat", "Alignment research baseline"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "WizardLMTeam/WizardLM-13B-V1.2",
    name: "WizardLM 13B v1.2",
    creator: "WizardLM Team",
    baseModel: "Llama 2 13B",
    params: "13B",
    license: "llama2",
    collection: "discovery",
    categories: ["experimental"],
    badges: ["Fine-Tune", "Experimental"],
    discoveryBadges: ["Experimental"],
    description: "The Evol-Instruct generalist that pioneered instruction complexity scaling.",
    architecture: "Llama 2 13B, Evol-Instruct fine-tune.",
    mergeInfo: null,
    trainingNotes: "Uses Evol-Instruct to rewrite simple instructions into more complex ones.",
    strengths: ["Complex instruction following", "Pioneering method"],
    weaknesses: ["Llama 2 base is dated", "Llama 2 community license"],
    limitations: "Llama 2 community license; commercial use may require Meta approval.",
    useCases: ["Instruction-following research", "Historical baseline"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "WizardLMTeam/WizardLM-70B-V1.0",
    name: "WizardLM 70B",
    creator: "WizardLM Team",
    baseModel: "Llama 2 70B",
    params: "70B",
    license: "llama2",
    collection: "discovery",
    categories: ["experimental"],
    badges: ["Fine-Tune", "Experimental", "Reasoning"],
    discoveryBadges: ["Experimental", "Reasoning"],
    description: "The larger WizardLM that pushed open instruction-following at scale.",
    architecture: "Llama 2 70B, Evol-Instruct fine-tune.",
    mergeInfo: null,
    trainingNotes: "Evol-Instruct applied to the Llama 2 70B base.",
    strengths: ["Strong instruction following for its era", "Complex reasoning"],
    weaknesses: ["Llama 2 base is dated", "Heavy resource use"],
    limitations: "Llama 2 community license.",
    useCases: ["Complex instruction tasks", "Research comparisons"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "HuggingFaceTB/SmolLM2-1.7B-Instruct",
    name: "SmolLM2 1.7B Instruct",
    creator: "HuggingFace TB",
    baseModel: "SmolLM2",
    params: "1.7B",
    license: "apache-2.0",
    collection: "discovery",
    categories: ["experimental"],
    badges: ["Fast", "Experimental"],
    discoveryBadges: ["Fast", "Experimental"],
    description: "A tiny, surprisingly capable instruction model for edge devices and fast prototyping.",
    architecture: "Dense transformer, instruction-tuned.",
    mergeInfo: null,
    trainingNotes: "Trained on a high-quality small-scale dataset optimized for the 1.7B parameter count.",
    strengths: ["Extremely fast", "Tiny footprint", "Apache-2.0"],
    weaknesses: ["Limited reasoning depth", "Small knowledge base"],
    limitations: "Not suitable for complex reasoning or large-context tasks.",
    useCases: ["Edge devices", "Fast prototyping", "Classification"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
    name: "TinyLlama Chat 1.1B",
    creator: "TinyLlama Team",
    baseModel: "TinyLlama",
    params: "1.1B",
    license: "apache-2.0",
    collection: "discovery",
    categories: ["experimental"],
    badges: ["Fast", "Experimental"],
    discoveryBadges: ["Fast"],
    description: "A compact chat model trained on a large corpus for its size class.",
    architecture: "Llama-2-style dense transformer, chat-tuned.",
    mergeInfo: null,
    trainingNotes: "Trained from scratch on a blend of text and chat data.",
    strengths: ["Tiny", "Fast", "Apache-2.0"],
    weaknesses: ["Limited capability", "Short context"],
    limitations: "Best for simple chat and classification; not for complex tasks.",
    useCases: ["Chat demos", "Classification", "Edge"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "microsoft/Phi-4-mini-instruct",
    name: "Phi-4 Mini Instruct",
    creator: "Microsoft",
    baseModel: "Phi-4",
    params: "3.8B",
    license: "mit",
    collection: "discovery",
    categories: ["trending"],
    badges: ["Small High Quality", "Fast"],
    discoveryBadges: ["Fast", "New"],
    description: "Microsoft's tiny Phi-4 variant that retains surprising reasoning and chat quality.",
    architecture: "Phi-4 dense transformer, instruction-tuned.",
    mergeInfo: null,
    trainingNotes: "Distilled from larger Phi-4 with high-quality synthetic data.",
    strengths: ["Tiny but capable", "Fast", "Permissive license"],
    weaknesses: ["Knowledge limits", "Small context"],
    limitations: "Not as capable as the full Phi-4 or larger models.",
    useCases: ["Fast chat", "Mobile/edge", "Classification"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "google/gemma-3-4b-it",
    name: "Gemma 3 4B IT",
    creator: "Google",
    baseModel: "Gemma 3",
    params: "4B",
    license: "gemma",
    collection: "discovery",
    categories: ["trending"],
    badges: ["Lightweight", "General"],
    discoveryBadges: ["Fast"],
    description: "The smallest Gemma 3 instruction model, ideal for fast local and edge use.",
    architecture: "Dense transformer, instruction-tuned.",
    mergeInfo: null,
    trainingNotes: "Trained with the same Gemma 3 recipe as the larger variants.",
    strengths: ["Fast", "Low resource", "Multimodal-capable family"],
    weaknesses: ["Lower reasoning ceiling", "Gemma license restrictions"],
    limitations: "Subject to the Gemma Terms of Use.",
    useCases: ["Edge inference", "Fast chat", "General tasks"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "google/gemma-2-9b-it",
    name: "Gemma 2 9B IT",
    creator: "Google",
    baseModel: "Gemma 2",
    params: "9B",
    license: "gemma",
    collection: "discovery",
    categories: ["trending"],
    badges: ["General", "Fast"],
    discoveryBadges: ["Fast"],
    description: "Google's previous-generation lightweight instruction model with solid general chat.",
    architecture: "Dense transformer, instruction-tuned.",
    mergeInfo: null,
    trainingNotes: "Trained with the Gemma 2 recipe.",
    strengths: ["Fast", "Good general chat"],
    weaknesses: ["Superseded by Gemma 3", "Gemma license restrictions"],
    limitations: "Subject to the Gemma Terms of Use.",
    useCases: ["Fast chat", "General tasks"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "Qwen/Qwen3-8B",
    name: "Qwen 3 8B",
    creator: "Alibaba Cloud",
    baseModel: "Qwen 3",
    params: "8B",
    license: "qwen-research",
    collection: "discovery",
    categories: ["trending"],
    badges: ["Fast", "General"],
    discoveryBadges: ["Fast"],
    description: "A fast Qwen 3 variant with strong quality-per-parameter for everyday tasks.",
    architecture: "Dense transformer, instruction-tuned.",
    mergeInfo: null,
    trainingNotes: "Aligned on the same multilingual corpus as the larger Qwen 3 siblings.",
    strengths: ["Fast", "Good quality for 8B", "Multilingual"],
    weaknesses: ["Limited on hardest tasks", "License restrictions"],
    limitations: "Research license may restrict commercial deployment.",
    useCases: ["Fast chat", "Lightweight coding", "Multilingual tasks"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "Qwen/Qwen3-30B-A3B",
    name: "Qwen 3 30B A3B",
    creator: "Alibaba Cloud",
    baseModel: "Qwen 3",
    params: "30B total / 3B active",
    license: "qwen-research",
    collection: "discovery",
    categories: ["reasoning"],
    badges: ["Reasoning", "Experimental"],
    discoveryBadges: ["Experimental", "Reasoning"],
    description: "A mixture-of-experts Qwen 3 variant that activates only 3B parameters per token.",
    architecture: "Mixture-of-experts, instruction-tuned.",
    mergeInfo: null,
    trainingNotes: "Trained with Qwen 3 MoE architecture for efficient high-quality inference.",
    strengths: ["Efficient MoE", "Strong reasoning", "Fast active-parameter inference"],
    weaknesses: ["MoE serving complexity", "License restrictions"],
    limitations: "MoE routing requires compatible inference provider.",
    useCases: ["Efficient reasoning", "Large-scale agents"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "mistralai/Mistral-7B-Instruct-v0.3",
    name: "Mistral 7B Instruct v0.3",
    creator: "Mistral AI",
    baseModel: "Mistral 7B",
    params: "7B",
    license: "apache-2.0",
    collection: "discovery",
    categories: ["trending"],
    badges: ["Fast", "General"],
    discoveryBadges: ["Trending", "Fast"],
    description: "The classic Apache-2.0 generalist that kicked off the modern small-model era.",
    architecture: "Mistral 7B dense transformer, instruction-tuned.",
    mergeInfo: null,
    trainingNotes: "Mistral's v0.3 instruction alignment pass.",
    strengths: ["Fast", "Reliable", "Apache-2.0"],
    weaknesses: ["Superseded by newer models", "No tool calling"],
    limitations: "Older alignment recipe; does not natively support tool calling.",
    useCases: ["Fast chat", "Classification", "Baseline comparisons"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "mistralai/Mistral-Small-3.1-24B-Instruct-2503",
    name: "Mistral Small 3.1 24B",
    creator: "Mistral AI",
    baseModel: "Mistral Small",
    params: "24B",
    license: "Apache-2.0",
    collection: "discovery",
    categories: ["coding", "trending"],
    badges: ["Fast Chat", "Coding", "Tool Calling"],
    discoveryBadges: ["Trending", "Coding"],
    description: "Mistral's earlier compact generalist tuned for coding and tool use.",
    architecture: "Mistral Small dense transformer, instruction-tuned.",
    mergeInfo: null,
    trainingNotes: "Trained for low-latency assistant and coding tasks.",
    strengths: ["Fast", "Good coding", "Tool calling"],
    weaknesses: ["Superseded by 3.2"],
    limitations: "Best for fast assistant and coding tasks.",
    useCases: ["Fast coding assistant", "Tool agents"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "mlabonne/NeuralBeagle14-7B",
    name: "NeuralBeagle14",
    creator: "Maxime Labonne",
    baseModel: "Mistral 7B lineage",
    params: "7B",
    license: "cc-by-nc-4.0",
    collection: "discovery",
    categories: ["experimental"],
    badges: ["Merge", "Fine-Tune", "Experimental", "Reasoning"],
    discoveryBadges: ["Experimental", "Reasoning"],
    description: "A DPO fine-tune of a lazymergekit merge that briefly topped the 7B leaderboard.",
    architecture: "Mistral 7B lineage, merge + DPO alignment.",
    mergeInfo: "Merge of Turdus and OpenBeagle via lazymergekit, then DPO-tuned.",
    trainingNotes: "Demonstrates the merge-then-align community recipe.",
    strengths: ["Strong leaderboard scores for 7B", "Documented recipe"],
    weaknesses: ["Non-commercial license", "Leaderboard contamination risk"],
    limitations: "Leaderboard-era merges may overfit eval suites.",
    useCases: ["Merge research", "Non-commercial projects"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "mlabonne/NeuralMarcus-7B",
    name: "NeuralMarcus",
    creator: "Maxime Labonne",
    baseModel: "Mistral 7B lineage",
    params: "7B",
    license: "cc-by-nc-4.0",
    collection: "discovery",
    categories: ["experimental"],
    badges: ["Merge", "Experimental"],
    discoveryBadges: ["Experimental"],
    description: "Another creative merge experiment from the lazymergekit series.",
    architecture: "Mistral 7B lineage, merged model.",
    mergeInfo: "Lazymergekit merge with community-curated parent models.",
    trainingNotes: "Explores merge dynamics in the 7B class.",
    strengths: ["Interesting merge behavior", "Community case study"],
    weaknesses: ["Non-commercial license", "Behavior can be unpredictable"],
    limitations: "Merge provenance makes behavior harder to predict.",
    useCases: ["Merge research", "Experimentation"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
    name: "DeepSeek R1 Distill Qwen 7B",
    creator: "DeepSeek",
    baseModel: "Qwen 3",
    params: "7B",
    license: "mit",
    collection: "discovery",
    categories: ["reasoning"],
    badges: ["Reasoning", "Fast"],
    discoveryBadges: ["Fast", "Reasoning"],
    description: "A pocket-sized reasoning model with explicit chain-of-thought distillation.",
    architecture: "Qwen 3 7B, distilled from DeepSeek-R1.",
    mergeInfo: null,
    trainingNotes: "Distilled from DeepSeek-R1 for accessible local reasoning.",
    strengths: ["Tiny reasoning model", "Permissive MIT license", "Local-friendly"],
    weaknesses: ["Limited reasoning depth", "Verbose traces"],
    limitations: "Reasoning traces add latency; best for simple step-by-step tasks.",
    useCases: ["Local reasoning", "Math tutoring", "Step-by-step explanations"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "deepseek-ai/DeepSeek-R1-Distill-Llama-8B",
    name: "DeepSeek R1 Distill Llama 8B",
    creator: "DeepSeek",
    baseModel: "Llama 3.1 8B",
    params: "8B",
    license: "mit",
    collection: "discovery",
    categories: ["reasoning"],
    badges: ["Reasoning", "Fast"],
    discoveryBadges: ["Fast", "Reasoning"],
    description: "Llama 3.1 8B infused with DeepSeek-R1 reasoning traces for small but capable reasoning.",
    architecture: "Llama 3.1 8B, distilled from DeepSeek-R1.",
    mergeInfo: null,
    trainingNotes: "Distilled from DeepSeek-R1 outputs onto the Llama 3.1 8B architecture.",
    strengths: ["Familiar Llama ecosystem", "Reasoning traces", "Permissive MIT license"],
    weaknesses: ["8B reasoning ceiling", "Verbose traces"],
    limitations: "Reasoning traces add latency.",
    useCases: ["Local reasoning", "Coding with traces", "Step-by-step analysis"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  // ── Legacy Black Market entries (kept in the discovery pool) ──
  {
    hfId: "DavidAU/Qwen3.6-27B-Fable-Fusion-711-Uncensored-Heretic-NM-DAU-NEO-MAX-MTP-GGUF",
    name: "Qwen3.6 27B Fable Fusion 711",
    creator: "DavidAU",
    baseModel: "Qwen 3.6 27B",
    params: "27B",
    license: "apache-2.0",
    collection: "discovery",
    categories: ["trending", "experimental"],
    badges: ["Experimental", "Merge", "Fine-Tune", "Uncensored", "GGUF", "MTP", "Roleplay", "Reasoning"],
    discoveryBadges: ["Experimental", "Trending"],
    description:
      "A maximalist multi-stage tune-and-merge of Qwen 3.6 27B: abliterated, NEO-imatrix quantized, with MTP quants for faster decoding. Tuned for vivid creative prose.",
    architecture: "Qwen 3.6 dense transformer, multi-stage merged, GGUF quants (regular + MTP) with NEO imatrix.",
    mergeInfo: "Multi-stage tune + multi-state merge over Qwen 3.6 27B, abliterated via the Heretic method, then NEO-MAX imatrix quantization.",
    trainingNotes: "Fine-tuned on DavidAU's Polar-STRICT and F451-STRICT datasets targeting creative writing and roleplay.",
    strengths: ["Vivid creative prose", "Roleplay and fiction", "Fast local decoding via MTP quants"],
    weaknesses: ["Uncensored — no safety alignment", "Merge provenance makes behavior hard to predict"],
    limitations: "Abliterated model: refusals removed by design. Quality varies by quant level.",
    useCases: ["Creative writing", "Roleplay", "Local GGUF experimentation"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "dphn/Dolphin3.0-Llama3.1-8B",
    name: "Dolphin 3.0",
    creator: "Dphn (Cognitive Computations)",
    baseModel: "Llama 3.1 8B",
    params: "8B",
    license: "llama3.1",
    collection: "discovery",
    categories: ["trending"],
    badges: ["Fine-Tune", "Tool Calling", "Coding", "Uncensored"],
    discoveryBadges: ["Trending", "Coding"],
    description:
      "The flagship generalist of the Dolphin lineage — an instruct tune of Llama 3.1 8B designed to be steerable and locally owned.",
    architecture: "Llama 3.1 8B dense transformer, instruct fine-tune.",
    mergeInfo: null,
    trainingNotes: "Trained by Eric Hartford's Cognitive Computations team on a broad instruct mix emphasizing function calling, coding, and steerability.",
    strengths: ["Strong steerability", "Agentic / function calling", "Good coding for its size"],
    weaknesses: ["8B knowledge limits", "No built-in safety rails"],
    limitations: "Alignment is delegated to the system prompt.",
    useCases: ["Local agents", "Tool-calling experiments", "General chat on consumer hardware"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "WizardLMTeam/WizardCoder-Python-34B-V1.0",
    name: "WizardCoder Python 34B",
    creator: "WizardLM Team",
    baseModel: "CodeLlama 34B Python",
    params: "34B",
    license: "llama2",
    collection: "discovery",
    categories: ["coding"],
    badges: ["Fine-Tune", "Coding"],
    discoveryBadges: ["Coding"],
    description:
      "The Evol-Instruct coding specialist: CodeLlama 34B trained on iteratively evolved coding instructions. At release it beat GPT-3.5 on HumanEval.",
    architecture: "CodeLlama 34B Python dense transformer, Evol-Instruct fine-tune.",
    mergeInfo: null,
    trainingNotes: "Uses the Evol-Instruct method to rewrite coding instructions into harder variants.",
    strengths: ["Strong Python generation for its generation", "Well-studied training method"],
    weaknesses: ["Python-centric", "Superseded by newer code models"],
    limitations: "Llama 2 community license; benchmark claims may be contaminated.",
    useCases: ["Python code generation", "Code-model research comparisons"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
  {
    hfId: "mlabonne/NeuralBeagle14-7B",
    name: "NeuralBeagle14",
    creator: "Maxime Labonne",
    baseModel: "Mistral 7B lineage",
    params: "7B",
    license: "cc-by-nc-4.0",
    collection: "discovery",
    categories: ["trending", "experimental"],
    badges: ["Merge", "Fine-Tune", "Experimental", "Reasoning"],
    discoveryBadges: ["Experimental", "Reasoning"],
    description:
      "A DPO fine-tune of a lazymergekit merge — briefly the strongest 7B on the Open LLM Leaderboard.",
    architecture: "Mistral 7B lineage, DARE-TIES merge + DPO alignment.",
    mergeInfo: "Merge of Turdus and OpenBeagle via lazymergekit, then DPO-tuned.",
    trainingNotes: "Demonstrates the merge-then-align community recipe.",
    strengths: ["Exceptional 7B scores at release", "Documented merge recipe"],
    weaknesses: ["Non-commercial license", "Leaderboard contamination risk"],
    limitations: "Leaderboard-era merges may overfit eval suites.",
    useCases: ["Merge research", "Local experimentation"],
    capabilities: { ...CAPS_ALL_OFF, install: true, benchmark: true, gguf: true },
  },
]

// Legacy combined catalog — preserved for any code that still imports it.
// The page now prefers `CORE_COMMUNITY_MODELS` and the daily discovery subset.
export const BLACK_MARKET_CATALOG: BlackMarketModel[] = [
  ...CORE_COMMUNITY_MODELS,
  ...DAILY_DISCOVERY_POOL,
]

export const ALL_BADGES: BlackMarketBadge[] = [
  'Experimental', 'Merge', 'Fine-Tune', 'Reasoning', 'Coding', 'Roleplay',
  'Vision', 'Long Context', 'Tool Calling', 'Uncensored', 'GGUF', 'MTP',
  'Trending', 'New', 'Staff Pick', 'Fast', 'Creative',
]

export const ALL_DISCOVERY_BADGES: DiscoveryBadge[] = [
  'Trending', 'New', 'Staff Pick', 'Experimental', 'Fast', 'Reasoning', 'Coding', 'Tool Calling', 'Creative',
]

// ── Daily discovery constants ────────────────────────────────────
export const DAILY_DISCOVERY_COUNT = 4
export const DAILY_DISCOVERY_HISTORY_DAYS = 14
