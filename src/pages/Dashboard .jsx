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
import { arrayUnion } from "firebase/firestore";

const Dashboard = () => {
  const { user } = useAuth();
  const [staffList, setStaffList] = useState([]);
  const [shiftRole, setShiftRole] = useState("");
  const [shiftDate, setShiftDate] = useState("");
  const [shiftStartTime, setShiftStartTime] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [nextShift, setNextShift] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [messageUserId, setMessageUserId] = useState("");
  const [messageText, setMessageText] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [messages, setMessages] = useState([]);
  const [showMessagesList, setShowMessagesList] = useState(false);

  // Fetch all staff and shifts
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
              shifts: doc.data().shifts || [], // ✅ Ensure shifts array exists
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
        const querySnapshot = await getDocs(collection(db, "UsersDetail"));
        let userData = null;

        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.email === user.email) {
            userData = data;
          }
        });

        if (userData && Array.isArray(userData.shifts)) {
          const upcoming = getNextShift(userData.shifts);
          setNextShift(upcoming);
        }
      } catch (err) {
        console.error("Error fetching user shift:", err);
      }
    };

    if (user?.role === "Staff") {
      fetchUserShifts();
    } else {
      fetchStaff();
    }
  }, [user]);

  useEffect(() => {
    const fetchUserMessages = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "UsersDetail"));
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.email === user.email) {
            // Ensure we have messages
            const userMessages = Array.isArray(data.messages)
              ? data.messages
              : [];

            const sortedMessages = [...userMessages].sort(
              (a, b) => new Date(b.sentAt) - new Date(a.sentAt)
            );
            console.log("sortmmes >>>>>>>>>>>>>>>>", sortedMessages);
            setMessages(sortedMessages);
          }
        });
      } catch (error) {
        console.error("Error fetching messages:", error);
      }
    };

    if (user?.role === "Staff") {
      fetchUserMessages();
    }
  }, [user]);

  const handleSendMessage = async () => {
    if (!messageUserId || !messageText) {
      alert("Please type a message first.");
      return;
    }
    setIsSendingMessage(true);

    try {
      const userRef = doc(db, "UsersDetail", messageUserId);

      // Save message in Firestore
      await updateDoc(userRef, {
        messages: arrayUnion({
          text: messageText,
          sentAt: new Date().toISOString(),
          from: user?.name || "Admin",
        }),
      });

      // Send push notification
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const fcmToken = userSnap.data().fcmToken;
        SendNotification(fcmToken, messageText);
        alert("Message sent successfully!");
      }

      setMessageUserId("");
      setMessageText("");
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Failed to send message.");
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Assign shift
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
      }

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
     console.log("token is >>>>>>>>.",fcmToken)
    fetch("http://localhost:3000/send-notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: fcmToken,
        title: messageUserId
          ? "New message from Hr."
          : "Shift Update from VantageCare",
        body: messageUserId
          ? messageText
          : "Hi there! You’ve got a new shift assigned. Get ready to deliver care with excellence.",
      }),
    })
      .then((res) => res.json())
      .then((data) => console.log("API Response:", data))
      .catch((err) => console.error("API Error:", err));
  };

  const formatTime = (time) => {
    const [hour, minute] = time.split(":");
    let h = parseInt(hour, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${minute} ${ampm}`;
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

      {/* Staff's own dashboard */}
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
          <div
            className="bg-blue-600 text-white w-60 h-40 flex flex-col items-center justify-center rounded-lg shadow-md cursor-pointer"
            onClick={() => setShowMessagesList(!showMessagesList)}
          >
            <FaCommentDots size={36} className="mb-2" />
            <p className="text-md font-medium">Recent message</p>

            {messages.length > 0 ? (
              <>
                <p className="text-sm mt-1">{messages[0].text}</p>
                <p className="text-xs mt-1 opacity-80">
                  From: {messages[0].from} •{" "}
                  {new Date(messages[0].sentAt).toLocaleString()}
                </p>
                <p className="text-sm mt-1">Total: {messages.length}</p>
              </>
            ) : (
              <p className="text-sm mt-2">No messages found</p>
            )}
          </div>
        </div>
      )}
      {showMessagesList && (
        <div className="mt-4 bg-white border border-gray-300 rounded-lg shadow-md p-4 w-full max-w-lg">
          <h2 className="text-lg font-semibold mb-3">All Messages</h2>
          {messages.length > 0 ? (
            <ul className="max-h-60 overflow-y-auto space-y-3">
              {messages.map((msg, index) => (
                <li key={index} className="border-b border-gray-200 pb-2">
                  <p className="text-gray-800">{msg.text}</p>
                  <p className="text-xs text-gray-500">
                    From: {msg.from} • {new Date(msg.sentAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">No messages found</p>
          )}
        </div>
      )}

      {/* Admin / HR Dashboard */}
      {(user?.role === "Admin" || user?.role === "HR") && (
        <div>
          {!selectedUserId && !messageUserId && (
            <>
              <h2 className="text-xl font-semibold mb-4">Staff List</h2>
              <div className="grid grid-cols-[2fr_1fr_1fr] font-semibold text-gray-700 mb-2 px-2">
                <div>Name</div>
                <div>Role</div>
                <div>Action / Shifts</div>
              </div>
            </>
          )}

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
            !selectedUserId &&
            !messageUserId && (
              <ul className="mb-4">
                {staffList.map((staff) => (
                  <li
                    key={staff.id}
                    className="grid grid-cols-[2fr_1fr_1fr] items-start mb-3 px-4 py-2 border-2 border-blue-500 rounded-md bg-white"
                  >
                    <span className="font-medium">{staff.name}</span>
                    <span>{staff.role}</span>
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <button
                          className="px-3 py-1 bg-green-600 text-white rounded"
                          onClick={() => {
                            setSelectedUserId(staff.id);
                          }}
                        >
                          Assign Shift
                        </button>
                        <button
                          className="px-3 py-1 bg-blue-600 text-white rounded"
                          onClick={() => setMessageUserId(staff.id)}
                        >
                          Message
                        </button>
                      </div>

                      {/* Show assigned shifts */}
                      {staff.shifts && staff.shifts.length > 0 ? (
                        <div className="bg-gray-100 p-2 rounded text-sm max-h-32 overflow-y-auto">
                          <p className="font-semibold mb-1">Assigned Shifts:</p>
                          {staff.shifts.map((shift, idx) => (
                            <p key={idx} className="text-gray-700">
                              {shift.shiftDate} - {shift.shiftRole} (
                              {formatTime(shift.shiftStartTime)})
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500 text-sm">
                          No shifts assigned
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )
          )}
          {messageUserId && (
            <div className="bg-gray-100 p-4 rounded shadow-md w-full max-w-md mt-4">
              <h3 className="text-lg font-semibold mb-2">Send Message</h3>

              <textarea
                placeholder="Type your message here..."
                className="block w-full p-2 mt-1 border rounded mb-4"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
              />

              <div className="flex justify-end gap-2">
                <button
                  className="px-4 py-2 bg-gray-400 text-white rounded"
                  onClick={() => {
                    setMessageUserId("");
                    setMessageText("");
                  }}
                >
                  Cancel
                </button>
                <button
                  className={`px-4 py-2 rounded text-white ${
                    isSendingMessage
                      ? "bg-blue-400 cursor-not-allowed"
                      : "bg-blue-600"
                  }`}
                  onClick={handleSendMessage}
                  disabled={isSendingMessage}
                >
                  {isSendingMessage ? "Sending..." : "Send Message"}
                </button>
              </div>
            </div>
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
