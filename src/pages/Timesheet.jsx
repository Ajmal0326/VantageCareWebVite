import React from "react";

export default function Timesheet() {
  return (
    <div className="min-h-screen bg-white p-4 md:p-8 font-sans">
      <h1 className="text-xl font-semibold mb-4">Timesheet</h1>

      <div className="flex items-center justify-between bg-blue-600 text-white py-2 px-4 rounded mb-4">
        <button className="text-xl">←</button>
        <span className="text-lg font-medium">12 May 2025- 18 May 2025</span>
        <button className="text-xl">→</button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-blue-600 text-white text-left rounded">
          <thead>
            <tr>
              <th className="py-2 px-4 border-b border-blue-500">Date</th>
              <th className="py-2 px-4 border-b border-blue-500">Shift time</th>
              <th className="py-2 px-4 border-b border-blue-500">Hours work</th>
              <th className="py-2 px-4 border-b border-blue-500">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-2 px-4 border-t border-blue-500">12 May</td>
              <td className="py-2 px-4 border-t border-blue-500">7:00 am</td>
              <td className="py-2 px-4 border-t border-blue-500">8hr</td>
              <td className="py-2 px-4 border-t border-blue-500">Approved</td>
            </tr>
            <tr>
              <td className="py-2 px-4 border-t border-blue-500">14 May</td>
              <td className="py-2 px-4 border-t border-blue-500">9:30am</td>
              <td className="py-2 px-4 border-t border-blue-500">8hr</td>
              <td className="py-2 px-4 border-t border-blue-500">Pending</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
        <p className="text-black text-base">Total working hours: 14 hr</p>
        <button className="bg-blue-600 text-white text-sm px-4 py-2 rounded">Submit Timesheet</button>
      </div>
    </div>
  );
}