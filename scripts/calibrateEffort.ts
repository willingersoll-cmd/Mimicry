/**
 * Deterministic calibration harness for the GOMS effort model.
 *
 * Exercises representative agent scenarios (simple click, ambiguous target,
 * form entry, navigation/page switch, slow page, scroll) and prints the
 * resulting effort breakdown so the constants in lib/gomsEffortModel.ts can be
 * sanity-checked against intuition. This does not hit the network or browser.
 *
 * Run: tsc-compile then `node .calib/scripts/calibrateEffort.js`
 */
import {
  computeActionEffort,
  scaleEffortToTokens,
  type EffortInput,
} from '../lib/gomsEffortModel';

type Scenario = { name: string; input: EffortInput };

const base: Omit<EffortInput, 'actionType'> = {
  isFirstAction: false,
  rationale: 'Selected this control to advance the task.',
  targetText: '',
  typedText: '',
  completionTokens: 28,
  promptTokens: 1400,
  candidateCount: 1,
  dom: { buttons: 6, links: 18, inputs: 3, clickable: 24 },
  urlChanged: false,
  retryCount: 0,
  targetAcquisitionMs: 180,
  modelWaitMs: 1200,
  siteWaitMs: 350,
};

const scenarios: Scenario[] = [
  {
    name: 'First look + simple click (landing page)',
    input: {
      ...base,
      actionType: 'click',
      isFirstAction: true,
      targetText: 'Get started',
      dom: { buttons: 2, links: 5, inputs: 0, clickable: 7 },
    },
  },
  {
    name: 'Simple click, low clutter',
    input: { ...base, actionType: 'click', targetText: 'Sign in' },
  },
  {
    name: 'Ambiguous click (3 matching links, cluttered page)',
    input: {
      ...base,
      actionType: 'click',
      targetText: 'Learn more',
      candidateCount: 3,
      dom: { buttons: 12, links: 60, inputs: 2, clickable: 72 },
      targetAcquisitionMs: 900,
      retryCount: 2,
    },
  },
  {
    name: 'Form entry (typing a sentence)',
    input: {
      ...base,
      actionType: 'type',
      targetText: 'input[name="email"]',
      typedText: 'qa.tester@example.com',
    },
  },
  {
    name: 'Navigation to a new page (homing spike)',
    input: { ...base, actionType: 'click', targetText: 'Checkout', urlChanged: true },
  },
  {
    name: 'Slow page / API (waiting spike)',
    input: {
      ...base,
      actionType: 'click',
      targetText: 'Submit order',
      urlChanged: true,
      modelWaitMs: 2600,
      siteWaitMs: 6500,
    },
  },
  {
    name: 'Scroll down',
    input: { ...base, actionType: 'scroll' },
  },
  {
    name: 'Done',
    input: { ...base, actionType: 'done', rationale: 'All required fields submitted; task complete.' },
  },
];

const pad = (s: string | number, n: number) => String(s).padStart(n);

console.log('\nGOMS token allocation — calibration\n');
console.log(
  'Buckets are the real per-step tokens (prompt + completion) distributed by effort weight.\n'
);
console.log(
  `${'Scenario'.padEnd(46)} ${pad('Think', 6)}${pad('Point', 6)}${pad('Type', 6)}${pad('Home', 6)}${pad('Wait', 6)}${pad('SUM', 7)}${pad('USED', 7)}`
);
console.log('-'.repeat(103));

let allMatch = true;
for (const s of scenarios) {
  const { effort } = computeActionEffort(s.input);
  const used = s.input.promptTokens + s.input.completionTokens;
  const tokens = scaleEffortToTokens(effort, used);
  const sum =
    tokens.thinking + tokens.pointing + tokens.typing + tokens.homing + tokens.waiting;
  if (sum !== used) allMatch = false;
  console.log(
    `${s.name.padEnd(46)} ${pad(tokens.thinking, 6)}${pad(tokens.pointing, 6)}${pad(
      tokens.typing,
      6
    )}${pad(tokens.homing, 6)}${pad(tokens.waiting, 6)}${pad(sum, 7)}${pad(used, 7)}`
  );
}

console.log(
  `\n1:1 check — every bucket sum equals tokens used: ${allMatch ? 'PASS' : 'FAIL'}`
);
console.log('\nProportional expectations (relative shares within a step):');
console.log('  - ambiguous duplicate links: higher pointing share');
console.log('  - form entry: typing share appears');
console.log('  - new page/flow change: homing share rises');
console.log('  - slow page/API: waiting share rises\n');
