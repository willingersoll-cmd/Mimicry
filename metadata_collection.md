# Metadata & Benchmarking Setup

This document defines how to capture the **"why"** behind the **"how much"** — DOM context for each action and a Token Density metric for detecting Visual Noise. It complements `goms_schema.md`, `token_tracker_logic.md`, and `mimicry_dashboard_ui.md`.

---

## 1. Goal

- **DOM Capture:** Store a snippet of the HTML/DOM the agent was looking at for every action, so designers can tell whether a usability issue is due to **messy code** or **bad UI**.
- **Token Density:** Surface a metric (Tokens / Number of Buttons) to flag **Visual Noise** — when a page has few buttons but requires many tokens to navigate.

---

## 2. DOM Capture

### Purpose

For every action, save a **snippet of the HTML/DOM** that was in scope when the agent decided what to do. This lets designers:

- See the exact markup the agent (and user) had to interpret.
- Distinguish **usability errors** caused by:
  - **Messy code:** Deep nesting, missing semantics, unclear structure, duplicate IDs, etc.
  - **Bad UI:** Unclear labels, poor layout, or confusing flow despite reasonable markup.

### What to Capture

- **Scope:** The DOM (or a subset) that corresponds to the **current viewport** or the **target element and its ancestors/siblings** at the time of the action.
- **Format:** HTML string (or a serialized subtree). Optionally prune scripts, styles, and long attributes to keep size manageable.
- **When:** At the moment the action is taken (e.g., before or after click/type/scroll), using the same page state the agent used to decide.

### Storage

- Attach to the **Action** object (see `goms_schema.md`).
- **Field name:** e.g. `domSnippet` or `domCapture`.
- **Type:** String (HTML) or structured object (e.g. `{ html: string, viewport?: { width, height } }`).

### Schema Addition

Extend the Action object with:

| Field         | Type   | Description |
|---------------|--------|-------------|
| `domSnippet`  | string | HTML snippet (or serialized DOM subtree) for the viewport or target region at action time. Optional. |

### Implementation Notes

- **Playwright / browser:** Use `page.content()` for full HTML, or `page.locator(selector).evaluate(el => el.outerHTML)` for a specific element and its subtree. For “viewport only,” consider `page.evaluate(() => document.documentElement.outerHTML)` and optionally clip by viewport bounds or a max length.
- **Size limit:** Cap snippet length (e.g. first 50KB or 10K chars) to avoid bloating storage. Optionally strip scripts and normalize whitespace.
- **Privacy/sensitivity:** If capturing real sites, consider stripping or hashing sensitive attributes (e.g. `data-*`, `autocomplete` values) per policy.

### Display (Optional)

- In the Mimicry dashboard (see `mimicry_dashboard_ui.md`): allow expanding an action (e.g. in Sidebar or a detail panel) to show **DOM snippet** (read-only, optionally syntax-highlighted or in a `<pre>`/code block).
- Label clearly: “DOM at action time” so designers can correlate high token cost or errors with specific markup.

---

## 3. Token Density Metric

### Definition

**Token Density** = tokens spent on a page (or per action) relative to the number of **interactive targets** (e.g. buttons).

Formula:

$$\text{Token Density} = \frac{\text{Tokens (for this page or action)}}{\text{Number of Buttons}}$$

- **Tokens:** Total tokens for the action(s) on that page (e.g. delta tokens for one action, or sum of deltas for all actions on the same URL/view).
- **Number of Buttons:** Count of **buttons** (and optionally links or other clickables) in the DOM at action time — e.g. `<button>`, `<input type="submit">`, `<a role="button">`, or elements with click handlers, depending on definition.

### Interpretation

- **High Token Density:** Many tokens per button → the agent (and user) had to do a lot of “thinking” or parsing to find or use few controls → suggests **Visual Noise** or **poor affordance** (cluttered layout, unclear hierarchy, or messy DOM).
- **Low Token Density:** Few tokens per button → navigation was efficient relative to the number of choices.

### When to Compute

- **Per action:** Tokens = delta for that action; Buttons = count in the DOM snippet (or live DOM) at that action. Store **Token Density** on the action.
- **Per page/URL:** Tokens = sum of deltas for all actions on that page; Buttons = count at first load or at a representative action. Use for benchmarking or comparison across pages.

### Storage

- Add to the **Action** object (optional):
  - `buttonCount`: number of buttons (and optionally other targets) in scope at action time.
  - `tokenDensity`: `tokens / max(buttonCount, 1)` (avoid division by zero).
- Optionally add a **flag** or **threshold:** e.g. `visualNoiseWarning: tokenDensity > THRESHOLD` (THRESHOLD configurable).

### Schema Addition

| Field              | Type   | Description |
|--------------------|--------|-------------|
| `buttonCount`      | number | Count of buttons (and optionally links/clickables) in DOM at action time. |
| `tokenDensity`     | number | Tokens / max(buttonCount, 1) for this action (or page). |
| `visualNoiseWarning`| boolean| True if tokenDensity exceeds a configured threshold. Optional. |

### Implementation Notes

- **Button count:** From the captured DOM snippet or live DOM, count elements matching: `button`, `input[type="submit"]`, `input[type="button"]`, `a[href]` (if treating links as targets), `[role="button"]`, etc. Document the exact selector set so the metric is consistent.
- **Tokens:** Use the same delta (or sum) as in `token_tracker_logic.md` and `goms_schema.md`.
- **Threshold:** Make the Visual Noise threshold configurable (e.g. “flag when tokenDensity > 500” or “> 1000”).

---

## 4. Summary

| Item | Purpose |
|------|--------|
| **DOM Capture** | Store `domSnippet` per action so designers can see if usability issues come from messy code vs bad UI. |
| **Token Density** | `Tokens / Number of Buttons`; high value suggests Visual Noise. |
| **Schema** | Action object extends with `domSnippet`, `buttonCount`, `tokenDensity`, optional `visualNoiseWarning`. |

This document is the single source of truth for metadata collection and benchmarking setup.
