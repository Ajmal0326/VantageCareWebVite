import React from 'react';
import Sidebar from '../Components/Sidebar';
import Navbar from '../Components/Navbar';

const MainLayout = ({ children }) => {
  return (
    <div className="h-screen flex flex-col">
      <Navbar />

      <div className="flex flex-1">
        <Sidebar />
        <div className="flex-1 p-4 overflow-auto">{children}</div>
      </div>
    </div>
  );
};

export default MainLayout;
