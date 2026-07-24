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
// could support (install, benchmark, router). The UI renders disabled
// affordances off this today; the execution layer plugs in later
// without restructuring the catalog or the page.
// ───────────────────────────────────────────────────────────────────

export type BlackMarketCategory = 'trending' | 'reasoning' | 'coding' | 'experimental' | 'verified'

export type BlackMarketBadge =
  | 'Experimental' | 'Merge' | 'Fine-Tune' | 'Reasoning' | 'Coding'
  | 'Roleplay' | 'Vision' | 'Long Context' | 'Tool Calling'
  | 'Uncensored' | 'GGUF' | 'MTP'

export interface BlackMarketModel {
  /** Hugging Face repo id — must be a real, verified repo. */
  hfId: string
  name: string
  creator: string
  baseModel: string
  /** Human-readable parameter count, e.g. "27B". */
  params: string
  license: string
  categories: BlackMarketCategory[]
  badges: BlackMarketBadge[]
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

export type BlackMarketEntry = BlackMarketModel & { stats: BlackMarketLiveStats }

export const CATEGORY_META: Record<BlackMarketCategory, { emoji: string; label: string; blurb: string }> = {
  trending:     { emoji: '🔥', label: 'Trending',      blurb: 'Most talked-about community models.' },
  reasoning:    { emoji: '🧠', label: 'Reasoning',     blurb: 'Models optimized for planning, logic, and deep thinking.' },
  coding:       { emoji: '💻', label: 'Coding',        blurb: 'Models specialized for software engineering.' },
  experimental: { emoji: '🧪', label: 'Experimental',  blurb: 'Wild community experiments, merges, and research models.' },
  verified:     { emoji: '⭐', label: 'Enry Verified', blurb: 'Models Enry has benchmarked and recommends.' },
}

// Every hfId below was verified live against the HF API before being
// added (200, or a followed redirect for Dolphin's org rename).
export const BLACK_MARKET_CATALOG: BlackMarketModel[] = [
  {
    hfId: 'DavidAU/Qwen3.6-27B-Fable-Fusion-711-Uncensored-Heretic-NM-DAU-NEO-MAX-MTP-GGUF',
    name: 'Qwen3.6 27B Fable Fusion 711',
    creator: 'DavidAU',
    baseModel: 'Qwen 3.6 27B',
    params: '27B',
    license: 'apache-2.0',
    categories: ['trending', 'experimental'],
    badges: ['Experimental', 'Merge', 'Fine-Tune', 'Uncensored', 'GGUF', 'MTP', 'Roleplay', 'Reasoning'],
    description:
      'A maximalist multi-stage tune-and-merge of Qwen 3.6 27B: abliterated ("Heretic"), NEO-imatrix quantized, with MTP quants for faster decoding. Tuned on strict creative-writing datasets for vivid prose across every genre.',
    architecture: 'Qwen 3.6 dense transformer, multi-stage merged, GGUF quants (regular + MTP) with NEO imatrix.',
    mergeInfo: 'Multi-stage tune + multi-state merge over Qwen 3.6 27B, abliterated via the Heretic method, then NEO-MAX imatrix quantization.',
    trainingNotes: 'Fine-tuned on DavidAU\'s Polar-STRICT and F451-STRICT datasets (per the model card), targeting creative writing, roleplay, and general use with thinking traces retained.',
    strengths: ['Vivid creative prose', 'Roleplay and fiction across genres', 'Thinking/reasoning traces', 'Fast local decoding via MTP quants'],
    weaknesses: ['Uncensored — no safety alignment', 'Merge provenance makes behavior hard to predict', 'Not benchmarked by Enry'],
    limitations: 'Abliterated model: refusals removed by design. Output quality varies heavily by quant level. Community claims are unverified.',
    useCases: ['Creative writing', 'Roleplay', 'Local GGUF experimentation'],
    capabilities: { install: true, benchmark: true, router: false, gguf: true },
  },
  {
    hfId: 'dphn/Dolphin3.0-Llama3.1-8B',
    name: 'Dolphin 3.0',
    creator: 'Dphn (Cognitive Computations)',
    baseModel: 'Llama 3.1 8B',
    params: '8B',
    license: 'llama3.1',
    categories: ['trending'],
    badges: ['Fine-Tune', 'Tool Calling', 'Coding', 'Uncensored'],
    description:
      'The flagship generalist of the Dolphin lineage — an instruct tune of Llama 3.1 8B designed to be steerable and locally owned: coding, math, agentic tool use, and general chat with the system prompt fully in your control.',
    architecture: 'Llama 3.1 8B dense transformer, instruct fine-tune.',
    mergeInfo: null,
    trainingNotes: 'Trained by Eric Hartford\'s Cognitive Computations team on a broad instruct mix emphasizing function calling, coding, and steerability; deliberately minimal built-in refusals — alignment is delegated to your system prompt.',
    strengths: ['Strong steerability via system prompt', 'Agentic / function calling', 'Good coding for its size', 'Runs on modest hardware'],
    weaknesses: ['8B-class knowledge limits', 'No built-in safety rails', 'Not benchmarked by Enry'],
    limitations: 'The model complies with whatever the system prompt says — you own the alignment layer entirely.',
    useCases: ['Local agents', 'Tool-calling experiments', 'General chat on consumer hardware'],
    capabilities: { install: true, benchmark: true, router: false, gguf: true },
  },
  {
    hfId: 'NousResearch/Hermes-3-Llama-3.1-8B',
    name: 'Nous Hermes 3',
    creator: 'Nous Research',
    baseModel: 'Llama 3.1 8B',
    params: '8B',
    license: 'llama3',
    categories: ['trending', 'reasoning'],
    badges: ['Fine-Tune', 'Reasoning', 'Tool Calling', 'Roleplay'],
    description:
      'Nous Research\'s frontier-of-open instruct tune: advanced agentic capabilities, multi-turn roleplay coherence, long-context reasoning, and structured output — one of the most cited community fine-tune lineages.',
    architecture: 'Llama 3.1 8B dense transformer, full-parameter fine-tune with ChatML.',
    mergeInfo: null,
    trainingNotes: 'Full fine-tune on Nous\'s curated instruct corpus emphasizing agentic behavior, internal monologue reasoning, function calling with typed schemas, and faithful persona adherence.',
    strengths: ['Reliable structured output / JSON mode', 'Function calling', 'Persona and roleplay coherence', 'Well-documented prompt format'],
    weaknesses: ['8B ceiling on hard reasoning', 'Older base than newest community tunes', 'Not benchmarked by Enry'],
    limitations: 'Uses ChatML with specific role tokens — deviating from the documented format degrades quality noticeably.',
    useCases: ['Agent scaffolds', 'Structured extraction', 'Roleplay and persona work'],
    capabilities: { install: true, benchmark: true, router: false, gguf: true },
  },
  {
    hfId: 'teknium/OpenHermes-2.5-Mistral-7B',
    name: 'OpenHermes 2.5',
    creator: 'Teknium',
    baseModel: 'Mistral 7B',
    params: '7B',
    license: 'apache-2.0',
    categories: ['trending', 'reasoning'],
    badges: ['Fine-Tune', 'Reasoning', 'Coding'],
    description:
      'A classic of the open fine-tune era: Mistral 7B trained on ~1M GPT-4-quality instructions. The surprising finding — adding code data improved *non-code* benchmarks — made it a reference point for data-mix research.',
    architecture: 'Mistral 7B dense transformer, instruct fine-tune, ChatML format.',
    mergeInfo: null,
    trainingNotes: 'Trained on roughly 1M primarily GPT-4-generated open instruction datasets, heavily filtered; a 7–14% code mix boosted TruthfulQA, AGIEval, and GPT4All suite scores over OpenHermes 2.',
    strengths: ['Excellent quality-per-parameter for its era', 'Transparent training data story', 'Permissive Apache-2.0 license'],
    weaknesses: ['Superseded by newer 7-9B tunes', 'Short context by modern standards', 'Not benchmarked by Enry'],
    limitations: 'A 2023-era model — knowledge cutoff and context length lag current community releases; best treated as a historically important baseline.',
    useCases: ['Data-mix research baseline', 'Lightweight local inference', 'Fine-tuning starting point'],
    capabilities: { install: true, benchmark: true, router: false, gguf: true },
  },
  {
    hfId: 'WizardLMTeam/WizardCoder-Python-34B-V1.0',
    name: 'WizardCoder Python 34B',
    creator: 'WizardLM Team',
    baseModel: 'CodeLlama 34B Python',
    params: '34B',
    license: 'llama2',
    categories: ['coding'],
    badges: ['Fine-Tune', 'Coding'],
    description:
      'The Evol-Instruct coding specialist: CodeLlama 34B trained on iteratively "evolved" coding instructions of escalating complexity. At release it beat GPT-3.5 on HumanEval — a landmark for open code models.',
    architecture: 'CodeLlama 34B Python dense transformer, Evol-Instruct fine-tune.',
    mergeInfo: null,
    trainingNotes: 'Uses the Evol-Instruct method: seed coding instructions are repeatedly rewritten by an LLM to increase difficulty and rarity, then the model is trained on the evolved set (73.2 pass@1 HumanEval claimed at release).',
    strengths: ['Strong Python generation for its generation', 'Well-studied training method', 'Good at competitive-programming-style problems'],
    weaknesses: ['Python-centric — weaker elsewhere', 'Superseded by newer code models', 'Not benchmarked by Enry'],
    limitations: 'Llama 2 community license (not fully open). Benchmark claims are the authors\' own — treat pre-2024 HumanEval numbers with contamination caution.',
    useCases: ['Python code generation', 'Code-model research comparisons'],
    capabilities: { install: true, benchmark: true, router: false, gguf: true },
  },
  {
    hfId: 'mlabonne/NeuralBeagle14-7B',
    name: 'NeuralBeagle14',
    creator: 'Maxime Labonne',
    baseModel: 'Beagle14-7B (Mistral lineage)',
    params: '7B',
    license: 'cc-by-nc-4.0',
    categories: ['trending', 'experimental'],
    badges: ['Merge', 'Fine-Tune', 'Experimental', 'Reasoning'],
    description:
      'A DPO fine-tune of a lazymergekit merge (itself blending Turdus and OpenBeagle) — briefly the strongest 7B on the Open LLM Leaderboard, and a poster child for the merge-then-align community recipe.',
    architecture: 'Mistral 7B lineage, DARE-TIES merge followed by DPO alignment.',
    mergeInfo: 'Merge of udkai/Turdus and shadowml/OpenBeagle-7B via lazymergekit, then DPO-tuned on a preference dataset (argilla distilabel orca pairs).',
    trainingNotes: 'Demonstrates the 2024-era recipe: merge strong siblings with DARE-TIES, then apply a short DPO pass to recover instruction-following sharpness lost in the merge.',
    strengths: ['Exceptional leaderboard scores for 7B at release', 'Documented, reproducible merge recipe', 'Great case study in merge dynamics'],
    weaknesses: ['Non-commercial license (CC-BY-NC)', 'Merge ancestry includes leaderboard-tuned models — contamination risk', 'Not benchmarked by Enry'],
    limitations: 'Leaderboard-era merges are known to overfit eval suites; real-world quality may not match the scores that made it famous.',
    useCases: ['Merge-technique research', 'Local experimentation', 'Non-commercial projects only'],
    capabilities: { install: true, benchmark: true, router: false, gguf: true },
  },
]

export const ALL_BADGES: BlackMarketBadge[] = [
  'Experimental', 'Merge', 'Fine-Tune', 'Reasoning', 'Coding', 'Roleplay',
  'Vision', 'Long Context', 'Tool Calling', 'Uncensored', 'GGUF', 'MTP',
]
