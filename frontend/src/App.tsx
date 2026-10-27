import React, { useState } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { CandidateLobbyPage } from './pages/CandidateLobbyPage';
import { EvaluationReportPage } from './pages/EvaluationReportPage';
import { InterviewCompletedPage } from './pages/InterviewCompletedPage';
import { InterviewRoomPage } from './pages/InterviewRoomPage';
import { RecruiterDashboardPage } from './pages/RecruiterDashboardPage';
import { RecruiterSetupPage } from './pages/RecruiterSetupPage';
import { useInterviewStore } from './store/useInterviewStore';

const formatTime = (sec: number) => {
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
};

const TopNavigationBar: React.FC = () => {
  const location = useLocation();
  const remainingSeconds = useInterviewStore((state) => state.remainingSeconds);
  const [helpOpen, setHelpOpen] = useState(false);

  const isCandidateRoute = location.pathname.startsWith('/interview');
  const isLobbyRoute = location.pathname.endsWith('/lobby');
  const isCompletedRoute = location.pathname.endsWith('/completed');
  const isActiveRoomRoute =
    isCandidateRoute && !isLobbyRoute && !isCompletedRoute;

  const recruiterNavItems = [
    { label: 'Daftar Sesi', path: '/recruiter' },
    { label: 'Buat Sesi Baru', path: '/recruiter/setup' },
  ];

  return (
    <>
      <header className="w-full border-b border-subtle/80 bg-canvas/90 backdrop-blur-md sticky top-0 z-40 transition-colors">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          {/* Minimal Brand Only */}
          {isCandidateRoute ? (
            <div className="flex items-center space-x-3">
              <div className="w-6 h-6 rounded-full bg-charcoal text-canvas flex items-center justify-center font-serif text-xs font-medium tracking-tight">
                A
              </div>
              <span className="text-xs tracking-wider uppercase font-semibold text-charcoal">
                Alya Interview
              </span>
            </div>
          ) : (
            <Link to="/recruiter" className="flex items-center space-x-3">
              <div className="w-6 h-6 rounded-full bg-charcoal text-canvas flex items-center justify-center font-serif text-xs font-medium tracking-tight">
                A
              </div>
              <span className="text-xs tracking-wider uppercase font-semibold text-charcoal">
                Alya Interview
              </span>
            </Link>
          )}

          {/* Center Timer Indicator (Active Interview Room Only) */}
          {isActiveRoomRoute && (
            <div
              id="nav-stage-indicator"
              className="flex items-center space-x-2 bg-surface border border-subtle px-3.5 py-1 rounded-full text-xs"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span
                className="font-mono text-charcoal font-medium"
                id="nav-timer"
              >
                {formatTime(remainingSeconds)}
              </span>
            </div>
          )}

          {/* Right Navigation / Help Action */}
          {isCandidateRoute ? (
            <div className="flex items-center space-x-3 text-xs">
              <button
                type="button"
                id="header-help-btn"
                onClick={() => setHelpOpen(true)}
                className="text-muted hover:text-charcoal transition-colors px-2.5 py-1 rounded-md text-xs font-medium"
              >
                Panduan
              </button>
            </div>
          ) : (
            <nav className="flex items-center space-x-2">
              {recruiterNavItems.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                      active
                        ? 'bg-charcoal text-canvas'
                        : 'text-muted hover:text-charcoal hover:bg-surface'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      </header>

      {/* Minimal Help Modal for Candidate */}
      {helpOpen && (
        <div className="fixed inset-0 bg-charcoal/20 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-canvas border border-subtle rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-serif text-charcoal">
              Panduan Sesi Wawancara
            </h3>
            <ul className="text-xs text-muted space-y-2.5 leading-relaxed">
              <li className="flex items-start space-x-2">
                <span className="text-charcoal mt-0.5">•</span>
                <span>
                  Pastikan mikrofon aktif dan bicaralah secara alami seperti
                  percakapan tatap muka.
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-charcoal mt-0.5">•</span>
                <span>
                  Gunakan tombol <strong>Sela AI</strong> kapan saja jika Anda
                  ingin memotong atau menambahkan jawaban saat pewawancara sedang
                  berbicara.
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-charcoal mt-0.5">•</span>
                <span>
                  Anda dapat menggeser garis pembatas di tengah layar untuk
                  menyesuaikan lebar panel avatar dan transkrip.
                </span>
              </li>
            </ul>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="bg-charcoal text-canvas px-4 py-2 rounded-xl text-xs font-medium hover:bg-charcoal/90 transition-colors"
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-canvas text-charcoal font-sans antialiased selection:bg-subtle selection:text-charcoal flex flex-col justify-between">
        <TopNavigationBar />
        <main className="flex-1 flex flex-col justify-center relative overflow-hidden">
          <Routes>
            <Route path="/" element={<Navigate to="/recruiter" replace />} />
            <Route path="/recruiter" element={<RecruiterDashboardPage />} />
            <Route path="/recruiter/setup" element={<RecruiterSetupPage />} />
            <Route
              path="/recruiter/sessions/:sessionId/report"
              element={<EvaluationReportPage />}
            />
            <Route
              path="/interview/:sessionId/lobby"
              element={<CandidateLobbyPage />}
            />
            <Route
              path="/interview/:sessionId/room"
              element={<InterviewRoomPage />}
            />
            <Route
              path="/interview/:sessionId"
              element={<InterviewRoomPage />}
            />
            <Route
              path="/interview/:sessionId/completed"
              element={<InterviewCompletedPage />}
            />
            <Route path="*" element={<Navigate to="/recruiter" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
};

export default App;
