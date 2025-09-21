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
import { useAuth } from './context/AuthContext';
import ApproveTimeSheet from './pages/ApproveTimeSheet';
import CreateShift from './pages/CreateShift';
import CurrentEmployees from './pages/CurrentEmployees';
import CreateEmployee from './pages/CreateEmployee';

function App() {

  const { user } = useAuth();
  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
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
            path="/Approve-TimeSheet"
            element={
              <PrivateRoute>
                <MainLayout>
                  <ApproveTimeSheet />
                </MainLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/create-shift"
            element={
              <PrivateRoute>
                <MainLayout>
                  <CreateShift />
                </MainLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/employees"
            element={
              <PrivateRoute>
                <MainLayout>
                  <CurrentEmployees />
                </MainLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/new-employees"
            element={
              <PrivateRoute>
                <MainLayout>
                  <CreateEmployee />
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
