# ResumeRizz

AI-powered resume analysis platform that evaluates resumes against job descriptions and provides actionable, evidence-based recommendations.

---

## Features

- PDF resume upload with type, size, and extractable-text validation
- Job description input with length validation and a character counter
- AI-powered resume / job-description matching
- Match score (0–100) with an honest summary
- Strengths backed by direct evidence from the resume
- Missing skills labeled by importance (high / medium / low)
- Partial matches showing where the resume only partly meets a requirement
- Keyword analysis of matched vs. missing job terminology
- Resume issues with section, priority, and concrete recommendations
- Bullet improvement suggestions that rewrite existing bullets factually
- Prioritized action plan ranked by real impact
- Guest analysis — no account required (one successful analysis per UTC day, tracked in the browser)
- User authentication (register / login with JWT)
- Saved analysis history with open and delete actions
- Responsive UI for phones, tablets, and desktops
- Dark / light theme (dark by default, persisted)

---

## How It Works

1. Upload a PDF resume — the backend extracts and structures its text (contact, skills, experience, education, projects, certifications, achievements).
2. Enter the job description — it is parsed into responsibilities, requirements, skills, and experience.
3. The resume and job description are processed locally into a deterministic evidence table (per-skill evidence, experience vs. requirements, resume numbers).
4. Gemini analyzes the role fit in a single call, focused on scoring and writing rather than re-deriving facts.
5. The response is validated and normalized, then scrubbed against the resume ground truth so fabricated metrics are removed and keyword lists are corrected.
6. Structured recommendations — score, gaps, keywords, issues, bullet rewrites, and an action plan — are displayed.

---

## Tech Stack

Frontend:

- React
- Vite
- Tailwind CSS
- Axios
- React Router

Backend:

- Node.js
- Express.js
- MongoDB / Mongoose
- JWT authentication
- PDF processing
- Google Gemini API

## Architecture

```text
Frontend → REST API → resume/JD processing → Gemini → validation + scrubbing → structured analysis → frontend
```

The client uploads a resume and job description to the Express API. The backend extracts resume text, parses the job description, builds a deterministic evidence table, calls Gemini once, validates and fact-checks the response, and returns structured JSON the UI renders.

## Project Structure

```text
ResumeRizz/
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── services/
│   │   └── utils/
│   ├── public/
│   └── vite.config.js
├── server/
│   ├── controllers/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── middleware/
│   ├── config/
│   ├── utils/
│   └── server.js
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or hosted)
- A Google Gemini API key

### Backend

```bash
cd server
cp .env.example .env
npm install
npm run dev
```

`npm run dev` starts with nodemon; `npm start` starts in production mode.

### Frontend

```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173`. In development the Vite server proxies `/api` requests to the backend. For a production deployment, set `VITE_API_URL` to the public backend URL.

## Environment Variables

### Server (`server/.env`)

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development` or `production` |
| `PORT` | API port (default `5000`) |
| `GEMINI_API_KEY` | Gemini API key (server-side only) |
| `GEMINI_MODEL` | Primary Gemini model (default `gemini-3.6-flash`) |
| `GEMINI_FALLBACK_MODEL` | Optional fallback model, used only when the primary is transiently unavailable (503). Leave empty to disable. |
| `CLIENT_URL` | CORS-allowed frontend origin (default `http://localhost:5173`) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign JWTs |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `REGISTER_LIMIT_COUNT` | Max account creations per IP per window on `POST /api/auth/register` (default `5`) |
| `REGISTER_LIMIT_WINDOW_MS` | Window in ms for the registration throttle (default `900000`) |

The daily analysis limit is enforced in the browser (`localStorage`) — one successful analysis per UTC calendar day, with separate keys for guests and signed-in accounts. It is not a server setting.

### Client (`client/.env`, optional for local development)

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Public backend API base URL. Defaults to `/api` (proxied by Vite in dev). Set this in production to the public backend URL. |

## Scripts

### Client

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run lint` | Lint with oxlint |
### Server

| Command | Description |
| --- | --- |
| `npm run dev` | Start with nodemon |
| `npm start` | Start in production mode |

## Deployment

The frontend and backend are deployed as two separate services:

- Frontend (e.g. Vercel): build with `npm run build` in `client/`. `client/vercel.json` provides SPA fallback so client-side routes work on direct navigation.
- Backend (e.g. Render): run `npm start` in `server/`.
- The frontend communicates with the backend through `VITE_API_URL`, which points to the public backend URL in production.
- The backend allows the deployed frontend origin through `CLIENT_URL` (used by CORS).

Never commit `.env` files or real credentials.

## License

This project is provided for demonstration and learning purposes.

