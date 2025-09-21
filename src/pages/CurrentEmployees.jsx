import React, { useEffect, useMemo, useState, useCallback } from "react";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  query as fsQuery,
  where,
} from "firebase/firestore";

/* ======= knobs (match Dashboard) ======= */
const DEFAULT_WEEKLY_CAP_HOURS = 38;

const ROLE_DURATION_MIN = {
  morning: 360,
  evening: 360,
  night: 600,
};

/* --------- time/helpers (shared with Dashboard) ---------- */
const minutesOverlap = (aStart, aEnd, bStart, bEnd) => {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  return Math.max(0, Math.floor((end - start) / 60000));
};

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

const pct = (used, cap) =>
  cap > 0 ? Math.min(100, Math.max(0, (used / cap) * 100)) : 0;

const barColor = (p) =>
  p >= 90 ? "bg-red-500" : p >= 60 ? "bg-amber-500" : "bg-green-500";

const chipTone = (p) =>
  p >= 90
    ? "text-red-700 bg-red-50 ring-red-200"
    : p >= 60
    ? "text-amber-700 bg-amber-50 ring-amber-200"
    : "text-green-700 bg-green-50 ring-green-200";

/* ================= PAGE ================= */
const CurrentEmployees = () => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]); // only Staff docs
  const [q, setQ] = useState("");

  // compute weekly usage like on Dashboard
  const computeWeeklyUsage = useCallback((u, refDate = new Date()) => {
    const cap = Number(u.weeklyHourCap) || DEFAULT_WEEKLY_CAP_HOURS;
    const { start, end } = getIsoWeekWindow(refDate);
    let minutes = 0;

    for (const s of u.shifts || []) {
      if ((s.status || "").toLowerCase() === "cancelled") continue;
      const { start: sStart, end: sEnd } = parseShiftToDateRange(s);
      if (!sStart || !sEnd) continue;
      minutes += minutesOverlap(sStart, sEnd, start, end);
    }

    const usedHours = +(minutes / 60).toFixed(0); // integer hours in list
    const left = Math.max(0, +(cap - usedHours).toFixed(0));
    const usedPct = pct(usedHours, cap);
    return { usedHours, left, cap, usedPct };
  }, []);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        // ONLY Staff employees
        const qStaff = fsQuery(
          collection(db, "UsersDetail"),
          where("role", "==", "Staff")
        );
        const snap = await getDocs(qStaff);
        const data = snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            name: x.name || "—",
            email: x.email || "—",
            role: x.role || "Staff",
            weeklyHourCap: x.weeklyHourCap,
            shifts: Array.isArray(x.shifts) ? x.shifts : [],
          };
        });
        const withUsage = data.map((u) => ({
          ...u,
          _hours: computeWeeklyUsage(u),
          _shiftCount: u.shifts.length,
        }));
        setRows(withUsage);
      } catch (e) {
        console.error("Load staff failed:", e);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [computeWeeklyUsage]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => {
      const hay = `${r.name} ${r.email} ${r.role}`.toLowerCase();
      return hay.includes(term);
    });
  }, [rows, q]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">Current Employees</h1>
          <p className="text-gray-600 text-sm">
            Active employees — <b>Staff only</b>
          </p>
        </div>

        <input
          type="text"
          placeholder="Search by name, email…"
          className="w-full sm:w-80 border rounded-lg px-3 py-2"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-blue-200">
        <table className="min-w-full text-left">
          <thead>
            <tr className="bg-blue-600 text-white">
              <th className="py-2 px-3 sm:px-4">Name</th>
              <th className="py-2 px-3 sm:px-4">Email</th>
              <th className="py-2 px-3 sm:px-4">Role</th>
              <th className="py-2 px-3 sm:px-4">Weekly Hours</th>
              <th className="py-2 px-3 sm:px-4">Shifts</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="py-3 px-4" colSpan={5}>
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="py-3 px-4 text-gray-600" colSpan={5}>
                  No staff found.
                </td>
              </tr>
            ) : (
              filtered.map((u) => {
                const h = u._hours || { usedHours: 0, cap: 0, usedPct: 0, left: 0 };
                return (
                  <tr key={u.id} className="odd:bg-blue-50/40">
                    <td className="py-3 px-3 sm:px-4">{u.name}</td>
                    <td className="py-3 px-3 sm:px-4">{u.email}</td>
                    <td className="py-3 px-3 sm:px-4">{u.role || "Staff"}</td>
                    <td className="py-3 px-3 sm:px-4">
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded-full ring-1 ${chipTone(
                            h.usedPct
                          )}`}
                        >
                          {h.usedHours}h / {h.cap || DEFAULT_WEEKLY_CAP_HOURS}h
                        </span>
                        <div className="flex-1 min-w-[140px] h-2.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-2.5 ${barColor(h.usedPct)} transition-all`}
                            style={{ width: `${h.usedPct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">{u._shiftCount}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CurrentEmployees;
