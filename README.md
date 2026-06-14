# VibeCheck Proxy

An AI-powered usability testing proxy that uses vision models to navigate and test websites automatically.

## Features

- **Clean Input UI**: Simple interface with URL input and task description
- **Headless Browser**: Playwright integration for browser automation
- **AI Agent Loop**: Uses GPT-4o or Claude 3.5 Sonnet vision models to analyze screenshots and determine actions
- **Live Progress Tracking**: Real-time display of agent actions and progress

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Install Playwright browser**
   ```bash
   npx playwright install chromium
   ```

3. **Add your API key**  
   Open `.env.local` and paste your key after the `=`:
   ```env
   OPENAI_API_KEY=sk-your-key-here
   ```
   Or use Anthropic: set `ANTHROPIC_API_KEY=` and comment out `OPENAI_API_KEY`.

4. **Run the app**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

### Prerequisites

- Node.js 18+
- npm or yarn

## Usage

1. Enter a website URL (e.g., `https://example.com`)
2. Describe a task (e.g., "Try to sign up for a newsletter")
3. Click "Start Testing"
4. Watch the agent navigate the website in real-time

The agent will:
- Capture screenshots of the page
- Analyze them with a vision model
- Perform actions (click, type, scroll)
- Display progress on the right side

## Architecture

- **Frontend**: Next.js 14 with React Server Components
- **Browser Automation**: Playwright
- **AI**: Vercel AI SDK with OpenAI GPT-4o or Anthropic Claude 3.5 Sonnet
- **State Management**: React hooks with Server-Sent Events (SSE) for live updates

## API Routes

- `POST /api/agent/start`: Starts the agent loop and streams progress via SSE

## License

MIT
