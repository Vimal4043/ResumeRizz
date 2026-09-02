# AI Job Hunt

AI Job Hunt analyzes a PDF resume against a job description and returns a structured,
evidence-based job-match report. It extracts and structures the resume on the server,
parses the job description, runs the comparison through the Gemini API, validates the
result, and presents actionable feedback in a clean React UI.

## Current functionality

Users can:

- upload a PDF resume
- paste a job description
- receive a structured job-match analysis that includes:
  - an overall match score and summary
  - strengths directly supported by the resume
  - missing skills (with importance and reason)
  - partial matches (with evidence and the gap)
  - keyword analysis (matched vs. missing terminology)
  - resume issues and recommendations
  - factual bullet-point rewriting suggestions
  - a prioritized action plan

The analysis spans resume upload → PDF text extraction → resume structuring → job
description parsing → Gemini analysis → validation/normalization → a React results view.

## Tech stack

- **Frontend:** React, Vite, React Router, Tailwind CSS, Axios
- **Backend:** Node.js, Express, Multer, Helmet, Morgan, express-rate-limit
- **AI:** Google Gemini (`@google/genai`), server-side only
- **PDF processing:** `pdf-parse-new`

## Project structure

```
ai-job-hunt/
├── client/                 # React SPA (Vite)
│   └── src/
│       ├── components/     # common/, layout/, resume/
│       ├── pages/          # route-level views
│       ├── hooks/          # useResumeAnalysis
│       ├── services/       # api, analysisService
│       └── utils/          # formatters, constants
├── server/                 # Express API
│   ├── config/             # env
│   ├── controllers/        # request handlers
│   ├── middleware/         # upload, error handling
│   ├── routes/             # API routes → controllers
│   ├── services/
│   │   ├── ai/             # Gemini + analysis (server-only)
│   │   ├── resume/         # PDF parsing + extraction
│   │   └── job/            # job-description parsing
│   └── utils/              # logger, errors, response helpers
├── uploads/                # temporary uploaded files (git-ignored)
├── .gitignore
└── README.md
```

The backend follows **Routes → Controllers → Services → Models**. Business logic is never
placed inside route definitions, and the frontend never holds Gemini API keys or database
credentials.

## Local setup

### 1. Install dependencies

Backend:

```bash
cd server
npm install
```

Frontend:

```bash
cd client
npm install
```

### 2. Create environment variables

Backend — copy `server/.env.example` to `server/.env` and fill in the values:

```bash
cd server
cp .env.example .env
```

Frontend — copy `client/.env.example` to `client/.env` (optional for local development,
where the Vite dev proxy forwards `/api` to the backend):

```bash
cd client
cp .env.example .env
```

### 3. Start the backend

```bash
cd server
npm run dev        # nodemon, reloads on changes
# or
npm start          # production start
```

The API runs at `http://localhost:5000` and listens on `0.0.0.0`.

### 4. Start the frontend

```bash
cd client
npm run dev
```

Open `http://localhost:5173`. In development the Vite server proxies `/api` requests to
the backend; in production the frontend calls the backend directly through `VITE_API_URL`.

## Environment variables

Documented as *names only* — never put real secrets in this file.

**Server (`server/.env`):**

| Variable         | Purpose                                        |
| ---------------- | ---------------------------------------------- |
| `PORT`           | API port (default `5000`)                      |
| `NODE_ENV`       | `development` or `production`                  |
| `MONGODB_URI`    | *(removed — no database in this build)*        |
| `GEMINI_API_KEY` | Gemini API key (server-side only)              |
| `GEMINI_MODEL`   | Gemini model name                              |
| `CLIENT_URL`     | CORS-allowed frontend origin                   |
| `JWT_SECRET`     | *(removed — no auth in this build)*            |

**Client (`client/.env`):**

| Variable      | Purpose                                    |
| ------------- | ------------------------------------------ |
| `VITE_API_URL`| Public backend API base URL                 |

## Deployment

The frontend and backend are deployed as two separate services:

- **Frontend** (Vercel): build with `npm run build` in `client/`. `client/vercel.json`
  provides SPA fallback so client-side routes such as `/analyze` and `/analysis` work on
  direct navigation.
- **Backend** (e.g. Render): run `npm start` in `server/` (uses the `start` script and
  listens on `0.0.0.0`).
- The frontend communicates with the backend through `VITE_API_URL`, which points to the
  public backend URL in production.
- The backend allows the deployed frontend origin through `CLIENT_URL` (used by CORS).

Never commit `.env` files or real credentials.
