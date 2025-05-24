import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const Navbar = () => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="bg-blue-900 text-white p-4 flex justify-between items-center">
      <h1 className="text-lg font-bold">Vantage Care</h1>
      <div className="flex items-center gap-4">
        <span>{user?.name} ({user?.role})</span>
        <button
          onClick={handleLogout}
          className="bg-white text-blue-900 px-4 py-1 rounded hover:bg-gray-200"
        >
          Logout
        </button>
      </div>
    </div>
  );
};

export default Navbar;
