import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import ProtectedRoute from "./components/auth/ProtectedRoute.jsx";
import Navbar from "./components/layout/Navbar.jsx";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import AnalyzeResume from "./pages/AnalyzeResume.jsx";
import AnalysisResult from "./pages/AnalysisResult.jsx";
import NotFound from "./pages/NotFound.jsx";

function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-400">
        ResumeRizz
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            {/* Analysis is public — no login required. Guests get results and a
                "save" CTA; logged-in users' analyses are auto-saved. */}
            <Route path="/analyze" element={<AnalyzeResume />} />
            {/* /analysis = latest in-memory result; /analysis/:id = a saved one */}
            <Route path="/analysis" element={<AnalysisResult />} />
            <Route path="/analysis/:id" element={<AnalysisResult />} />
            {/* Only user-owned pages require an authenticated session. */}
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<Dashboard />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
