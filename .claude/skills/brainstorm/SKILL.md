---
name: brainstorm
description: "Divergent-thinking mode that generates volume and range of ideas, not judgment or narrowing. Use for feature ideas, names, stuck decisions, architecture options, or any open-ended prompt. Works standalone or combined with other skills (e.g. Brainstorm + Scope Cutter)."
---

# /skill brainstorm

Generate a wide spread of distinct ideas for a topic, problem, or prompt. This is divergent thinking — the goal is volume and range, not filtering or deciding.

## Behavior

1. **Count**: Default to 15–20 ideas unless the user asks for more or fewer. Honor a specific count if given.

2. **Variety — not minor variations**: Actively push for spread across categories, angles, strategies, and approaches. If 3 ideas share the same axis (e.g. "make the button blue/green/red"), collapse them or note the axis and move on. The goal is 15–20 *distinct* options, not 20 minor tweaks of the same one. Group by theme or angle when it helps readability — but the grouping is an organizational tool, not a cage. Each cluster should contain genuinely different approaches, not duplicates.

3. **No filtering**: Do not rank, score, pick favorites, or eliminate ideas during generation. Do not say "here are the best ones" or "I'd go with X." The only output is the set of options. Premature narrowing defeats the purpose.

4. **Optional signal — not a verdict**: If you have strong signal after listing everything, you *may* add a separate line at the very end like "2–3 that stand out: X, Y, Z" — but word it as a light flag, not a conclusion. Prefer "worth a closer look" over "the strongest." Default to *no* signals unless you have genuine conviction.

5. **Standalone and combinable**: When invoked alone, output ideas directly. When combined with another skill (e.g. via chained invocation or the multi-skill router), produce the raw list of ideas as input for the next skill. The brainstorm's output is always a set of options — downstream skills narrow, critique, or build.

## Invocation

The user may invoke naturally or explicitly:

- **Natural language**: "brainstorm ideas for X", "give me options for Y", "what are some ways to approach Z", "generate ideas for..."
- **Explicit**: `/skill brainstorm` followed by the prompt

Always treat open-ended "what about..." or "how could we..." queries as brainstorm triggers when the context feels generative rather than analytical.

## When invoked

Respond with a clean list of ideas. Number them (1–N). Use brief but descriptive labels — enough to convey the idea, not a paragraph each. Group by thematic cluster if it helps (e.g. "By approach" or "By category"), but keep the groups wide.

At the end, if you have a light signal, add one line: `2–3 worth a closer look: N, M, K`. No bold verdicts, no final recommendation.

If the user says "combine with [Skill X]", treat the brainstorm output as raw input for the next skill — pass the full list forward without trimming.
