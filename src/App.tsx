import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import HomePage from '@/pages/HomePage';
import GamePage from '@/pages/GamePage';
import AdminPage from '@/pages/AdminPage';
import DisplayPage from '@/pages/DisplayPage';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background text-foreground">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/game/:sessionId" element={<GamePage />} />
          <Route path="/admin/:sessionId" element={<AdminPage />} />
          <Route path="/display/:sessionId" element={<DisplayPage />} />
        </Routes>
        <Toaster />
      </div>
    </Router>
  );
}

export default App;