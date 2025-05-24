import React from 'react';
import { FaCalendarAlt, FaCommentDots } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';

const Dashboard = () => {
    const { user } = useAuth();
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold mb-2">Welcome {user?.name}</h1>
      <p className="text-lg font-medium mb-8">Role: {user?.role}</p>

      <div className="flex gap-8">
        {/* Next Shift Card */}
        <div className="bg-blue-600 text-white w-60 h-40 flex flex-col items-center justify-center rounded-lg shadow-md">
          <FaCalendarAlt size={36} className="mb-2" />
          <p className="text-md font-medium">Next Shift</p>
          <p className="text-sm mt-2">No upcoming Shift</p>
        </div>

        {/* Recent Message Card */}
        <div className="bg-blue-600 text-white w-60 h-40 flex flex-col items-center justify-center rounded-lg shadow-md">
          <FaCommentDots size={36} className="mb-2" />
          <p className="text-md font-medium">Recent message</p>
          <p className="text-sm mt-2">Message received: 0</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
