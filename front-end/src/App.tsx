import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store/useStore';
import { Moon, Sun } from 'lucide-react';
import { LoginForm } from './components/auth/LoginForm';
import { Dashboard } from './pages/Dashboard';
import { EditorLayout } from './components/editor/EditorLayout';

export function App() {
  const { theme, actions, currentUser } = useStore();

  return (
    <Router>
      <div className={`min-h-screen ${theme === 'dark' ? 'dark' : ''}`}>
        <div className="fixed top-4 right-4 z-50">
          <button
            onClick={actions.toggleTheme}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </button>
        </div>
        <Routes>
          <Route
            path="/login"
            element={currentUser ? <Navigate to="/" replace /> : <LoginForm />}
          />
          <Route
            path="/editor/:id"
            element={currentUser ? <EditorLayout /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/"
            element={currentUser ? <Dashboard /> : <Navigate to="/login" replace />}
          />
        </Routes>
      </div>
    </Router>
  );
}