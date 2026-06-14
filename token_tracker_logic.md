# Token Interceptor & Delta Logic

This document defines how token counts are kept accurate and real-time, how deltas are computed so charts show per-action effort only, and how threshold alerts work.

---

## 1. Goal

- **Accurate counts:** Token counts reflect actual effort for each action.
- **Real-time:** The dashboard updates as the model streams (e.g., Mental (M) increments live).
- **No history bloat:** Each bar in the chart represents only the effort for that specific page/action, not cumulative conversation history.

---

## 2. The "Delta" Rule

### Problem

LLM APIs typically return **cumulative** token counts over the whole conversation (input + output so far). If you use raw totals, every new message adds to the same growing total, so later actions look much heavier than they are and charts are misleading.

### Rule

**For each step/action, use token *deltas*, not raw totals.**

- **Previous step total:** Sum of all tokens (input + output) at the *end* of the previous action (or 0 for the first action).
- **Current step total:** Sum of all tokens (input + output) at the *end* of the current action.
- **Delta for this action:**
  $$\Delta_{\text{action}} = \text{Current step total} - \text{Previous step total}$$

All operator token counts for this action (M, P, K, H) must be derived from or consistent with this delta so that:

- Each bar in the chart = effort for **that** action only.
- No double-counting of earlier turns.

### Implementation Notes

- Persist **last step total tokens** (e.g., `lastStepTotalTokens`) after each action.
- When the next action completes, compute:
  - `deltaTokens = currentStepTotalTokens - lastStepTotalTokens`
- Assign delta to operators (M, P, K, H) for this action (see §4 if you split by type).
- Then update: `lastStepTotalTokens = currentStepTotalTokens`.

---

## 3. Real-time Update (Streaming)

### Goal

As the agent "thinks," the **Mental (M)** token count (and optionally others) should **increment live** on the dashboard, not only when the action finishes.

### Hooking Into the Streaming Response

1. **Intercept the stream:** Use the same stream that delivers assistant chunks (e.g., SSE or `ReadableStream` from the AI SDK / provider).
2. **Token events:** If the API emits token-by-token or chunk-by-chunk usage:
   - Listen for **usage** or **token** events in the stream.
   - Separate **reasoning/thinking** tokens from **response** tokens (if the API distinguishes them).
3. **Map to operators:**
   - **Mental (M):** Increment M for every token (or chunk) that belongs to "reasoning," "chain-of-thought," or "thinking" output until the model commits to an action (e.g., before a tool call or final answer).
   - **Other operators (P, K, H):** Update when the corresponding part of the response is streamed (e.g., selector text → P, typed content → K). If the API doesn’t separate these, allocate the delta by heuristics or only update at end of action.
4. **Push to UI:** On each token (or batched) update:
   - Emit an event or update state (e.g., `actionInProgress.operators.M`, `actionInProgress.totalTokens`).
   - Dashboard subscribes to this and re-renders so the Mental (M) bar (and others) grow in real time.

### Pseudo-flow

```
Stream chunk received
  → Classify: reasoning vs response vs tool_call
  → If reasoning: increment M for this action
  → If selector/locator: increment P
  → If typed text: increment K
  → Persist "current step" running totals
  → Push update to dashboard (e.g., via SSE or WebSocket)
  → Dashboard updates M (and P, K if applicable) live
```

### Fallback

If the provider only returns **total usage at the end** of the request:

- You cannot get true real-time M during the stream.
- Still apply the **Delta Rule** using the totals at end of each step.
- Optionally show a "loading" or "thinking" state and then a single update when the action completes with that step’s delta.

---

## 4. Allocating Delta to Operators (M, P, K, H)

For each action you have a **delta** (total new tokens this step). To store M, P, K, H separately:

- **If the API gives per-token or per-segment labels:** Use them (e.g., "reasoning" → M, "selector" → P, "input text" → K, "system" → H).
- **If the API only gives a single total per request:** Use heuristics, e.g.:
  - **M:** Estimate from length of reasoning/CoT segment (if you can isolate it in the stream or in the final message).
  - **P:** Count tokens in selector/locator/coordinates in the action payload.
  - **K:** Count tokens in typed text or form payload.
  - **H:** For this action, use amortized system prompt tokens (e.g., `systemPromptTokens / number of actions`) or set H once per session.

Ensure: **M + P + K + H (for this action) ≤ delta** (or equal if you have exact breakdown). Do not exceed the delta to avoid inflating the bar.

---

## 5. Threshold Alert Logic

### User Threshold

- **User Threshold** = configurable limit (e.g., max acceptable tokens per action).
- Stored in app state or user settings (e.g., `userThreshold`).

### Rule

For each **action** (after its delta is computed):

1. Compute **action total tokens** = delta for this action (or M + P + K + H for this action).
2. Compare to **User Threshold**:
   - If `actionTotalTokens > userThreshold` → set **`isError: true`** for that action.
   - Otherwise → **`isError: false`** (or omit).

### Implementation

- Add to the **Action** object (see `goms_schema.md`):
  - `isError: boolean` (or `thresholdExceeded: boolean`).
- After computing delta and operator counts:
  ```text
  actionTotalTokens = M + P + K + H  // for this action only (delta)
  isError = actionTotalTokens > userThreshold
  ```
- Persist `isError` with the action so the UI can highlight or flag that bar (e.g., red, warning icon).

### UI

- Dashboard: When rendering an action, if `action.isError === true`, show alert state (e.g., red bar, badge, or toast for that action).
- Optional: Emit a **threshold exceeded** event for analytics or logging.

---

## 6. Summary

| Concern | Rule / Behavior |
|--------|------------------|
| **Delta** | Per-action tokens = current step total − previous step total. Never use raw cumulative totals for chart bars. |
| **Real-time** | Hook into streaming; increment Mental (M) (and P, K if available) as tokens arrive; push updates to dashboard so bars grow live. |
| **Threshold** | If an action’s delta (or M+P+K+H) > User Threshold → set `isError: true` for that action and show alert in UI. |

This logic should be implemented in the token interceptor and in the code that updates the GOMS Action objects and the dashboard state.
