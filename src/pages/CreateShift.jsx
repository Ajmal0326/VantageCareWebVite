import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  getDoc,
  arrayUnion,
  serverTimestamp,
  Timestamp,
  query,
  where,
} from "firebase/firestore";

/* ======= Policy knobs ======= */
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
const fmtHM = (time) => {
  if (!time) return "—";
  const [hour, minute] = String(time).split(":");
  let h = parseInt(hour, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${minute} ${ampm}`;
};

const pct = (used, cap) => (cap > 0 ? Math.min(100, Math.max(0, (used / cap) * 100)) : 0);
const usageColor = (p) => (p >= 90 ? "bg-red-500" : p >= 60 ? "bg-amber-500" : "bg-green-500");

/* --------- Page ---------- */
const CreateShift = () => {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const preselectedUserId = search.get("userId") || "";

  // staff
  const [staffList, setStaffList] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(false);

  // form state
  const [selectedUserId, setSelectedUserId] = useState(preselectedUserId);
  const [shiftRole, setShiftRole] = useState("");
  const [shiftDate, setShiftDate] = useState("");
  const [shiftStartTime, setShiftStartTime] = useState("");
  const [shiftEndTime, setShiftEndTime] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState("");

  /* ---------- fetch staff (Staff only) ---------- */
  useEffect(() => {
    const run = async () => {
      setLoadingStaff(true);
      try {
        const q = query(collection(db, "UsersDetail"), where("role", "==", "Staff"));
        const qs = await getDocs(q);
        const rows = qs.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          shifts: d.data().shifts || [],
          weeklyHourCap: d.data().weeklyHourCap,
        }));
        setStaffList(rows);
      } catch (e) {
        console.error("Load staff failed:", e);
      } finally {
        setLoadingStaff(false);
      }
    };
    run();
  }, []);

  const selectedStaff = useMemo(
    () => staffList.find((s) => s.id === selectedUserId) || null,
    [staffList, selectedUserId]
  );

  /* ---------- Weekly usage (for small inline context) ---------- */
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

  const hours = selectedStaff ? computeWeeklyUsage(selectedStaff) : null;

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

  /* ---------- Push notification helper ---------- */
  const SendNotification = (fcmToken, customBody) => {
    fetch(import.meta.env.VITE_NOTIFY_URL ?? "http://localhost:3000/send-notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: fcmToken,
        title: "Shift Update from VantageCare",
        body: customBody ?? "Hi there! You’ve got a new shift assigned.",
      }),
    }).catch((err) => console.error("Notification API Error:", err));
  };

  /* ---------- Create shift ---------- */
  const handleCreateShift = async () => {
    setValidationError("");

    if (!selectedUserId || !shiftDate || !shiftRole || !shiftStartTime) {
      setValidationError("Please fill Staff, Date, Role, and Start Time.");
      return;
    }

    const staff = selectedStaff;
    if (!staff) {
      setValidationError("Selected staff not found.");
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
      createdAt: Timestamp.now(),
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

    // validations
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
        lastShiftCreatedAt: serverTimestamp(),
      });

      const userSnap = await getDoc(userRef);
      const fcmToken = userSnap.data()?.fcmToken;
      if (fcmToken) SendNotification(fcmToken);

      alert("Shift created successfully!");
      navigate("/dashboard");
    } catch (e) {
      console.error("Create shift failed:", e);
      alert("Failed to create shift.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-xl sm:text-2xl font-semibold mb-4">Create Shift</h1>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 w-full max-w-xl">
        {validationError && (
          <div className="mb-3 p-2 bg-red-50 text-red-700 rounded border border-red-200">
            {validationError}
          </div>
        )}

        {/* Staff select */}
        <label className="block mb-2">
          <span className="text-sm text-gray-700">Staff</span>
          {loadingStaff ? (
            <div className="text-sm text-gray-500 mt-2">Loading staff…</div>
          ) : (
            <select
              disabled={!!preselectedUserId}
              className="block w-full p-2 mt-1 border rounded bg-white"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">Select staff…</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.role})
                </option>
              ))}
            </select>
          )}
          {!!preselectedUserId && (
            <p className="text-xs text-gray-500 mt-1">Preselected from Staff list</p>
          )}
        </label>

        {/* Helpful weekly usage chip */}
        {selectedStaff && (
          <div className="mb-3">
            <div className="text-xs text-gray-600 mb-1">
              Weekly Usage — Used: <b>{hours.usedHours}h</b> / Cap: <b>{hours.cap}h</b> (Left:{" "}
              <b>{hours.left}h</b>)
            </div>
            <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-2.5 ${usageColor(hours.usedPct)} transition-all`}
                style={{ width: `${hours.usedPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Date */}
        <label className="block mb-2">
          <span className="text-sm text-gray-700">Date</span>
          <input
            type="date"
            className="block w-full p-2 mt-1 border rounded"
            value={shiftDate}
            onChange={(e) => setShiftDate(e.target.value)}
          />
        </label>

        {/* Role */}
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

        {/* Times */}
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

        {/* Summary */}
        {!!(shiftStartTime || shiftEndTime) && (
          <p className="text-xs text-gray-600 mt-2">
            {fmtHM(shiftStartTime)}
            {shiftEndTime ? `–${fmtHM(shiftEndTime)}` : ""}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            className="px-4 py-2 bg-gray-400 text-white rounded"
            onClick={() => navigate(-1)}
          >
            Cancel
          </button>
          <button
            className={`px-4 py-2 rounded text-white ${
              isSaving ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600"
            }`}
            onClick={handleCreateShift}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save Shift"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateShift;
