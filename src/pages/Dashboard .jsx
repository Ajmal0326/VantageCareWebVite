import React, { useEffect, useState, useCallback } from "react";
import { FaCalendarAlt, FaCommentDots } from "react-icons/fa";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  getDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";

/* ======= NDIS / Policy knobs ======= */
const DEFAULT_WEEKLY_CAP_HOURS = 38;
const MIN_REST_HOURS = 10;
const MAX_DAILY_HOURS = 12;

const ROLE_DURATION_MIN = {
  morning: 360, // 6h
  evening: 360, // 6h
  night: 600,   // 10h
};

/* --------- Time helpers ---------- */
const minutesOverlap = (aStart, aEnd, bStart, bEnd) => {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  return Math.max(0, Math.floor((end - start) / 60000));
};

const sameLocalDay = (d1, d2) =>
  d1.getFullYear() === d2.getFullYear() &&
  d1.getMonth() === d2.getMonth() &&
  d1.getDate() === d2.getDate();

function getIsoWeekWindow(date) {
  const local = new Date(date);
  const day = (local.getDay() + 6) % 7; // Mon=0
  const start = new Date(local);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - day);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

function parseShiftToDateRange(shift) {
  const start = new Date(`${shift.shiftDate}T${shift.shiftStartTime}:00`);
  let end = null;

  if (shift.shiftEndTime) {
    end = new Date(`${shift.shiftDate}T${shift.shiftEndTime}:00`);
    if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  } else if (shift.durationMinutes) {
    end = new Date(start.getTime() + shift.durationMinutes * 60000);
  } else if (shift.shiftRole) {
    const mins = ROLE_DURATION_MIN[(shift.shiftRole || "").toLowerCase()] || 0;
    end = new Date(start.getTime() + mins * 60000);
  }

  return { start, end };
}

/* --------- UI helpers ---------- */
const pct = (used, cap) => (cap > 0 ? Math.min(100, Math.max(0, (used / cap) * 100)) : 0);
const usageColor = (p) =>
  p >= 90 ? "bg-red-500" : p >= 60 ? "bg-amber-500" : "bg-green-500";
const chipColor = (p) =>
  p >= 90 ? "text-red-700 bg-red-50 ring-red-200" :
  p >= 60 ? "text-amber-700 bg-amber-50 ring-amber-200" :
            "text-green-700 bg-green-50 ring-green-200";

/* --------- Component ---------- */
const Dashboard = () => {
  const { user } = useAuth();

  // Staff collection + UI states
  const [staffList, setStaffList] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(false);

  // Messages
  const [messageUserId, setMessageUserId] = useState("");
  const [messageText, setMessageText] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [messages, setMessages] = useState([]);
  const [showMessagesList, setShowMessagesList] = useState(false);

  // Staff view: next shift
  const [nextShift, setNextShift] = useState(null);

  // ---- Helpers inside component ----
  const computeWeeklyUsage = useCallback((u, refDate = new Date()) => {
    const cap = Number(u.weeklyHourCap) || DEFAULT_WEEKLY_CAP_HOURS;
    const { start, end } = getIsoWeekWindow(refDate);
    let minutes = 0;

    for (const s of u.shifts || []) {
      if (s.status === "cancelled") continue;
      const { start: sStart, end: sEnd } = parseShiftToDateRange(s);
      if (!sStart || !sEnd) continue;
      minutes += minutesOverlap(sStart, sEnd, start, end);
    }

    const usedHours = +(minutes / 60).toFixed(2);
    const left = Math.max(0, +(cap - usedHours).toFixed(2));
    return { usedHours, left, cap, usedPct: pct(usedHours, cap) };
  }, []);

  const refetchStaff = useCallback(async () => {
    setLoadingStaff(true);
    try {
      const querySnapshot = await getDocs(collection(db, "UsersDetail"));
      const staff = querySnapshot.docs
        .map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
          shifts: docSnap.data().shifts || [],
        }))
        .filter((u) => (u.role || "").toLowerCase() === "staff")
        .map((u) => ({
          ...u,
          _hours: computeWeeklyUsage(u),
        }));
      setStaffList(staff);
    } catch (error) {
      console.error("Error fetching staff:", error);
    } finally {
      setLoadingStaff(false);
    }
  }, [computeWeeklyUsage]);

  // Staff view: next shift
  useEffect(() => {
    const getNextShift = (shifts) => {
      const now = new Date();
      const futureShifts = (shifts || [])
        .map((shift) => ({
          ...shift,
          shiftDateTime: new Date(`${shift.shiftDate}T${shift.shiftStartTime}`),
        }))
        .filter((s) => s.shiftDateTime > now)
        .sort((a, b) => +a.shiftDateTime - +b.shiftDateTime);
      return futureShifts[0] || null;
    };

    const fetchUserShifts = async () => {
      try {
        const qs = await getDocs(collection(db, "UsersDetail"));
        let userData = null;
        qs.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.email === user.email) userData = data;
        });
        if (userData && Array.isArray(userData.shifts)) {
          setNextShift(getNextShift(userData.shifts));
        }
      } catch (err) {
        console.error("Error fetching user shift:", err);
      }
    };

    if (user?.role === "Staff") fetchUserShifts();
    else refetchStaff();
  }, [user, refetchStaff]);

  // Staff view: messages
  useEffect(() => {
    const fetchUserMessages = async () => {
      try {
        const qs = await getDocs(collection(db, "UsersDetail"));
        qs.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.email === user.email) {
            const userMessages = Array.isArray(data.messages) ? data.messages : [];
            const sorted = [...userMessages].sort(
              (a, b) => new Date(b.sentAt) - new Date(a.sentAt)
            );
            setMessages(sorted);
          }
        });
      } catch (error) {
        console.error("Error fetching messages:", error);
      }
    };
    if (user?.role === "Staff") fetchUserMessages();
  }, [user]);

  /* ---------- Push notification helper ---------- */
  const SendNotification = (fcmToken, customBody) => {
    fetch("http://localhost:3000/send-notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: fcmToken,
        title: "Shift Update from VantageCare",
        body: customBody ?? "Hi there! You’ve got a new message.",
      }),
    })
      .then((res) => res.json())
      .catch((err) => console.error("API Error:", err));
  };

  /* ---------- Remove shift ---------- */
  const handleRemoveShift = async (userId, shift) => {
    if (!window.confirm(`Remove shift on ${shift.shiftDate} (${shift.shiftRole})?`)) return;
    try {
      const userRef = doc(db, "UsersDetail", userId);
      if (shift.id) {
        const snap = await getDoc(userRef);
        const curr = Array.isArray(snap.data()?.shifts) ? snap.data().shifts : [];
        const next = curr.filter((s) => s.id !== shift.id);
        await updateDoc(userRef, { shifts: next });
      } else {
        await updateDoc(userRef, { shifts: arrayRemove(shift) });
      }
      alert("Shift removed successfully!");
      await refetchStaff();
    } catch (error) {
      console.error("Error removing shift:", error);
      alert("Failed to remove shift.");
    }
  };

  /* ---------- Messaging ---------- */
  const handleSendMessage = async () => {
    if (!messageUserId || !messageText.trim()) return;
    setIsSendingMessage(true);
    const text = messageText.trim();
    try {
      const userRef = doc(db, "UsersDetail", messageUserId);
      await updateDoc(userRef, {
        messages: arrayUnion({ text, from: "HR", sentAt: new Date().toISOString() }),
      });

      const snap = await getDoc(userRef);
      const fcm = snap.data()?.fcmToken;
      if (fcm) SendNotification(fcm, text);

      alert("Message sent.");
      setMessageText("");
      setMessageUserId("");
    } catch (e) {
      console.error("Send message failed:", e);
      alert("Failed to send message.");
    } finally {
      setIsSendingMessage(false);
    }
  };

  /* ---------- Misc helpers ---------- */
  const formatTime = (time) => {
    const [hour, minute] = time.split(":");
    let h = parseInt(hour, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${minute} ${ampm}`;
  };

  /* ---------- Render ---------- */
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">Welcome {user?.name}</h1>
          <p className="text-sm sm:text-base text-gray-600">Role: {user?.role}</p>
        </div>
      </div>

      {/* Staff Dashboard */}
      {user?.role === "Staff" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="bg-blue-600 text-white rounded-xl shadow-md p-4 flex items-center">
            <div className="flex-shrink-0">
              <FaCalendarAlt size={28} className="opacity-90" />
            </div>
            <div className="ml-3">
              <p className="text-sm opacity-90">Next Shift</p>
              {nextShift ? (
                <>
                  <p className="text-base font-medium mt-0.5">{nextShift.shiftDate}</p>
                  <p className="text-sm opacity-95">
                    {nextShift.shiftRole} • {nextShift.shiftStartTime}
                  </p>
                </>
              ) : (
                <p className="text-sm mt-1 opacity-95">No upcoming shift</p>
              )}
            </div>
          </div>

          <button
            className="bg-blue-600 text-white rounded-xl shadow-md p-4 text-left flex items-center"
            onClick={() => setShowMessagesList(!showMessagesList)}
          >
            <FaCommentDots size={28} className="opacity-90" />
            <div className="ml-3">
              <p className="text-sm opacity-90">Recent message</p>
              {messages.length > 0 ? (
                <>
                  <p className="text-sm mt-0.5">{messages[0].text}</p>
                  <p className="text-xs opacity-80 mt-0.5">
                    From: {messages[0].from} • {new Date(messages[0].sentAt).toLocaleString()}
                  </p>
                </>
              ) : (
                <p className="text-sm mt-1 opacity-95">No messages found</p>
              )}
            </div>
          </button>
        </div>
      )}

      {showMessagesList && (
        <div className="mt-4 bg-white border border-gray-200 rounded-xl shadow-sm p-4 w-full max-w-2xl">
          <h2 className="text-base sm:text-lg font-semibold mb-3">All Messages</h2>
          {messages.length > 0 ? (
            <ul className="max-h-64 overflow-y-auto space-y-3">
              {messages.map((msg, index) => (
                <li key={index} className="border-b border-gray-100 pb-2">
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
        <div className="w-full">
          {/* ===== Staff list header ===== */}
          {!messageUserId && (
            <>
              <h2 className="text-lg sm:text-xl font-semibold mb-3">Staff List</h2>
              <div className="hidden md:grid md:grid-cols-12 font-semibold text-gray-700 mb-2 px-2">
                <div className="col-span-4">Name</div>
                <div className="col-span-2">Role</div>
                <div className="col-span-3">Hours</div>
                <div className="col-span-3">Actions / Shifts</div>
              </div>
            </>
          )}

          {/* ===== Staff list ===== */}
          {loadingStaff ? (
            <div className="flex items-center gap-2 text-blue-600 font-medium">
              <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
              </svg>
              Loading staff list...
            </div>
          ) : (
            !messageUserId && (
              <ul className="space-y-3">
                {staffList.map((staff) => {
                  const u = staff._hours || { usedHours: 0, left: 0, cap: 0, usedPct: 0 };
                  const barPct = u.usedPct;
                  const barColor = usageColor(barPct);
                  const chip = chipColor(barPct);

                  return (
                    <li
                      key={staff.id}
                      className="bg-white border border-gray-200 rounded-xl p-3 md:p-4 shadow-sm"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4">
                        {/* Name + role */}
                        <div className="md:col-span-4 flex items-center justify-between md:block">
                          <div>
                            <div className="font-medium text-gray-900">{staff.name}</div>
                            <div className="text-sm text-gray-500 md:mt-0.5">{staff.role}</div>
                          </div>
                          <div className="flex md:hidden gap-2">
                            <Link
                              to={`/create-shift?userId=${staff.id}`}
                              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg text-center"
                            >
                              Assign
                            </Link>
                            <button
                              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg"
                              onClick={() => setMessageUserId(staff.id)}
                            >
                              Message
                            </button>
                          </div>
                        </div>

                        {/* Hours Card */}
                        <div className="md:col-span-5">
                          <div className="rounded-xl border border-gray-200 p-3">
                            <div className="flex items-center justify-between">
                              <div className={`text-xs font-semibold px-2 py-1 rounded-full ring-1 ${chip}`}>
                                {barPct.toFixed(0)}% used
                              </div>
                              <div className="text-xs text-gray-500">This week</div>
                            </div>

                            <div className="mt-2">
                              <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-2.5 ${barColor} transition-all`}
                                  style={{ width: `${barPct}%` }}
                                />
                              </div>
                            </div>

                            <div className="mt-2 grid grid-cols-3 gap-2 text-xs sm:text-sm">
                              <div className="rounded-lg bg-gray-50 p-2 text-center">
                                <div className="text-gray-500">Used</div>
                                <div className="font-semibold text-gray-900">{u.usedHours}h</div>
                              </div>
                              <div className="rounded-lg bg-gray-50 p-2 text-center">
                                <div className="text-gray-500">Left</div>
                                <div className="font-semibold text-gray-900">{u.left}h</div>
                              </div>
                              <div className="rounded-lg bg-gray-50 p-2 text-center">
                                <div className="text-gray-500">Cap</div>
                                <div className="font-semibold text-gray-900">{u.cap}h</div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Actions + Shifts */}
                        <div className="md:col-span-3 flex flex-col gap-2">
                          <div className="hidden md:flex gap-2">
                            <Link
                              to={`/create-shift?userId=${staff.id}`}
                              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg text-center"
                            >
                              Assign Shift
                            </Link>
                            <button
                              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg"
                              onClick={() => setMessageUserId(staff.id)}
                            >
                              Message
                            </button>
                          </div>

                          {staff.shifts && staff.shifts.length > 0 ? (
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 max-h-44 overflow-y-auto">
                              <p className="font-semibold text-sm text-gray-700 mb-1">Assigned Shifts</p>
                              {staff.shifts.map((shift, idx) => (
                                <div key={idx} className="flex justify-between items-center text-gray-700 mb-1">
                                  <span className="text-xs sm:text-sm">
                                    {shift.shiftDate} • {shift.shiftRole} (
                                    {formatTime(shift.shiftStartTime)}
                                    {shift.shiftEndTime ? `–${formatTime(shift.shiftEndTime)}` : ""})
                                  </span>
                                  <button
                                    className="ml-2 px-2 py-0.5 bg-red-600 text-white text-[11px] sm:text-xs rounded"
                                    onClick={() => handleRemoveShift(staff.id, shift)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-500 text-sm">No shifts</p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          )}

          {/* ===== Compose message ===== */}
          {messageUserId && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 w-full max-w-xl mt-4">
              <h3 className="text-lg font-semibold mb-2">Send Message</h3>
              <textarea
                placeholder="Type your message here..."
                className="block w-full p-2 mt-1 border rounded"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
              />
              <div className="flex justify-end gap-2 mt-3">
                <button className="px-4 py-2 bg-gray-400 text-white rounded" onClick={() => { setMessageUserId(""); setMessageText(""); }}>
                  Cancel
                </button>
                <button
                  className={`px-4 py-2 rounded text-white ${isSendingMessage ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600"}`}
                  onClick={handleSendMessage}
                  disabled={isSendingMessage}
                >
                  {isSendingMessage ? "Sending..." : "Send Message"}
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
