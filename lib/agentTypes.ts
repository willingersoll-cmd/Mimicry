import { z } from 'zod';

export const ActionSchema = z.object({
  type: z.enum(['click', 'type', 'scroll', 'done']),
  description: z.string().describe('A human-readable description of the action'),
  selector: z.string().optional().describe('Standard CSS only for type actions (e.g. #id, .class, input[name=email]). Do NOT use :contains() or :has-text().'),
  clickText: z.string().optional().describe('For click: the exact visible text of the button or link to click (e.g. "Register now"). Use this instead of selector when clicking by text.'),
  text: z.string().optional().describe('Text to type (for type actions)'),
  direction: z.enum(['up', 'down']).optional().describe('Scroll direction (for scroll actions)'),
  reason: z.string().optional().describe('Why this action was chosen'),
});

export type AgentAction = z.infer<typeof ActionSchema>;
