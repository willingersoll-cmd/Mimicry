# Mimicry Dashboard UI

This document defines the visual components and interaction rules for the Mimicry dashboard, based on the Figma design. It assumes GOMS operator data (M, P, K, H, R) and Action objects as defined in `goms_schema.md` and `token_tracker_logic.md`.

---

## 1. Overview

The Mimicry dashboard has three main visual areas that must stay in sync:

| Area | Purpose |
|------|--------|
| **Stacked Histogram** | Shows token effort per action (M, P, K, H) as stacked bars. |
| **Agent's Journey** | Screenshot gallery; one image per action, in sequence. |
| **Sidebar** | List of actions (labels, descriptions, timestamps). |

Interactions:

- **Click bar** → scroll Agent's Journey to the matching screenshot.
- **Hover action in Sidebar** → highlight the corresponding bar in the histogram.

---

## 2. Stacked Histogram

### Layout

- **X-axis:** Sequence of actions.
  - Labels: `Action 1`, `Action 2`, `Action 3`, … (or `1`, `2`, `3` if space is tight).
  - One discrete tick per action; no gaps in sequence.
- **Y-axis:** Token count.
  - Linear scale from 0 to at least the maximum single-action total (M + P + K + H) for the visible data.
  - Optional: cap at User Threshold and show overflow (e.g., “100%+”).
- **Bars:** One bar per action. Bars are **stacked** (segments stacked vertically in order).

### Stack Order and Colors

Each bar is divided into **four segments** (bottom → top), representing M, P, K, H:

| Segment | Operator | Suggested color (examples) | Stack order (bottom → top) |
|---------|----------|----------------------------|-----------------------------|
| M       | Mental    | e.g. Indigo / Purple        | 1 (bottom)                  |
| P       | Pointing  | e.g. Blue                  | 2                           |
| K       | Keystroke | e.g. Teal / Cyan            | 3                           |
| H       | Homing    | e.g. Gray / Slate           | 4 (top)                     |

- Use a **legend** near the chart: “M Mental”, “P Pointing”, “K Keystroke”, “H Homing” with the same colors.
- Segment height = that action’s token count for that operator (M, P, K, or H). Total bar height = M + P + K + H for that action.

### Visual Error State

- **Condition:** For a given action, `action.isError === true` (i.e., that action’s delta or total tokens exceeded the User Threshold).
- **Behavior:** The **entire bar** for that action switches to a **high-contrast warning state**:
  - **Primary:** Solid **red** (`#DC2626` or equivalent).
  - **Alternative:** Another high-contrast warning color (e.g. orange `#EA580C`) if red is reserved for other errors.
- **Override:** In error state, the four M/P/K/H segments are **not** shown; the whole bar is the single warning color.
- **Optional:** Tooltip or label on the bar: “Over threshold” or “Exceeds limit”.

### Bar Interaction

- **Click:** Clicking a bar must trigger **auto-scroll** of the **Agent's Journey** so that the **matching screenshot** (same action index) is brought into view (see §4).
- **Hover:** Optional tooltip showing: Action index, M / P / K / H breakdown, total tokens, and if `isError`, “Over threshold”.

### Accessibility

- Ensure sufficient contrast for all segment colors and for the red error state.
- Provide a text alternative or aria-label for the chart (e.g., “Stacked histogram of token count per action; M, P, K, H”).

---

## 3. Agent's Journey (Screenshot Gallery)

### Layout

- **Content:** One image per action, in **sequence** (Action 1, Action 2, …).
- **Layout:** Horizontal scroll, or vertical list, or grid — per Figma. Each item is a **screenshot** plus optional caption (e.g., “Action 1”, “Action 2”).
- **Mapping:** Item at index `i` corresponds to **Action i + 1** (0-based index → “Action 1”, etc.).

### Syncing (from Histogram)

- When the user **clicks a bar** for “Action N”:
  1. Resolve the **matching gallery item** (index `N - 1`).
  2. **Scroll** the Agent's Journey container so that this item is in view (e.g., scroll into view, or scroll to a fixed position such as “top of list” or “center of viewport”).
- Smooth scroll is recommended (e.g., `scrollIntoView({ behavior: 'smooth' })` or equivalent).

### Optional Syncing (from Sidebar)

- If the Sidebar supports “click to scroll”: clicking an action in the Sidebar can also scroll the Agent's Journey to the same action index, using the same rule as above.

---

## 4. Sidebar (Action List)

### Layout

- **Content:** One row (or card) per action, in sequence.
- **Per row:** At least action label (e.g., “Action 1”), and optionally description, timestamp, operator summary (M, P, K, H), and error badge if `isError`.

### Syncing (to Histogram)

- When the user **hovers** over an action row (e.g., “Action N”):
  1. **Highlight** the **corresponding bar** in the stacked histogram (same index N).
  2. Highlight method: e.g. outline, glow, or temporary overlay; distinct from the normal and error states.
  3. On **mouse leave**, remove the highlight from that bar.

### Optional

- **Click** on a Sidebar action: same behavior as clicking the bar — scroll Agent's Journey to the matching screenshot.

---

## 5. Syncing Summary

| User action              | Result |
|--------------------------|--------|
| **Click bar** (Action N) | Auto-scroll Agent's Journey to screenshot for Action N. |
| **Hover Sidebar** (Action N) | Highlight the bar for Action N in the histogram. |
| **Mouse leave Sidebar** | Remove bar highlight. |

All indices are 1-based in the UI (“Action 1”, “Action 2”); internally use 0-based index for arrays and scrolling.

---

## 6. Data Contract

- **Actions:** Array of objects with at least:
  - `operators: { M, P, K, H }` (numbers)
  - `isError: boolean`
  - Optional: `description`, `timestamp`, `screenshot` (URL or base64), `actionId`.
- **User Threshold:** Single number used for error flagging and optionally for Y-axis or “100%” reference.

---

## 7. Implementation Notes

- **Histogram:** Use a chart library that supports stacked bars (e.g., Recharts, Chart.js, D3) or custom SVG/Canvas. Pass per-action `[M, P, K, H]` and a flag `isError`; render one bar per action; on `isError` render a single red (or warning) bar.
- **Scroll sync:** Give each Agent's Journey item a stable `data-action-index` or `id` (e.g. `journey-action-1`). On bar click, call `document.getElementById('journey-action-' + N)?.scrollIntoView({ behavior: 'smooth' })` or the framework equivalent.
- **Hover sync:** Keep a “hovered action index” in state. When Sidebar row is hovered, set index; when histogram is drawn, add a highlight class or style to the bar at that index. On mouse leave from Sidebar, clear the index.

This document is the single source of truth for the Mimicry dashboard UI and syncing behavior.
