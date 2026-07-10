# Graph Report - /workspaces/enry.agent  (2026-07-09)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 949 nodes · 1880 edges · 76 communities (51 shown, 25 thin omitted)
- Extraction: 98% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 27 edges (avg confidence: 0.74)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `af0be2b1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- install.sh
- page.tsx
- center-panel.tsx
- page.tsx
- saveResource
- dependencies
- page.tsx
- builtin-launcher.tsx
- The Agency - README.md
- Multi-Agent Systems Architect Agent
- automations.ts
- layout.tsx
- route.ts
- convert.sh
- AI Data Remediation Engineer
- resolveResourceUserId
- lib.sh
- compilerOptions
- race-pace-calculator.tsx
- countdown-tracker.tsx
- CLAUDE.md - enry.agent Project Documentation
- daily-briefing-runner.tsx
- study-timer-panel.tsx
- workout-logger-panel.tsx
- bell-schedule.tsx
- auth.ts
- supabase.ts
- route.ts
- MatrixRain
- page.tsx
- page.tsx
- route.ts
- workout-logger.tsx
- route.ts
- grade-calculator.tsx
- route.ts
- repo-reviewer.tsx
- Solidity Smart Contract Engineer Agent
- route.ts
- route.ts
- route.ts
- agent-mark.tsx
- Mobile App Builder Agent
- Voice AI Integration Engineer Agent
- lint-agents.sh
- route.ts
- seed-featured-prompts.mjs
- seed-prompts.ts
- route.ts
- route.ts
- seed-prompts.ts
- Code Reviewer
- Email Intelligence Engineer
- WeChat Mini Program Developer Agent
- WordPress Shopping Cart Engineer Agent
- setup.sh
- check-agent-originality.sh
- eslint.config.mjs
- next.config.ts
- postcss.config.mjs
- create-upload-bucket.mjs
- vercel.json
- Codebase Onboarding Engineer
- Embedded Firmware Engineer
- Feishu Integration Developer
- Git Workflow Master
- Workflow: Book Chapter Development
- GitHub FUNDING.yml
- The Agency - SECURITY.md
- { GET, POST }

## God Nodes (most connected - your core abstractions)
1. `resolveResourceUserId()` - 23 edges
2. `supabase` - 23 edges
3. `saveResource()` - 21 edges
4. `main()` - 19 edges
5. `ModalShell()` - 19 edges
6. `The Agency - README.md` - 19 edges
7. `generateEmbedding()` - 18 edges
8. `CenterPanel()` - 17 edges
9. `loadResources()` - 17 edges
10. `err()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `ToolDef` --references--> `ResourceType`  [EXTRACTED]
  src/app/resources/page.tsx → src/lib/resources.ts
- `AGENTS.md - Next.js Agent Rules` --references--> `Next.js Framework (App Router)`  [EXTRACTED]
  AGENTS.md → CLAUDE.md
- `README.md - Next.js Project Readme` --references--> `Next.js Framework (App Router)`  [EXTRACTED]
  README.md → CLAUDE.md
- `GitHub New Agent Request Issue Template` --references--> `The Agency - CONTRIBUTING.md`  [INFERRED]
  agency-agents/.github/ISSUE_TEMPLATE/new-agent-request.yml → agency-agents/CONTRIBUTING.md
- `GitHub Bug Report Issue Template` --references--> `The Agency - README.md`  [INFERRED]
  agency-agents/.github/ISSUE_TEMPLATE/bug-report.yml → agency-agents/README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **enry.agent Chat Streaming Pipeline** — concept_usechat, concept_api_chat_route, concept_convert_to_model_messages, concept_stream_text, concept_to_ui_message_stream_response [EXTRACTED 1.00]
- **NVIDIA NIM Model Registry for enry.agent** — concept_nvidia_nim, concept_deepseek_v4_pro, concept_minimax_m3, concept_qwen_3_5_122b, concept_glm_5_2 [EXTRACTED 1.00]
- **The Agency Academic Division** — agency_agents_academic_academic_anthropologist, agency_agents_academic_academic_geographer, agency_agents_academic_academic_historian, agency_agents_academic_academic_narratologist, agency_agents_academic_academic_psychologist [EXTRACTED 1.00]
- **AI and ML Engineering Agent Cluster** — agency_agents_engineering_engineering_ai_data_remediation_engineer_agent, agency_agents_engineering_engineering_ai_engineer_agent, agency_agents_engineering_engineering_autonomous_optimization_architect_agent [INFERRED 0.85]
- **Production Operations and ITSM Cluster** — agency_agents_engineering_engineering_devops_automator_agent, agency_agents_engineering_engineering_incident_response_commander_agent, agency_agents_engineering_engineering_it_service_manager_agent [INFERRED 0.88]
- **Data Platform and Storage Agent Cluster** — agency_agents_engineering_engineering_data_engineer_agent, agency_agents_engineering_engineering_database_optimizer_agent, agency_agents_engineering_engineering_ai_data_remediation_engineer_agent [INFERRED 0.80]
- **Engineering Agent Collection** — agency_agents_engineering_engineering_mobile_app_builder, agency_agents_engineering_engineering_multi_agent_systems_architect, agency_agents_engineering_engineering_orgscript_engineer, agency_agents_engineering_engineering_prompt_engineer, agency_agents_engineering_engineering_rapid_prototyper, agency_agents_engineering_engineering_senior_developer, agency_agents_engineering_engineering_software_architect, agency_agents_engineering_engineering_solidity_smart_contract_engineer, agency_agents_engineering_engineering_sre, agency_agents_engineering_engineering_technical_writer, agency_agents_engineering_engineering_voice_ai_integration_engineer, agency_agents_engineering_engineering_wechat_mini_program_developer, agency_agents_engineering_engineering_wordpress_shopping_cart [EXTRACTED 1.00]
- **Multi-Agent Orchestration Topology Patterns** — concept_sequential_chain, concept_parallel_fanout, concept_hierarchical_orchestrator, concept_evaluator_optimizer, concept_mesh_network [EXTRACTED 1.00]
- **Startup MVP Workflow and Memory Ecosystem** — agency_agents_examples_workflow_startup_mvp, agency_agents_examples_workflow_with_memory, agency_agents_engineering_engineering_rapid_prototyper, concept_mcp_memory_server [EXTRACTED 0.90]

## Communities (76 total, 25 thin omitted)

### Community 0 - "install.sh"
Cohesion: 0.07
Nodes (58): box_bot(), box_row(), box_top(), build_selection(), capacity_warn(), check_integrations(), detect_aider(), detect_antigravity() (+50 more)

### Community 1 - "page.tsx"
Cohesion: 0.07
Nodes (41): EnryAgentPage(), SettingsPage(), CenterPanelProps, CornerAccents(), GridBackground(), formatRelativeTime(), LeftSidebar(), LeftSidebarProps (+33 more)

### Community 2 - "center-panel.tsx"
Cohesion: 0.08
Nodes (43): POST(), userId(), CenterPanel(), formatDuration(), formatUptime(), getDisplayInfo(), getSources(), getTextContent() (+35 more)

### Community 3 - "page.tsx"
Cohesion: 0.07
Nodes (31): CATEGORIES, CATEGORY_ICONS, catStyle(), EMPTY_FORM, fmtDate(), FormValues, hashStr(), PromptCard() (+23 more)

### Community 4 - "saveResource"
Cohesion: 0.09
Nodes (30): ModalShell(), ModalShellProps, Flashcard, FlashcardGenerator(), FlashcardGeneratorProps, parseFlashcards(), Issue, Repo (+22 more)

### Community 5 - "dependencies"
Cohesion: 0.05
Nodes (36): dependencies, ai, @ai-sdk/openai, @ai-sdk/react, bcryptjs, cmdk, framer-motion, lucide-react (+28 more)

### Community 6 - "page.tsx"
Cohesion: 0.12
Nodes (27): DetailModal(), SavedPageContent(), TABS, timeAgo(), DetailModal(), SLUG_LABELS, SLUG_MAP, timeAgo() (+19 more)

### Community 7 - "builtin-launcher.tsx"
Cohesion: 0.14
Nodes (28): BuiltinAutomationsLauncher(), ITEMS, NutritionTrackerPanel(), parseMacros(), formatRelativeTime(), UrlWatcherPanel(), BuiltinAutomationId, BuiltinAutomationToggles (+20 more)

### Community 8 - "The Agency - README.md"
Cohesion: 0.07
Nodes (34): Anthropologist Agent, Geographer Agent, Historian Agent, Narratologist Agent, Psychologist Agent, The Agency - CONTRIBUTING.md, The Agency - CONTRIBUTING_zh-CN.md, Brand Guardian Agent (+26 more)

### Community 9 - "Multi-Agent Systems Architect Agent"
Cohesion: 0.07
Nodes (34): Multi-Agent Systems Architect Agent, OrgScript Engineer Agent, Prompt Engineer Agent, Rapid Prototyper Agent, Senior Developer Agent, Software Architect Agent, SRE Agent, Technical Writer Agent (+26 more)

### Community 10 - "automations.ts"
Cohesion: 0.15
Nodes (25): AutomationDetailModal(), AutomationItem(), AutomationsSection(), AutomationsSectionProps, CreateAutomationModal(), formatRelativeTime(), formatSchedule(), activeIntervals (+17 more)

### Community 11 - "layout.tsx"
Cohesion: 0.09
Nodes (23): ibmPlexMono, inter, metadata, spaceGrotesk, viewport, AmbientBackground(), ActionItem, ACTIONS (+15 more)

### Community 12 - "route.ts"
Cohesion: 0.18
Nodes (21): ALLOWED_MODELS, AllowedModel, MODEL_CONFIG, POST(), tavilyClient, GET(), githubToken(), POST() (+13 more)

### Community 13 - "convert.sh"
Cohesion: 0.15
Nodes (18): accumulate_aider(), accumulate_windsurf(), convert_antigravity(), convert_codex(), convert_cursor(), convert_gemini_cli(), convert_kimi(), convert_openclaw() (+10 more)

### Community 14 - "AI Data Remediation Engineer"
Cohesion: 0.11
Nodes (22): AI Data Remediation Engineer, AI Engineer, Autonomous Optimization Architect, Backend Architect, CMS Developer, Data Engineer, Database Optimizer, DevOps Automator (+14 more)

### Community 15 - "resolveResourceUserId"
Cohesion: 0.23
Nodes (15): POST(), userId(), POST(), userId(), DELETE(), GET(), PATCH(), PUT() (+7 more)

### Community 16 - "lib.sh"
Cohesion: 0.12
Nodes (6): agent_slug(), init_ansi(), lib.sh script, slugify(), supports_color(), supports_unicode()

### Community 17 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 18 - "race-pace-calculator.tsx"
Cohesion: 0.16
Nodes (18): PayloadView(), shortDate(), buildCheckpoints(), buildPaceCards(), CalcResult, computeCumulativeTimes(), computeSplits(), fmtSecs() (+10 more)

### Community 19 - "countdown-tracker.tsx"
Cohesion: 0.21
Nodes (15): SavedList(), autoTitle(), QuickNotesWidget(), QuickNotesWidgetProps, CountdownTracker(), CountdownTrackerProps, daysAway(), daysAwayLabel() (+7 more)

### Community 20 - "CLAUDE.md - enry.agent Project Documentation"
Cohesion: 0.25
Nodes (15): AGENTS.md - Next.js Agent Rules, CLAUDE.md - enry.agent Project Documentation, POST /api/chat Route Handler, convertToModelMessages (async, AI SDK), DeepSeek V4 Pro Model, GLM 5.2 Model, MiniMax M3 Model, Next.js Framework (App Router) (+7 more)

### Community 21 - "daily-briefing-runner.tsx"
Cohesion: 0.44
Nodes (10): DailyBriefingCard(), DailyBriefingCardProps, DailyBriefingPanel(), DailyBriefingRunner(), DailyBriefing, dismissBriefing(), loadBriefing(), parseBriefingText() (+2 more)

### Community 22 - "study-timer-panel.tsx"
Cohesion: 0.34
Nodes (11): DURATIONS, formatClock(), StudyTimerPanel(), calculateStreak(), completeSession(), dayKey(), discardSession(), loadSessions() (+3 more)

### Community 23 - "workout-logger-panel.tsx"
Cohesion: 0.38
Nodes (11): WorkoutLoggerPanel(), deleteWorkout(), exerciseNames(), isPlateaued(), loadWorkouts(), logWorkout(), maxWeight(), progressForExercise() (+3 more)

### Community 24 - "bell-schedule.tsx"
Cohesion: 0.23
Nodes (12): BellSchedule(), BellScheduleProps, emptyPeriods(), fmtCountdown(), nowSeconds(), Period, toSeconds(), DailyCheckin() (+4 more)

### Community 25 - "auth.ts"
Cohesion: 0.21
Nodes (8): GET(), getGoogleId(), POST(), GET(), getGoogleId(), POST(), { handlers, signIn, signOut, auth }, config

### Community 26 - "supabase.ts"
Cohesion: 0.26
Nodes (4): GET(), getGoogleId(), PUT(), supabase

### Community 27 - "route.ts"
Cohesion: 0.27
Nodes (10): ArticleSource, generateDailyArticles(), generateDailyPrompts(), GET(), getOwnerGoogleId(), buildPrompt(), CATEGORY_ROTATION, GeneratedPrompt (+2 more)

### Community 28 - "MatrixRain"
Cohesion: 0.27
Nodes (5): AuthTab, ERROR_MESSAGES, FormMode, LoginPage(), MatrixRain

### Community 29 - "page.tsx"
Cohesion: 0.20
Nodes (7): Article, ArticleCard(), ARTICLES, CATEGORIES, CATEGORY_ICONS, CategoryDef, catStyle()

### Community 30 - "page.tsx"
Cohesion: 0.25
Nodes (7): ResourcesContent(), ToolDef, TOOLS, useGridLayout(), useSavedCounts(), AnimatedNumber(), AnimatedNumberProps

### Community 31 - "route.ts"
Cohesion: 0.39
Nodes (6): POST(), userId(), ArticleAnalysis, buildPrompt(), ProcessArticleResult, processArticleUrl()

### Community 32 - "workout-logger.tsx"
Cohesion: 0.36
Nodes (6): isPlateaued(), maxWeight(), SetEntry, WorkoutLoggerProps, WorkoutLoggerTool(), WorkoutRow

### Community 33 - "route.ts"
Cohesion: 0.57
Nodes (6): DELETE(), GET(), POST(), PUT(), userId(), VALID_CATEGORIES

### Community 34 - "grade-calculator.tsx"
Cohesion: 0.43
Nodes (6): GradeCalculator(), GradeCalculatorProps, GradeClass, gradeToGpa(), letterGrade(), newClass()

### Community 35 - "route.ts"
Cohesion: 0.67
Nodes (5): GET(), POST(), userId(), VALID_SOURCES, VALID_TYPES

### Community 36 - "repo-reviewer.tsx"
Cohesion: 0.33
Nodes (5): RepoReviewer(), RepoReviewerProps, SEVERITY_ORDER, SEVERITY_STYLES, Repo

### Community 37 - "Solidity Smart Contract Engineer Agent"
Cohesion: 0.40
Nodes (5): Solidity Smart Contract Engineer Agent, Checks-Effects-Interactions Pattern (Solidity), EVM / Solidity, Foundry Test Framework, OpenZeppelin Contracts

### Community 38 - "route.ts"
Cohesion: 0.70
Nodes (4): DELETE(), GET(), getGoogleId(), POST()

### Community 39 - "route.ts"
Cohesion: 0.70
Nodes (4): DELETE(), GET(), getGoogleId(), POST()

### Community 40 - "route.ts"
Cohesion: 0.70
Nodes (4): DELETE(), GET(), getGoogleId(), POST()

### Community 41 - "agent-mark.tsx"
Cohesion: 0.40
Nodes (3): AgentMarkProps, Size, sizeMap

### Community 42 - "Mobile App Builder Agent"
Cohesion: 0.50
Nodes (4): Mobile App Builder Agent, Jetpack Compose, React Native, SwiftUI

### Community 43 - "Voice AI Integration Engineer Agent"
Cohesion: 0.83
Nodes (4): Voice AI Integration Engineer Agent, faster-whisper, ffmpeg, pyannote.audio

### Community 45 - "route.ts"
Cohesion: 0.83
Nodes (3): DELETE(), GET(), getGoogleId()

## Ambiguous Edges - Review These
- `Senior Developer Agent` → `Dev Agent Instructions (ai/agents/dev.md)`  [AMBIGUOUS]
  agency-agents/engineering/engineering-senior-developer.md · relation: references
- `Senior Developer Agent` → `AI System Component Library (ai/system/component-library.md)`  [AMBIGUOUS]
  agency-agents/engineering/engineering-senior-developer.md · relation: references

## Knowledge Gaps
- **248 isolated node(s):** `setup.sh script`, `check-agent-originality.sh script`, `lib.sh script`, `eslintConfig`, `nextConfig` (+243 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Senior Developer Agent` and `Dev Agent Instructions (ai/agents/dev.md)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Senior Developer Agent` and `AI System Component Library (ai/system/component-library.md)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `ModalShell()` connect `saveResource` to `workout-logger.tsx`, `grade-calculator.tsx`, `repo-reviewer.tsx`, `builtin-launcher.tsx`, `race-pace-calculator.tsx`, `countdown-tracker.tsx`, `daily-briefing-runner.tsx`, `study-timer-panel.tsx`, `workout-logger-panel.tsx`, `bell-schedule.tsx`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `supabase` connect `supabase.ts` to `route.ts`, `center-panel.tsx`, `route.ts`, `route.ts`, `route.ts`, `route.ts`, `route.ts`, `route.ts`, `resolveResourceUserId`, `auth.ts`, `route.ts`, `route.ts`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `resolveResourceUserId()` connect `resolveResourceUserId` to `center-panel.tsx`, `route.ts`, `route.ts`, `supabase.ts`, `route.ts`, `route.ts`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `setup.sh script`, `check-agent-originality.sh script`, `lib.sh script` to the rest of the system?**
  _248 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `install.sh` be split into smaller, more focused modules?**
  _Cohesion score 0.06846846846846846 - nodes in this community are weakly interconnected._