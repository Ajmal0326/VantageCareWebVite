import React, { useEffect, useState, useCallback } from "react";
import { FaCalendarAlt, FaCommentDots } from "react-icons/fa";
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
  serverTimestamp,
  Timestamp,
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

  // Assign shift form
  const [selectedUserId, setSelectedUserId] = useState("");
  const [shiftRole, setShiftRole] = useState("");
  const [shiftDate, setShiftDate] = useState("");
  const [shiftStartTime, setShiftStartTime] = useState("");
  const [shiftEndTime, setShiftEndTime] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState("");

  // Messages
  const [messageUserId, setMessageUserId] = useState("");
  const [messageText, setMessageText] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [messages, setMessages] = useState([]);
  const [showMessagesList, setShowMessagesList] = useState(false);

  // Staff view: next shift
  const [nextShift, setNextShift] = useState(null);

  // Admin queue busy row
  const [pendingBusy, setPendingBusy] = useState(null);

  // ---- Helpers inside component ----
  const fmtHM = (time) => {
    if (!time) return "—";
    const [hour, minute] = String(time).split(":");
    let h = parseInt(hour, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${minute} ${ampm}`;
  };

  const keyOf = (uId, s) =>
    `${uId}:${s.id || `${s.shiftDate}|${s.shiftRole}|${s.shiftStartTime}|${s.shiftEndTime || ""}`}`;

  const getFromTo = (s) => {
    const hasReq = s.request && (s.request.shiftStartTime || s.request.shiftEndTime);
    return hasReq
      ? {
          fromStart: s.shiftStartTime,
          fromEnd: s.shiftEndTime || "",
          toStart: s.request.shiftStartTime || s.shiftStartTime,
          toEnd: s.request.shiftEndTime || s.shiftEndTime || "",
        }
      : {
          fromStart: "",
          fromEnd: "",
          toStart: s.shiftStartTime,
          toEnd: s.shiftEndTime || "",
        };
  };

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
        title: messageUserId ? "New message from Hr." : "Shift Update from VantageCare",
        body: customBody
          ? customBody
          : messageUserId
          ? messageText
          : "Hi there! You’ve got a new shift assigned.",
      }),
    })
      .then((res) => res.json())
      .catch((err) => console.error("API Error:", err));
  };

  /* ---------- Validations ---------- */
  const validateOneShiftPerDay = (existingShifts, newDate) => {
    const exists = (existingShifts || []).some(
      (s) => s.shiftDate === newDate && s.status !== "cancelled"
    );
    return exists ? `This staff already has a shift on ${newDate}.` : "";
    };

  const validateNoOverlap = (existingShifts, newStart, newEnd) => {
    for (const s of existingShifts || []) {
      const { start, end } = parseShiftToDateRange(s);
      if (!start || !end) continue;
      if (minutesOverlap(start, end, newStart, newEnd) > 0) {
        return `Overlaps with existing shift on ${s.shiftDate} (${s.shiftStartTime}${s.shiftEndTime ? `–${s.shiftEndTime}` : ""})`;
      }
    }
    return "";
  };

  const validateDailyLimit = (newStart, newEnd) => {
    if (sameLocalDay(newStart, newEnd)) {
      const mins = Math.floor((newEnd - newStart) / 60000);
      if (mins > MAX_DAILY_HOURS * 60) {
        return `Exceeds max daily hours (${MAX_DAILY_HOURS}h).`;
      }
    }
    return "";
  };

  const validateMinRest = (existingShifts, newStart, newEnd) => {
    const minRestMs = MIN_REST_HOURS * 60 * 60 * 1000;
    for (const s of existingShifts || []) {
      const { start, end } = parseShiftToDateRange(s);
      if (!start || !end) continue;
      const restAfterPrev = newStart - end;
      const restAfterNew = start - newEnd;
      if (restAfterPrev > 0 && restAfterPrev < minRestMs) {
        return `Not enough rest since prior shift (${MIN_REST_HOURS}h).`;
      }
      if (restAfterNew > 0 && restAfterNew < minRestMs) {
        return `Not enough rest before next shift (${MIN_REST_HOURS}h).`;
      }
    }
    return "";
  };

  const validateWeeklyCap = (staff, newStart, newEnd) => {
    const cap = Number(staff.weeklyHourCap) || DEFAULT_WEEKLY_CAP_HOURS;
    const { start: wkStart, end: wkEnd } = getIsoWeekWindow(newStart);

    let minutes = 0;
    for (const s of staff.shifts || []) {
      if (s.status === "cancelled") continue;
      const { start, end } = parseShiftToDateRange(s);
      if (!start || !end) continue;
      minutes += minutesOverlap(start, end, wkStart, wkEnd);
    }

    const add = minutesOverlap(newStart, newEnd, wkStart, wkEnd);
    const usedHours = minutes / 60;
    const newTotal = usedHours + add / 60;
    if (newTotal > cap + 1e-6) {
      return `Weekly cap exceeded: ${newTotal.toFixed(2)}h > ${cap}h. Hours left: ${(cap - usedHours).toFixed(2)}h.`;
    }
    return "";
  };

  /* ---------- Assign shift with validations ---------- */
  const handleAssignShift = async () => {
    setValidationError("");

    if (!selectedUserId || !shiftDate || !shiftRole || !shiftStartTime) {
      setValidationError("Please fill Date, Role, and Start Time.");
      return;
    }

    const roleKey = String(shiftRole).trim().toLowerCase();
    const hasEnd = !!String(shiftEndTime || "").trim();

    const newShift = {
      id: (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)),
      shiftDate: String(shiftDate).trim(),
      shiftRole: roleKey,
      shiftStartTime: String(shiftStartTime).trim(),
      status: "assigned",
      createdAt: Timestamp.now(), // OK inside array
      ...(hasEnd
        ? { shiftEndTime: String(shiftEndTime).trim() }
        : { durationMinutes: ROLE_DURATION_MIN[roleKey] || 0 }),
    };

    if (!newShift.shiftEndTime && !newShift.durationMinutes) {
      setValidationError("Please enter an End Time or define a role duration.");
      return;
    }

    const { start: newStart, end: newEnd } = parseShiftToDateRange(newShift);
    if (!newStart || !newEnd) {
      setValidationError("Invalid shift times.");
      return;
    }

    const staff = staffList.find((s) => s.id === selectedUserId);
    if (!staff) {
      setValidationError("Staff not found.");
      return;
    }

    const sameDateErr = validateOneShiftPerDay(staff.shifts, newShift.shiftDate);
    if (sameDateErr) return setValidationError(sameDateErr);

    const overlapErr = validateNoOverlap(staff.shifts, newStart, newEnd);
    if (overlapErr) return setValidationError(overlapErr);

    const dailyErr = validateDailyLimit(newStart, newEnd);
    if (dailyErr) return setValidationError(dailyErr);

    const restErr = validateMinRest(staff.shifts, newStart, newEnd);
    if (restErr) return setValidationError(restErr);

    const capErr = validateWeeklyCap(staff, newStart, newEnd);
    if (capErr) return setValidationError(capErr);

    setIsSaving(true);
    try {
      const userRef = doc(db, "UsersDetail", selectedUserId);

      await updateDoc(userRef, {
        shifts: arrayUnion(newShift),
        lastShiftCreatedAt: serverTimestamp(), // top-level is allowed
      });

      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        alert("Shift assigned successfully!");
        const fcmToken = userSnap.data().fcmToken;
        if (fcmToken) SendNotification(fcmToken);
      }

      setSelectedUserId("");
      setShiftDate("");
      setShiftRole("");
      setShiftStartTime("");
      setShiftEndTime("");

      await refetchStaff();
    } catch (error) {
      console.error("Error assigning shift:", error);
      alert("Failed to assign shift.");
    } finally {
      setIsSaving(false);
    }
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

  /* ---------- Approve / Reject time change ---------- */
  const approveTimeChange = async ({ staff, shift }) => {
    const busyKey = keyOf(staff.id, shift);
    setPendingBusy(busyKey);
    try {
      const userRef = doc(db, "UsersDetail", staff.id);
      const snap = await getDoc(userRef);
      const curr = Array.isArray(snap.data()?.shifts) ? snap.data().shifts : [];

      const updated = curr.map((raw) => {
        const same =
          (raw.id && shift.id && raw.id === shift.id) ||
          (raw.shiftDate === shift.shiftDate &&
            raw.shiftRole === shift.shiftRole &&
            raw.shiftStartTime === shift.shiftStartTime &&
            (raw.shiftEndTime || "") === (shift.shiftEndTime || ""));

        if (!same) return raw;

        if (raw.request && (raw.request.shiftStartTime || raw.request.shiftEndTime)) {
          return {
            ...raw,
            shiftStartTime: raw.request.shiftStartTime ?? raw.shiftStartTime,
            shiftEndTime: raw.request.shiftEndTime ?? raw.shiftEndTime,
            status: "approved",
            request: null,
          };
        }
        return { ...raw, status: "approved" };
      });

      const text = `Your time change for ${shift.shiftDate} (${shift.shiftRole}) has been approved.`;
      await updateDoc(userRef, {
        shifts: updated,
        messages: arrayUnion({ text, from: "HR", sentAt: new Date().toISOString() }),
      });

      const fcm = snap.data()?.fcmToken;
      if (fcm) SendNotification(fcm, text);

      await refetchStaff();
    } catch (e) {
      console.error("Approve failed:", e);
      alert("Failed to approve request.");
    } finally {
      setPendingBusy(null);
    }
  };

  const rejectTimeChange = async ({ staff, shift }) => {
    const busyKey = keyOf(staff.id, shift);
    setPendingBusy(busyKey);
    try {
      const userRef = doc(db, "UsersDetail", staff.id);
      const snap = await getDoc(userRef);
      const curr = Array.isArray(snap.data()?.shifts) ? snap.data().shifts : [];

      const updated = curr.map((raw) => {
        const same =
          (raw.id && shift.id && raw.id === shift.id) ||
          (raw.shiftDate === shift.shiftDate &&
            raw.shiftRole === shift.shiftRole &&
            raw.shiftStartTime === shift.shiftStartTime &&
            (raw.shiftEndTime || "") === (shift.shiftEndTime || ""));

        if (!same) return raw;

        if (raw.request) {
          const { request, ...rest } = raw; // drop the request
          return { ...rest, status: "assigned" };
        }
        return { ...raw, status: "assigned" };
      });

      const text = `Your time change for ${shift.shiftDate} (${shift.shiftRole}) was rejected. Your assigned time remains ${fmtHM(shift.shiftStartTime)}${shift.shiftEndTime ? `–${fmtHM(shift.shiftEndTime)}` : ""}.`;
      await updateDoc(userRef, {
        shifts: updated,
        messages: arrayUnion({ text, from: "HR", sentAt: new Date().toISOString() }),
      });

      const fcm = snap.data()?.fcmToken;
      if (fcm) SendNotification(fcm, text);

      await refetchStaff();
    } catch (e) {
      console.error("Reject failed:", e);
      alert("Failed to reject request.");
    } finally {
      setPendingBusy(null);
    }
  };

  /* ---------- Derived: pending requests ---------- */
  const pendingRequests = React.useMemo(() => {
    return staffList.flatMap((staff) =>
      (staff.shifts || [])
        .filter((s) => (s.status || "").toLowerCase() === "pending")
        .map((shift) => ({ staff, shift }))
    );
  }, [staffList]);

  /* ---------- Misc helpers ---------- */
  const formatTime = (time) => {
    const [hour, minute] = time.split(":");
    let h = parseInt(hour, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${minute} ${ampm}`;
  };

  const handleCancel = () => {
    setSelectedUserId("");
    setShiftDate("");
    setShiftRole("");
    setShiftStartTime("");
    setShiftEndTime("");
    setValidationError("");
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

          {/* ===== Time change requests queue ===== */}
          {pendingRequests.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg sm:text-xl font-semibold mb-3">Time change requests</h2>
              <div className="overflow-x-auto rounded-lg border border-blue-200">
                <table className="min-w-full text-left">
                  <thead>
                    <tr className="bg-blue-600 text-white">
                      <th className="py-2 px-3 sm:px-4">Staff</th>
                      <th className="py-2 px-3 sm:px-4">Date</th>
                      <th className="py-2 px-3 sm:px-4">Role</th>
                      <th className="py-2 px-3 sm:px-4">From</th>
                      <th className="py-2 px-3 sm:px-4">To</th>
                      <th className="py-2 px-3 sm:px-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRequests.map(({ staff, shift }) => {
                      const { fromStart, fromEnd, toStart, toEnd } = getFromTo(shift);
                      const rowKey = keyOf(staff.id, shift);
                      const busy = pendingBusy === rowKey;
                      return (
                        <tr key={rowKey} className="odd:bg-blue-50/40">
                          <td className="py-2 px-3 sm:px-4">{staff.name}</td>
                          <td className="py-2 px-3 sm:px-4">{shift.shiftDate}</td>
                          <td className="py-2 px-3 sm:px-4">{shift.shiftRole}</td>
                          <td className="py-2 px-3 sm:px-4">
                            {fromStart ? `${fmtHM(fromStart)}${fromEnd ? `–${fmtHM(fromEnd)}` : ""}` : "—"}
                          </td>
                          <td className="py-2 px-3 sm:px-4">
                            {`${fmtHM(toStart)}${toEnd ? `–${fmtHM(toEnd)}` : ""}`}
                          </td>
                          <td className="py-2 px-3 sm:px-4">
                            <div className="flex gap-2">
                              <button
                                disabled={busy}
                                onClick={() => approveTimeChange({ staff, shift })}
                                className="text-sm px-3 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                              >
                                {busy ? "..." : "Approve"}
                              </button>
                              <button
                                disabled={busy}
                                onClick={() => rejectTimeChange({ staff, shift })}
                                className="text-sm px-3 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                              >
                                {busy ? "..." : "Reject"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== Staff list header ===== */}
          {!selectedUserId && !messageUserId && (
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
            !selectedUserId &&
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
                            <button
                              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg"
                              onClick={() => setSelectedUserId(staff.id)}
                            >
                              Assign
                            </button>
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
                            <button
                              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg"
                              onClick={() => setSelectedUserId(staff.id)}
                            >
                              Assign Shift
                            </button>
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

          {/* ===== Assign shift form ===== */}
          {selectedUserId && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 w-full max-w-xl mt-4">
              <h3 className="text-lg font-semibold mb-2">Assign Shift</h3>

              {validationError && (
                <div className="mb-3 p-2 bg-red-50 text-red-700 rounded border border-red-200">{validationError}</div>
              )}

              <label className="block mb-2">
                <span className="text-sm text-gray-700">Date</span>
                <input
                  type="date"
                  className="block w-full p-2 mt-1 border rounded"
                  value={shiftDate}
                  onChange={(e) => setShiftDate(e.target.value)}
                />
              </label>

              <label className="block mb-2">
                <span className="text-sm text-gray-700">Shift Role</span>
                <input
                  type="text"
                  placeholder="e.g., morning, evening, night"
                  className="block w-full p-2 mt-1 border rounded"
                  value={shiftRole}
                  onChange={(e) => setShiftRole(e.target.value)}
                />
                {!ROLE_DURATION_MIN[(shiftRole || "").toLowerCase()] && (
                  <p className="text-xs text-gray-500 mt-1">
                    Tip: define a duration for this role or set End Time below.
                  </p>
                )}
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm text-gray-700">Start Time</span>
                  <input
                    type="time"
                    className="block w-full p-2 mt-1 border rounded"
                    value={shiftStartTime}
                    onChange={(e) => setShiftStartTime(e.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="text-sm text-gray-700">End Time (optional)</span>
                  <input
                    type="time"
                    className="block w-full p-2 mt-1 border rounded"
                    value={shiftEndTime}
                    onChange={(e) => setShiftEndTime(e.target.value)}
                  />
                </label>
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <button className="px-4 py-2 bg-gray-400 text-white rounded" onClick={handleCancel}>
                  Cancel
                </button>
                <button
                  className={`px-4 py-2 rounded text-white ${isSaving ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600"}`}
                  onClick={handleAssignShift}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
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
