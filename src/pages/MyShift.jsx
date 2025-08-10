import React, { use, useEffect, useState } from "react";
import { db } from "../firebase"; // your firebase config file
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";

export default function MyShift({ userId }) {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
 const { user } = useAuth();
  
 useEffect(() => {
  const fetchShifts = async () => {
    try {
      const docRef = doc(db, "UsersDetail", user?.userID);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        let fetchedShifts = data.shifts || [];

        // Sort shifts by date (smallest to largest)
        fetchedShifts.sort((a, b) => {
          return new Date(a.shiftDate) - new Date(b.shiftDate);
        });

        setShifts(fetchedShifts);
      } else {
        console.log("No such document found!");
      }
    } catch (error) {
      console.error("Error fetching shifts:", error);
    } finally {
      setLoading(false);
    }
  };

    if (user?.userID) fetchShifts();
  }, [user?.userID]);



  return (
    <div className="min-h-screen bg-white p-4 md:p-8 font-sans">
      <h1 className="text-xl font-semibold mb-4">My Shift</h1>

      <div className="bg-blue-600 text-white py-2 px-4 rounded text-center mb-4">
  <span className="text-lg font-medium">
    {shifts.length > 0
      ? `${new Date(shifts[0].shiftDate).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })} - ${new Date(shifts[shifts.length - 1].shiftDate).toLocaleDateString(
          "en-GB",
          {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }
        )}`
      : "No shifts available"}
  </span>
</div>


      <div className="overflow-x-auto">
        {loading ? (
          <p className="text-center">Loading shifts...</p>
        ) : shifts.length > 0 ? (
          <table className="min-w-full bg-blue-600 text-white text-left rounded">
            <thead>
              <tr>
                <th className="py-2 px-4 border-b border-blue-500">Date</th>
                <th className="py-2 px-4 border-b border-blue-500">Shift time</th>
                <th className="py-2 px-4 border-b border-blue-500">Role</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((shift, index) => (
                <tr key={index}>
                  <td className="py-2 px-4 border-t border-blue-500">
                    {shift.shiftDate}
                  </td>
                  <td className="py-2 px-4 border-t border-blue-500">
                    {shift.shiftStartTime}
                  </td>
                  <td className="py-2 px-4 border-t border-blue-500">
                    {shift.shiftRole}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-center">No shifts found.</p>
        )}
      </div>
    </div>
  );
}
