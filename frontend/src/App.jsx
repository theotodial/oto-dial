import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Signup from './pages/Signup';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Dialer from './pages/Dialer';
import Chat from './pages/Chat';

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <div className="min-h-screen">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <div className="pt-16">
                  <Dashboard />
                </div>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/dialer" 
            element={
              <ProtectedRoute>
                <div className="pt-16">
                  <Dialer />
                </div>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/chat" 
            element={
              <ProtectedRoute>
                <div className="pt-16">
                  <Chat />
                </div>
              </ProtectedRoute>
            } 
          />
        </Routes>
      </div>
      <Analytics />
    </BrowserRouter>
  );
}

export default App;
