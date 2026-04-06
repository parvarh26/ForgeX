import React from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import Landing from './pages/Landing';
import GithubLogin from './pages/GithubLogin';
import RepoSelect from './pages/RepoSelect';
import Dashboard from './pages/Dashboard';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<GithubLogin />} />
      <Route path="/select-repo" element={<RepoSelect />} />
      <Route path="/dashboard" element={<Dashboard />} />
    </Routes>
  );
}
