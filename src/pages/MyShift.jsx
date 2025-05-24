import React from "react";

export default function MyShift() {
  return (
    <div className="min-h-screen bg-white p-4 md:p-8 font-sans">
      <h1 className="text-xl font-semibold mb-4">My Shift</h1>

      <div className="bg-blue-600 text-white py-2 px-4 rounded text-center mb-4">
        <span className="text-lg font-medium">12 May 2025- 18 May 2025</span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-blue-600 text-white text-left rounded">
          <thead>
            <tr>
              <th className="py-2 px-4 border-b border-blue-500">Date</th>
              <th className="py-2 px-4 border-b border-blue-500">Shift time</th>
              <th className="py-2 px-4 border-b border-blue-500">Role</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-2 px-4 border-t border-blue-500">12 May</td>
              <td className="py-2 px-4 border-t border-blue-500">7:00 am</td>
              <td className="py-2 px-4 border-t border-blue-500">Care Staff</td>
            </tr>
            <tr>
              <td className="py-2 px-4 border-t border-blue-500">14 May</td>
              <td className="py-2 px-4 border-t border-blue-500">9:30am</td>
              <td className="py-2 px-4 border-t border-blue-500">Care Staff</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
