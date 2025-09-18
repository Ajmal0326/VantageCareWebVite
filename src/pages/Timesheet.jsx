import React, { useEffect, useMemo, useState } from "react";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { collection, getDocs, doc, updateDoc, Timestamp } from "firebase/firestore";

/* -------------------- CONFIG -------------------- */
const WEEK_START = "sunday"; // "sunday" | "monday"
const ROLE_DURATION_MIN = { morning: 360, evening: 360, night: 600 };

/* -------------------- HELPERS -------------------- */
const safeStr = (v) => (typeof v === "string" ? v.trim() : v ?? "");

/** Normalize YYYY-M-D or with slashes → YYYY-MM-DD */
function normalizeYMD(input) {
  const s = safeStr(input);
  if (!s) return "";
  const m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (!m) return s;
  const [, y, mo, d] = m;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Normalize a time string into HH:mm (accepts 6pm, 6:30PM, 18, 18.0, etc.) */
function normalizeHM(raw) {
  const s = safeStr(raw).toLowerCase().replace(/\s+/g, "");
  if (!s) return "";
  // 6pm / 6:30pm
  let m = s.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm)$/);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2] || "0", 10);
    if (m[3] === "pm" && h !== 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  // 18:00 / 18.00 / 18h00 / 18 / 8:5
  m = s.match(/^(\d{1,2})(?::|\.|h)?(\d{1,2})?$/);
  if (m) {
    const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
    const min = Math.min(59, Math.max(0, parseInt(m[2] || "0", 10)));
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  return s;
}

/** Normalize field names (case-insensitive) and values on a raw shift object */
function normalizeShift(raw) {
  const obj = raw || {};
  const keys = Object.keys(obj);
  const pick = (name) => {
    const re = new RegExp(`^${name}$`, "i");
    const k = keys.find((kk) => re.test(kk));
    return k ? obj[k] : undefined;
  };

  const date = normalizeYMD(pick("shiftDate") ?? pick("date"));
  const start = normalizeHM(pick("shiftStartTime") ?? pick("startTime") ?? pick("start"));
  const end = normalizeHM(pick("shiftEndTime") ?? pick("endTime") ?? pick("end"));
  const role = safeStr(pick("shiftRole") ?? pick("role")).toLowerCase();
  const dur = Number(pick("durationMinutes")) || 0;
  const status = safeStr(pick("status")).toLowerCase() || "assigned";

  return {
    ...obj,
    shiftDate: date,
    shiftStartTime: start,
    shiftEndTime: end,
    shiftRole: role,
    durationMinutes: dur,
    status,
  };
}

function parseYMD(ymd) {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  return { y, m, d };
}
function localDateFrom(ymd, hm = "00:00") {
  const { y, m, d } = parseYMD(ymd);
  const [H, M] = normalizeHM(hm).split(":").map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d, H, M, 0, 0);
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMinutes(d, mins) { return new Date(d.getTime() + mins * 60000); }

function startOfWeek(d = new Date(), weekStart = WEEK_START) {
  const date = new Date(d);
  const isSun = (weekStart || "monday").toLowerCase() === "sunday";
  const dow = date.getDay(); // 0..6
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (isSun ? dow : (dow + 6) % 7));
  return date;
}
function ymd(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function fmtRange(a, b) {
  const opts = { day: "2-digit", month: "short", year: "numeric" };
  return `${a.toLocaleDateString(undefined, opts)} – ${b.toLocaleDateString(undefined, opts)}`;
}
function weekdayLabel(d) {
  return d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" });
}
function time12hFromDate(d) {
  if (!d) return "";
  const H = d.getHours(); const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = H >= 12 ? "PM" : "AM"; const h = H % 12 || 12;
  return `${h}:${m} ${ampm}`;
}
function time12hHM(hm) {
  const [H, M] = normalizeHM(hm || "").split(":").map((n) => parseInt(n || "0", 10));
  const ampm = H >= 12 ? "PM" : "AM"; const h = H % 12 || 12;
  return `${h}:${String(M).padStart(2, "0")} ${ampm}`;
}

/** Parse a shift into local start/end robustly, with strict overnight detection. */
function parseShiftToRange(rawShift) {
  const s = normalizeShift(rawShift);
  const dateStr = s.shiftDate || "1970-01-01";
  const start = localDateFrom(dateStr, s.shiftStartTime || "00:00");

  let end = null;
  let overnight = false;

  if (s.shiftEndTime) {
    const candidate = localDateFrom(dateStr, s.shiftEndTime);
    if (candidate < start) { // strictly before → true overnight
      overnight = true;
      end = addMinutes(candidate, 24 * 60);
    } else {
      end = candidate;
    }
  } else {
    const mins = s.durationMinutes || ROLE_DURATION_MIN[s.shiftRole] || 0;
    if (mins > 0) end = addMinutes(start, mins);
  }

  return { start, end, overnight };
}

function shiftHours(shift) {
  const { start, end } = parseShiftToRange(shift);
  if (!start || !end) return 0;
  const hrs = (end.getTime() - start.getTime()) / 3600000;
  const clamped = Math.max(0, Math.min(24, hrs));
  return Math.round(clamped * 100) / 100;
}

/** simple status check */
const isPending = (s) => safeStr(s.status || "").toLowerCase() === "pending";

/* -------------------- COMPONENT -------------------- */
export default function Timesheet() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  // persist context for updates
  const [userDocId, setUserDocId] = useState(null);
  const [allShiftsRaw, setAllShiftsRaw] = useState([]); // as stored in Firestore

  const [myWeekShifts, setMyWeekShifts] = useState([]);
  const [loading, setLoading] = useState(false);

  // inline editor
  const [editing, setEditing] = useState(null); // { idxInWeek, start, end, originalKey }
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i);
      return { key: ymd(d), date: d };
    }),
    [weekStart]
  );

  // recompute visible week rows from allShiftsRaw
  const computeWeek = (rawList) => {
    const norm = (rawList || []).map(normalizeShift);
    const startStr = ymd(weekStart);
    const endStrExclusive = ymd(addDays(weekEnd, 1));
    return norm
      .filter((s) => s.status !== "cancelled")
      .filter((s) => s.shiftDate && s.shiftDate >= startStr && s.shiftDate < endStrExclusive)
      .sort((a, b) => {
        const ta = parseShiftToRange(a).start.getTime();
        const tb = parseShiftToRange(b).start.getTime();
        return ta - tb;
      });
  };

  useEffect(() => {
    const fetchMyWeek = async () => {
      if (!user?.email) return;
      setLoading(true);
      try {
        const usersSnap = await getDocs(collection(db, "UsersDetail"));
        let mine = null;
        let mineId = null;

        usersSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.email === user.email) {
            mine = data;
            mineId = docSnap.id;
          }
        });

        const raw = Array.isArray(mine?.shifts) ? mine.shifts : [];
        setUserDocId(mineId);
        setAllShiftsRaw(raw);
        setMyWeekShifts(computeWeek(raw));
      } catch (e) {
        console.error("Timesheet fetch error:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchMyWeek();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, weekStart, weekEnd]);

  // If week window changes but not the raw data, recompute the rows
  useEffect(() => {
    setMyWeekShifts(computeWeek(allShiftsRaw));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, weekEnd]);

  const assignedKeys = useMemo(
    () => new Set(myWeekShifts.map((s) => s.shiftDate)),
    [myWeekShifts]
  );
  const unassignedDays = useMemo(
    () => weekDays.filter((d) => !assignedKeys.has(d.key)),
    [weekDays, assignedKeys]
  );

  const totalHoursDisplay = useMemo(() => {
    const sum = myWeekShifts.reduce((acc, s) => acc + shiftHours(s), 0);
    return sum.toFixed(2);
  }, [myWeekShifts]);

  const handlePrevWeek = () => setWeekStart(addDays(weekStart, -7));
  const handleNextWeek = () => setWeekStart(addDays(weekStart, +7));

  // ---------- Editing logic ----------
  function beginEdit(idx) {
    const s = myWeekShifts[idx];
    setErrorMsg("");

    // Block if already pending
    if (isPending(s)) {
      setErrorMsg("This shift has a time-change request awaiting approval. You can edit again after HR responds.");
      return;
    }

    setEditing({
      idxInWeek: idx,
      start: normalizeHM(s.shiftStartTime || "08:00"),
      end: normalizeHM(s.shiftEndTime || "17:00"),
      // use this to find the record in allShiftsRaw
      originalKey: {
        date: s.shiftDate,
        start: normalizeHM(s.shiftStartTime || ""),
        end: normalizeHM(s.shiftEndTime || ""),
        role: safeStr(s.shiftRole || ""),
      },
    });
  }

  function cancelEdit() {
    setEditing(null);
    setErrorMsg("");
  }

  async function saveEdit() {
    if (!editing || !userDocId) return;

    const newStart = normalizeHM(editing.start);
    const newEnd = normalizeHM(editing.end);
    if (!newStart || !newEnd) {
      setErrorMsg("Please enter both start and end times.");
      return;
    }

    // Prevent saving if the underlying shift turned pending while editing
    const isNowPending = (allShiftsRaw || []).some((raw) => {
      const s = normalizeShift(raw);
      return (
        s.shiftDate === editing.originalKey.date &&
        normalizeHM(s.shiftStartTime || "") === editing.originalKey.start &&
        normalizeHM(s.shiftEndTime || "") === editing.originalKey.end &&
        safeStr(s.shiftRole || "") === editing.originalKey.role &&
        isPending(s)
      );
    });
    if (isNowPending) {
      setErrorMsg("This shift is already pending approval. Please wait for HR to approve/reject before editing again.");
      return;
    }

    const changed =
      newStart !== editing.originalKey.start || newEnd !== editing.originalKey.end;
    if (!changed) {
      setEditing(null);
      return;
    }

    setSaving(true);
    setErrorMsg("");
    try {
      const updated = (allShiftsRaw || []).map((raw) => {
        const s = normalizeShift(raw);
        const match =
          s.shiftDate === editing.originalKey.date &&
          normalizeHM(s.shiftStartTime || "") === editing.originalKey.start &&
          normalizeHM(s.shiftEndTime || "") === editing.originalKey.end &&
          safeStr(s.shiftRole || "") === editing.originalKey.role;

        if (!match) return raw;

        // IMPORTANT: do NOT overwrite live times.
        // Stash the proposed change in `request` and mark pending.
        return {
          ...raw,
          request: {
            shiftStartTime: newStart,
            shiftEndTime: newEnd,
            prevStartTime: s.shiftStartTime ?? null,
            prevEndTime: s.shiftEndTime ?? null,
            requestedAt: Timestamp.now(),
          },
          status: "pending",
        };
      });

      await updateDoc(doc(db, "UsersDetail", userDocId), { shifts: updated });

      // refresh local state
      setAllShiftsRaw(updated);
      setMyWeekShifts(computeWeek(updated));
      setEditing(null);
    } catch (e) {
      console.error("Save edit failed", e);
      setErrorMsg("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-white p-4 md:p-6 lg:p-8 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <h1 className="text-lg sm:text-xl font-semibold">Timesheet</h1>
        <div className="flex items-center justify-between bg-blue-600 text-white py-2 px-3 sm:px-4 rounded-lg">
          <button className="text-lg sm:text-xl px-2" onClick={handlePrevWeek} aria-label="Previous week">←</button>
          <span className="text-sm sm:text-base font-medium">{fmtRange(weekStart, weekEnd)}</span>
          <button className="text-lg sm:text-xl px-2" onClick={handleNextWeek} aria-label="Next week">→</button>
        </div>
      </div>

      {/* Unassigned days */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base sm:text-lg font-semibold">Unassigned days (this week)</h2>
          {loading && <span className="text-sm text-gray-500">Loading…</span>}
        </div>

        {unassignedDays.length === 0 ? (
          <p className="text-sm text-gray-500">You have at least one shift every day this week.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {unassignedDays.map(({ key, date }) => (
              <div key={key} className="border border-gray-200 rounded-xl p-3 bg-white shadow-sm flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{weekdayLabel(date)}</div>
                  <div className="text-xs text-gray-500">{key}</div>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200">No shift</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Assigned list */}
      <section>
        <h2 className="text-base sm:text-lg font-semibold mb-2">My assigned shifts (this week)</h2>

        <div className="overflow-x-auto rounded-lg border border-blue-200">
          <table className="min-w-full text-left">
            <thead>
              <tr className="bg-blue-600 text-white">
                <th className="py-2 px-3 sm:px-4">Date</th>
                <th className="py-2 px-3 sm:px-4">Shift</th>
                <th className="py-2 px-3 sm:px-4">Hours</th>
                <th className="py-2 px-3 sm:px-4">Status</th>
                <th className="py-2 px-3 sm:px-4"></th>
              </tr>
            </thead>
            <tbody>
              {myWeekShifts.length === 0 ? (
                <tr>
                  <td className="py-3 px-3 sm:px-4 text-sm text-gray-500" colSpan={5}>No assigned shifts this week.</td>
                </tr>
              ) : (
                myWeekShifts.map((s, idx) => {
                  const { end, overnight } = parseShiftToRange(s);
                  const startLabel = time12hHM(s.shiftStartTime);
                  const endLabel = end ? `${time12hFromDate(end)}${overnight ? " (+1d)" : ""}` : "";

                  const isEditing = editing?.idxInWeek === idx;

                  return (
                    <tr key={`${s.shiftDate}-${s.shiftStartTime || idx}`} className={idx % 2 === 0 ? "bg-blue-50/40" : "bg-white"}>
                      <td className="py-2 px-3 sm:px-4 align-middle">{s.shiftDate}</td>

                      {/* Shift cell */}
                      <td className="py-2 px-3 sm:px-4">
                        {!isEditing ? (
                          <div className="space-y-1">
                            <div>
                              {(safeStr(s.shiftRole) || "Shift")} • {startLabel}{endLabel ? ` – ${endLabel}` : ""}
                            </div>
                            {/* If pending and we have a request, show the proposed times subtly */}
                            {isPending(s) && s.request && (s.request.shiftStartTime || s.request.shiftEndTime) && (
                              <div className="text-xs text-amber-700">
                                Requested: {time12hHM(s.request.shiftStartTime || s.shiftStartTime)}
                                {s.request.shiftEndTime ? ` – ${time12hHM(s.request.shiftEndTime)}` : ""}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                            <label className="text-xs text-gray-600">Start
                              <input
                                type="time"
                                value={editing.start}
                                onChange={(e) => setEditing((p) => ({ ...p, start: normalizeHM(e.target.value) }))}
                                className="ml-2 border rounded px-2 py-1"
                              />
                            </label>
                            <label className="text-xs text-gray-600">End
                              <input
                                type="time"
                                value={editing.end}
                                onChange={(e) => setEditing((p) => ({ ...p, end: normalizeHM(e.target.value) }))}
                                className="ml-2 border rounded px-2 py-1"
                              />
                            </label>
                          </div>
                        )}
                      </td>

                      {/* Hours */}
                      <td className="py-2 px-3 sm:px-4 align-middle">{shiftHours(s).toFixed(2)} hr</td>

                      {/* Status */}
                      <td className="py-2 px-3 sm:px-4 align-middle">
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            s.status === "approved"
                              ? "bg-green-50 text-green-700 ring-1 ring-green-200"
                              : s.status === "pending"
                              ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                              : "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                          }`}
                        >
                          {s.status ? s.status.charAt(0).toUpperCase() + s.status.slice(1) : "Assigned"}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-3 sm:px-4 align-middle">
                        {!isEditing ? (
                          isPending(s) ? (
                            <span className="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                              Awaiting approval
                            </span>
                          ) : (
                            <button
                              className="text-sm px-3 py-1 rounded-lg bg-white ring-1 ring-blue-300 text-blue-700 hover:bg-blue-50"
                              onClick={() => beginEdit(idx)}
                            >
                              Edit
                            </button>
                          )
                        ) : (
                          <div className="flex gap-2">
                            <button
                              disabled={saving}
                              onClick={saveEdit}
                              className="text-sm px-3 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              {saving ? "Saving..." : "Save"}
                            </button>
                            <button
                              disabled={saving}
                              onClick={cancelEdit}
                              className="text-sm px-3 py-1 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {errorMsg && (
          <div className="mt-3 text-sm text-amber-700 bg-amber-50 ring-1 ring-amber-200 px-3 py-2 rounded">
            {errorMsg}
          </div>
        )}

        <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <p className="text-gray-900 text-sm sm:text-base">
            Total working hours: <span className="font-semibold">{totalHoursDisplay} hr</span>
          </p>
          <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg">
            Submit Timesheet
          </button>
        </div>
      </section>
    </div>
  );
}

/* -------------------- (Optional) Admin helpers -------------------- */
/* If you still need programmatic helpers, keep your approve/revert functions
   on the admin screen. This view only creates `request` + sets `status: "pending"`. */
