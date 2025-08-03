import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const Sidebar = () => {
  const location = useLocation();
  const { user } = useAuth();
  const isActive = (path) => location.pathname === path;

  return (
    <div className="bg-blue-700 text-white w-60 p-4 flex flex-col">
      <div className="h-20 w-20 bg-gray-300 rounded-full mb-6 self-center"></div>
      <p className="text-center mb-6">My Profile</p>
      <nav className="flex flex-col space-y-3">
        <Link
          to="/dashboard"
          className={`p-2 rounded ${
            isActive("/dashboard")
              ? "bg-blue-900 font-semibold"
              : "hover:underline"
          }`}
        >
          Dashboard
        </Link>
        {user?.role === "Staff" && (
          <>
            <Link
              to="/my-shift"
              className={`p-2 rounded ${
                isActive("/my-shift")
                  ? "bg-blue-900 font-semibold"
                  : "hover:underline"
              }`}
            >
              My Shift
            </Link>
            <Link
              to="/timesheet"
              className={`p-2 rounded ${
                isActive("/timesheet")
                  ? "bg-blue-900 font-semibold"
                  : "hover:underline"
              }`}
            >
              Timesheet
            </Link>
            <Link
              to="/Certificate"
              className={`p-2 rounded ${
                isActive("/Certificate")
                  ? "bg-blue-900 font-semibold"
                  : "hover:underline"
              }`}
            >
              Certificates
            </Link>
          </>
        )}
      </nav>
    </div>
  );
};

export default Sidebar;
