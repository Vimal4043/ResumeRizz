# ResumeRizz

ResumeRizz is an AI-powered resume analysis tool that compares a PDF resume against a job description and returns an evidence-based job match report — a match score, strengths, skill gaps, keyword analysis, resume issues, bullet-point suggestions, and a prioritized action plan. Analysis is available to guests (with a daily limit) and is saved to an account when the user is signed in.

---

## Features

- **PDF resume upload** with client- and server-side validation (type, size, extractable text)
- **Job description input** with length validation and a live character counter
- **AI-powered job match analysis** built on the Google Gemini API
- **Match score** (0–100) with an honest summary
- **Strengths** backed by direct evidence from the resume
- **Missing skills** labeled by importance (high / medium / low) — presented as gaps, never as suggestions to falsely add them
- **Partial matches** showing where the resume only partly meets a requirement
- **Keyword analysis** of matched vs. missing job terminology
- **Resume issues** with section, priority, and concrete recommendations
- **Bullet-point suggestions** that rewrite existing bullets factually (unsupported metrics are stripped)
- **Prioritized action plan** ranked by real impact for the match
- **Guest analysis** — no account required; limited to 5 successful analyses per day per IP, with a 10-minute cooldown between analyses
- **Authentication** — register / log in with JWT; authenticated users get 20 analyses per day and their results are saved
- **Analysis history** — paginated list of saved analyses with open and delete actions
- **Responsive mobile experience** — mobile-first layouts, a compact right-side navigation drawer, and touch-friendly controls across phones, tablets, and desktops
- **Dark / light theme** — dark by default, persisted to localStorage, with a no-flash inline script and a subtle theme-switch transition that respects `prefers-reduced-motion`

---

## How It Works

```
PDF resume
  → text extraction (pdf-parse-new)
  → resume structuring (rule-based: contact, skills, experience, education, projects, certifications, achievements)
  → job-description parsing (rule-based: responsibilities, requirements, preferred, skills, experience, education)
  → deterministic evidence analysis (per-skill evidence levels, JD experience requirement vs. resume time spans, resume numbers)
  → prompt assembly (structured resume + parsed JD + evidence table)
  → ONE Gemini call (with retries on transient failures, optional fallback model, and a total time budget)
  → response validation + normalization into the canonical analysis shape
  → output scrubbing against the resume ground truth (fabricated metrics removed, keyword lists corrected)
  → results shown to the user
```

Two design decisions shape the result:

1. **Evidence first.** Everything that can be computed locally (skill evidence, experience months, resume numbers) is computed locally and passed to the model as a deterministic evidence table. Gemini is called exactly once and focused on judgment — scoring and writing — rather than re-deriving facts.
2. **Never trust model output.** The validator enforces the canonical shape and enum values; the scrubber then fact-checks the result against the resume itself, removing fabricated numbers and correcting keyword lists. The system never invents skills, experience, metrics, or achievements.


---

## Product Principles

- The analysis is **evidence-based**: every strength is tied to the resume, and the model is instructed to be conservative.
- The system **does not invent** skills, experience, metrics, or achievements. Unsupported metrics in AI-generated suggestions are removed automatically.
- Missing skills are presented as **gaps to close or build**, never as things to write on the resume without evidence.
- The match score is an **estimate of fit for a specific job description**, not a guarantee of interviews or hiring.
- The loading experience shows **UX-oriented progress messages**, not a claim about the AI’s internal state, and never a fake percentage.


---

## Tech Stack

| Layer | Technologies
| --- | --- |
| **Frontend** | React 19, Vite, React Router 7, Tailwind CSS 4, Axios |
| **Backend** | Node.js, Express 5, Multer, Helmet, Morgan, CORS, express-rate-limit |
| **Database** | MongoDB (Mongoose) |
| **AI** | Google Gemini via @google/genai (server-side only) |
| **Auth** | JWT (jsonwebtoken), bcryptjs password hashing |
| **File processing** | pdf-parse-new |
| **Styling** | Tailwind CSS with centralized CSS-variable theme tokens (dark default + light) |
| **Testing** | Vitest + Testing Library (client); custom Node test runners (server) |
| **Linting** | oxlint |


---

## Project Structure

```
ResumeRizz/
├── client/                       # React SPA (Vite)
│   ├── public/                   # favicon, logo
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/             # ProtectedRoute
│   │   │   ├── common/           # Button, EmptyState, Input, Spinner
│   │   │   ├── layout/           # Navbar, PageContainer
│   │   │   └── resume/           # MatchScore, ShouldIApply, TopPriorities,
│   │   │                         #   StrengthsCard, MissingSkillsCard, PartialMatches,
│   │   │                         #   KeywordAnalysis, ResumeIssues, BulletSuggestions,
│   │   │                         #   ActionPlan, AnalysisProgress, ResumeUploader,
│   │   │                         #   JobDescriptionInput
│   │   ├── context/              # AuthContext, ThemeContext
│   │   ├── hooks/                # useResumeAnalysis
│   │   ├── pages/                # Landing, AnalyzeResume, AnalysisResult,
│   │   │                         #   Dashboard, Login, Register, NotFound
│   │   ├── services/             # api (axios instance), analysisService, authService
│   │   └── utils/                # constants, formatters, analysisStages
│   ├── index.html
│   ├── vite.config.js            # /api proxy to localhost:5000 in dev
│   ├── vercel.json               # SPA fallback for client-side routes
│   └── package.json

├── server/                       # Express API
│   ├── config/                   # env, db (Mongoose connect)
│   ├── controllers/              # analysisController, authController, healthController
│   ├── middleware/               # uploadMiddleware (multer), analysisQuotaMiddleware,
│   │                             #   authMiddleware (requireAuth, attachOptionalUser),
│   │                             #   errorMiddleware (notFound + centralized handler)
│   ├── models/                   # User, Resume, Analysis
│   ├── routes/                   # analysisRoutes, authRoutes, healthRoutes
│   ├── services/
│   │   ├── ai/                   # gemini (reliability layer), analysisService,
│   │   │                         #   analysisValidator, evidenceAnalyzer,
│   │   │                         #   outputScrubber, prompts
│   │   ├── resume/               # pdfParser, resumeExtractor
│   │   └── job/                  # jobDescriptionParser
│   ├── tests/                    # runQuotaTests, runErrorContractTests, runLimitsTests,
│   │                             #   runReliabilityTests, runPublicAnalysisTests,
│   │                             #   runPersistenceFlow
│   ├── utils/                    # errors, jwt, logger, response
│   ├── app.js                    # Express app wiring
│   ├── server.js                 # startup + graceful shutdown
│   └── package.json
├── uploads/                      # temporary uploaded files (git-ignored)
├── .gitignore
└── README.md
```

The backend follows **Routes → Controllers → Services → Models**. Business logic never lives in route definitions, and the frontend never holds Gemini API keys or database credentials.


---

## Local Setup

### 1. Clone

```bash
git clone https://github.com/Vimal4043/ResumeRizz.git
cd ResumeRizz
```

### 2. Install dependencies

```bash
# Backend
cd server
npm install

# Frontend
cd ../client
npm install
```

### 3. Configure environment variables

Create `server/.env` from the example file:

```bash
cd server
cp .env.example .env
```

Then fill in the values (see [Environment variables](#environment-variables) below).

The frontend uses a relative `/api` path by default, which the Vite dev proxy forwards to the backend. Override it with `VITE_API_URL` only if the backend lives elsewhere.

### 4. Start the backend

```bash
cd server
npm run dev        # nodemon, reloads on changes
# or
npm start          # production start
```

The API runs at `http://localhost:5000` and listens on `0.0.0.0`.

### 5. Start the frontend

```bash
cd client
npm run dev
```

Open `http://localhost:5173`. In development the Vite server proxies `/api` requests to the backend; in production the frontend calls the backend directly through `VITE_API_URL`.


---

## Environment variables

Documented as **names only** — never put real secrets in this file.

### Server (`server/.env`)

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development` or `production` |
| `PORT` | API port (default `5000`) |
| `GEMINI_API_KEY` | Gemini API key (server-side only) |
| `GEMINI_MODEL` | Primary Gemini model (default `gemini-3.6-flash`) |
| `GEMINI_FALLBACK_MODEL` | Optional fallback model used only when the primary is transiently unavailable (503). Leave empty to disable. |
| `AI_MAX_RETRIES` | Extra attempts for the primary model on transient errors (default `2`) |
| `AI_RETRY_BASE_DELAY_MS` | Base delay in ms for exponential backoff between retries (default `1000`) |
| `AI_REQUEST_TIMEOUT_MS` | Hard timeout in ms for a single Gemini HTTP attempt (default `120000`) |
| `CLIENT_URL` | CORS-allowed frontend origin (default `http://localhost:5173`) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign JWTs |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `ANALYSIS_COOLDOWN_MINUTES` | Minimum minutes between two successful analyses (default `10`) |

> **Note:** The job-description limit (`20000` chars), upload cap (`5` MB), log
> level (`info`), and guest/auth daily limits (`1`/`2`) are hardcoded in
> `server/config/env.js` / `server/utils/logger.js` — setting them in `.env`
> has no effect.

### Client (`client/.env`, optional for local development)

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Public backend API base URL. Defaults to `/api` (proxied by Vite in dev). Set this in production to the public backend URL. |


---

## Scripts

### Client

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run lint` | Lint with oxlint |
| `npm test` | Run unit tests with Vitest |

### Server

| Command | Description |
| --- | --- |
| `npm run dev` | Start with nodemon |
| `npm start` | Start in production mode |
| `npm run test:quota` | Guest quota & cooldown tests |
| `npm run test:errors` | Error-contract tests |
| `npm run test:limits` | Input-limit tests |
| `npm run test:reliability` | AI reliability tests |
| `npm run test:public` | Public analysis flow tests |
| `npm run test:persistence` | Persistence flow tests (requires MongoDB) |
| `npm test` | Run all of the above |

---

## Deployment

The frontend and backend are deployed as two separate services:

- **Frontend** (Vercel): build with `npm run build` in `client/`. `client/vercel.json` provides SPA fallback so client-side routes such as `/analyze` and `/analysis` work on direct navigation.
- **Backend** (e.g. Render): run `npm start` in `server/` (uses the `start` script and listens on `0.0.0.0`).
- The frontend communicates with the backend through `VITE_API_URL`, which points to the public backend URL in production.
- The backend allows the deployed frontend origin through `CLIENT_URL` (used by CORS).

Never commit `.env` files or real credentials.

---

## License

This project is provided for demonstration and learning purposes.

