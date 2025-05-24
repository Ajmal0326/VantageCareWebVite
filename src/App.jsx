import { useState } from 'react'
import './App.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Navbar from './Components/Navbar';
import MainLayout from './Layouts/MainLayout';
import MyShift from './pages/MyShift';
import PrivateRoute from './routes/PrivateRoute';
import Timesheet from './pages/Timesheet';
import Dashboard from './pages/Dashboard ';
import Certificate from './pages/Certificate';

function App() {

  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
           <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <MainLayout>
                  <Dashboard />
                </MainLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/my-shift"
            element={
              <PrivateRoute>
                <MainLayout>
                  <MyShift />
                </MainLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/timesheet"
            element={
              <PrivateRoute>
                <MainLayout>
                  <Timesheet />
                </MainLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/Certificate"
            element={
              <PrivateRoute>
                <MainLayout>
                  <Certificate />
                </MainLayout>
              </PrivateRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </>
  )
}

export default App
