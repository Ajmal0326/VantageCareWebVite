import React, { useEffect, useState } from "react";
import { FaCalendarAlt, FaCommentDots } from "react-icons/fa";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  getDoc,
} from "firebase/firestore";
import { arrayUnion } from "firebase/firestore"; // ✅ Add this import at the top

const Dashboard = () => {
  const { user } = useAuth();
  const [staffList, setStaffList] = useState([]);
  const [shiftRole, setShiftRole] = useState("");
  const [shiftDate, setShiftDate] = useState("");
  const [shiftStartTime, setShiftStartTime] = useState(""); // ✅ New state for start time
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [nextShift, setNextShift] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch all staff from Firestore
  useEffect(() => {
    const fetchStaff = async () => {
      if (user?.role === "Admin" || user?.role === "HR") {
        setLoadingStaff(true);
        try {
          const querySnapshot = await getDocs(collection(db, "UsersDetail"));
          const staff = querySnapshot.docs
            .map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }))
            .filter((user) => user.role === "Staff");

          setStaffList(staff);
        } catch (error) {
          console.error("Error fetching staff:", error);
        } finally {
          setLoadingStaff(false);
        }
      }
    };

    const getNextShift = (shifts) => {
      const now = new Date();

      const futureShifts = shifts
        .map((shift) => {
          const shiftDateTime = new Date(
            `${shift.shiftDate}T${shift.shiftStartTime}`
          );
          return { ...shift, shiftDateTime };
        })
        .filter((shift) => shift.shiftDateTime > now);

      futureShifts.sort((a, b) => a.shiftDateTime - b.shiftDateTime);

      return futureShifts[0] || null;
    };

    const fetchUserShifts = async () => {
      try {
        // Find the document by matching the logged-in user's email
        const querySnapshot = await getDocs(collection(db, "UsersDetail"));
        let userData = null;
        console.log("email on context is :>>>>>>>>>>>",user);
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.email === user.email) {
            userData = data;
          }
        });
        console.log("user data is :", userData);
        if (userData && Array.isArray(userData.shifts)) {
          console.log("okay calculating next shift  ........");
          const upcoming = getNextShift(userData.shifts);
          setNextShift(upcoming);
          console.log("upcoming shif is :", upcoming);
        }
      } catch (err) {
        console.error("Error fetching user shift:", err);
      }
    };
    if (user?.role === "Staff") {
      console.log("user is staff>>>>>>>>>>>>");
      fetchUserShifts();
    } else {
      fetchStaff();
    }
  }, [user]);

  // Assign shift to selected staff (append to array)
  const handleAssignShift = async () => {
    if (!selectedUserId || !shiftDate || !shiftRole || !shiftStartTime) return;
    setIsSaving(true);
    try {
      const userRef = doc(db, "UsersDetail", selectedUserId);
      await updateDoc(userRef, {
        shifts: arrayUnion({
          shiftDate,
          shiftRole,
          shiftStartTime,
        }),
      });

      const fcmTokenRef = doc(db, "UsersDetail", selectedUserId);
      const userSnap = await getDoc(fcmTokenRef);

      if (userSnap.exists()) {
        alert("Shift assigned successfully!");
        const fcmToken = userSnap.data().fcmToken;
        SendNotification(fcmToken);
      } else {
        console.log("No such user found!");
      }
      // Clear form
      setSelectedUserId("");
      setShiftDate("");
      setShiftRole("");
      setShiftStartTime("");
    } catch (error) {
      console.error("Error assigning shift:", error);
      alert("Failed to assign shift.");
    } finally {
      setIsSaving(false);
    }
  };

  const SendNotification = (fcmToken) => {
    fetch("https://vantage-care-server.vercel.app/api/send-notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: fcmToken,
        title: "Shift Update from VantageCare",
        body: "Hi there! You’ve got a new shift assigned. Get ready to deliver care with excellence.",
      }),
    })
      .then((res) => res.json())
      .then((data) => console.log("API Response:", data))
      .catch((err) => console.error("API Error:", err));
  };
  const handleCancel = () => {
    setSelectedUserId(null);
    setShiftDate("");
    setShiftRole("");
    setShiftStartTime(""); 
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold mb-2">Welcome {user?.name}</h1>
      <p className="text-lg font-medium mb-8">Role: {user?.role}</p>

      {user?.role === "Staff" && (
        <div className="flex gap-8 mb-8">
          <div className="bg-blue-600 text-white w-60 h-40 flex flex-col items-center justify-center rounded-lg shadow-md">
            <FaCalendarAlt size={36} className="mb-2" />
            <p className="text-md font-medium">Next Shift</p>
            {nextShift ? (
              <>
                <p className="text-sm mt-1">{nextShift.shiftDate}</p>
                <p className="text-sm">
                  {nextShift.shiftRole} - {nextShift.shiftStartTime}
                </p>
              </>
            ) : (
              <p className="text-sm mt-2">No upcoming Shift</p>
            )}
          </div>
          <div className="bg-blue-600 text-white w-60 h-40 flex flex-col items-center justify-center rounded-lg shadow-md">
            <FaCommentDots size={36} className="mb-2" />
            <p className="text-md font-medium">Recent message</p>
            <p className="text-sm mt-2">Message received: 0</p>
          </div>
        </div>
      )}

      {(user?.role === "Admin" || user?.role === "HR") && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Staff List</h2>
          <div className="grid grid-cols-[2fr_1fr_1fr] font-semibold text-gray-700 mb-2 px-2">
            <div>Name</div>
            <div>Role</div>
            <div>Action</div>
          </div>

          {loadingStaff ? (
            <div className="flex items-center gap-2 text-blue-600 font-medium">
              <svg
                className="animate-spin h-5 w-5 text-blue-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8z"
                ></path>
              </svg>
              Loading staff list...
            </div>
          ) : (
            <ul className="mb-4">
              {staffList.map((staff) => (
                <li
                  key={staff.id}
                  className="grid grid-cols-[2fr_1fr_1fr] items-center mb-1 px-2"
                >
                  <span className="font-medium">{staff.name}</span>
                  <span>{staff.role}</span>
                  {!selectedUserId && (
                    <button
                      className="px-3 py-1 bg-green-600 text-white rounded"
                      onClick={() => setSelectedUserId(staff.id)}
                    >
                      Assign Shift
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {selectedUserId && (
            <div className="bg-gray-100 p-4 rounded shadow-md w-full max-w-md">
              <h3 className="text-lg font-semibold mb-2">Assign Shift</h3>

              <label className="block mb-2">
                Date:
                <input
                  type="date"
                  className="block w-full p-2 mt-1 border rounded"
                  value={shiftDate}
                  onChange={(e) => setShiftDate(e.target.value)}
                />
              </label>

              <label className="block mb-2">
                Shift Role:
                <input
                  type="text"
                  placeholder="e.g., Morning, Evening"
                  className="block w-full p-2 mt-1 border rounded"
                  value={shiftRole}
                  onChange={(e) => setShiftRole(e.target.value)}
                />
              </label>

              {/* ✅ New Shift Start Time Field */}
              <label className="block mb-4">
                Start Time:
                <input
                  type="time"
                  className="block w-full p-2 mt-1 border rounded"
                  value={shiftStartTime}
                  onChange={(e) => setShiftStartTime(e.target.value)}
                />
              </label>

              <div className="flex justify-end gap-2">
                <button
                  className="px-4 py-2 bg-gray-400 text-white rounded"
                  onClick={handleCancel}
                >
                  Cancel
                </button>
                <button
                  className={`px-4 py-2 rounded text-white ${
                    isSaving ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600"
                  }`}
                  onClick={handleAssignShift}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <span className="flex items-center gap-2">
                      <svg
                        className="animate-spin h-4 w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v8z"
                        ></path>
                      </svg>
                      Saving...
                    </span>
                  ) : (
                    "Save Shift"
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
