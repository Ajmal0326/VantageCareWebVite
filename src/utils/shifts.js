// src/utils/shifts.js
export const ROLE_DURATION_MIN = {
    morning: 360,
    evening: 360,
    night: 600,
  };
  
  export const fmtHM = (time) => {
    if (!time) return "—";
    const [hour, minute] = String(time).split(":");
    let h = parseInt(hour, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${minute} ${ampm}`;
  };
  
  export const keyOf = (uId, s) =>
    `${uId}:${s.id || `${s.shiftDate}|${s.shiftRole}|${s.shiftStartTime}|${s.shiftEndTime || ""}`}`;
  
  export function parseShiftToDateRange(shift) {
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
  