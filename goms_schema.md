# Synthetic GOMS Data Structure

This document defines how technical API data (e.g., LLM tokens, API responses) is translated into GOMS operator categories and how difficulty is scored.

---

## 1. GOMS Operator Categories

Every **Action** in the system is described by five operators. Each operator is stored and measured separately.

| Symbol | Name       | Description |
|--------|------------|-------------|
| **M**  | Mental     | Cognitive / reasoning effort before an action is chosen |
| **P**  | Pointing   | Effort to identify and specify the target of the action |
| **K**  | Keystroke  | Effort associated with text or form input |
| **H**  | Homing     | Effort from static, unchanging context (rules, system prompt) |
| **R**  | Response   | System response time (waiting for the environment) |

---

## 2. Operator Logic (API → GOMS Mapping)

### Mental (M)

- **Definition:** Cognitive work the model does before deciding what to do.
- **Technical mapping:** Map to **Chain-of-Thought / Reasoning** tokens — i.e., tokens the model outputs *before* it commits to an action (explanations, step-by-step reasoning, “let me think…”).
- **Stored as:** Count of reasoning/CoT tokens for that action (integer or float).

### Pointing (P)

- **Definition:** Effort to describe *what* is being interacted with (the target).
- **Technical mapping:** Map to tokens used to describe the **element** — e.g., CSS selectors, coordinates, element IDs, accessibility labels, or any locator/selector text.
- **Stored as:** Count of “pointing” tokens (selector/locator/coordinate description) for that action.

### Keystroke (K)

- **Definition:** Effort for producing text or structured input.
- **Technical mapping:** Map to tokens used for **text input or form data** — e.g., the content the user (or agent) types, form values, or any “keystroke” payload.
- **Stored as:** Count of keystroke-related tokens for that action.

### Homing (H)

- **Definition:** Cost of the fixed context that doesn’t change per action.
- **Technical mapping:** Map to **static** tokens — e.g., system prompts, fixed rules, schema definitions, or any context that is reused across actions and not action-specific.
- **Stored as:** Count of static/homing tokens attributed to that action (can be amortized or full system prompt size, per your policy).

### Response (R)

- **Definition:** Time the user (or system) waits for the environment to respond.
- **Technical mapping:** Map to **literal system response time** in seconds — e.g., API latency, time to next paint, or time until the next actionable state.
- **Stored as:** Numeric value in **seconds** (float).

---

## 3. Difficulty Score Calculation

Difficulty is expressed as a percentage derived from total “effort” tokens relative to a user-defined threshold.

**Formula:**

$$Score = \frac{\text{Total Tokens}}{\text{User Threshold}} \times 100$$

Where:

- **Total Tokens** = sum of token counts for the operators that use tokens for that action, e.g.  
  `Total Tokens = M + P + K + H`  
  (R is in seconds, not tokens; include R in the Action object but not in this token sum unless you define a separate “time cost” conversion.)
- **User Threshold** = a configurable number (e.g., max acceptable tokens per action or per task) set by the user or system.

**Result:** A percentage. The UI can show this as a “difficulty” or “cognitive load” percentage (e.g., 0–100%, or allow >100% if over threshold).

*Optional:* If you want R to influence the score, define a separate formula, e.g.  
`Score = (Total Tokens / User Threshold) * 100 + (R / Time Threshold) * 100` and document the Time Threshold.

---

## 4. Action Object Schema

Every **Action** in the database (or in-memory structure) **must** store the five operator values separately.

**Minimal structure:**

```json
{
  "actionId": "string",
  "type": "click | type | scroll | done",
  "description": "string",
  "operators": {
    "M": 0,
    "P": 0,
    "K": 0,
    "H": 0,
    "R": 0
  },
  "totalTokens": 0,
  "difficultyScore": 0
}
```

**Field rules:**

| Field           | Type    | Description |
|----------------|---------|-------------|
| `operators.M`  | number  | Mental (reasoning/CoT) token count |
| `operators.P`  | number  | Pointing (selector/locator) token count |
| `operators.K`  | number  | Keystroke (text/form input) token count |
| `operators.H`  | number  | Homing (static context) token count |
| `operators.R`  | number  | Response time in **seconds** |
| `totalTokens`  | number  | `M + P + K + H` (or your chosen token sum) |
| `difficultyScore` | number | `(totalTokens / userThreshold) * 100` |

**Example:**

```json
{
  "actionId": "act_001",
  "type": "click",
  "description": "Click the Submit button",
  "operators": {
    "M": 120,
    "P": 45,
    "K": 0,
    "H": 800,
    "R": 1.2
  },
  "totalTokens": 965,
  "difficultyScore": 48.25
}
```

*(With `userThreshold = 2000`, Score = (965 / 2000) × 100 = 48.25.)*

---

## 5. Summary

- **Operators:** M (reasoning), P (pointing/selectors), K (keystroke/text), H (static context), R (response time in seconds).
- **Difficulty:** `Score = (Total Tokens / User Threshold) × 100` for UI percentage.
- **Action:** Every action stores `operators.M`, `operators.P`, `operators.K`, `operators.H`, and `operators.R` separately, plus optional `totalTokens` and `difficultyScore`.

This schema is the single source of truth for Synthetic GOMS in the Agent Checker / VibeCheck Proxy codebase.
