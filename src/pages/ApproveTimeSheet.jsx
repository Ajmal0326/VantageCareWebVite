import React from "react";
import { collection, onSnapshot, query, where, doc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { fmtHM, keyOf } from "../utils/shifts";
import { useNavigate } from "react-router-dom";

const ApproveTimeSheet = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = (user?.role || "").toLowerCase();
  const isAdminOrHR = role === "admin" || role === "hr";

  const [staffList, setStaffList] = React.useState([]);
  const [pendingBusy, setPendingBusy] = React.useState(null);

  // guard
  React.useEffect(() => {
    if (!isAdminOrHR) navigate("/dashboard", { replace: true });
  }, [isAdminOrHR, navigate]);

  // live staff stream (only Staff docs)
  React.useEffect(() => {
    if (!isAdminOrHR) return;
    const q = query(collection(db, "UsersDetail"), where("role", "==", "Staff"));
    const unsub = onSnapshot(q, (qs) => {
      const staff = qs.docs.map((d) => ({ id: d.id, ...d.data(), shifts: d.data().shifts || [] }));
      setStaffList(staff);
    });
    return () => unsub();
  }, [isAdminOrHR]);

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
      // notification optional (re-use your SendNotification if you export/import it)
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
          const { request, ...rest } = raw;
          return { ...rest, status: "assigned" };
        }
        return { ...raw, status: "assigned" };
      });

      const text = `Your time change for ${shift.shiftDate} (${shift.shiftRole}) was rejected. Your assigned time remains ${fmtHM(shift.shiftStartTime)}${shift.shiftEndTime ? `–${fmtHM(shift.shiftEndTime)}` : ""}.`;
      await updateDoc(userRef, {
        shifts: updated,
        messages: arrayUnion({ text, from: "HR", sentAt: new Date().toISOString() }),
      });
    } catch (e) {
      console.error("Reject failed:", e);
      alert("Failed to reject request.");
    } finally {
      setPendingBusy(null);
    }
  };

  // derive pending requests
  const pendingRequests = React.useMemo(
    () =>
      staffList.flatMap((staff) =>
        (staff.shifts || [])
          .filter((s) => (s.status || "").toLowerCase() === "pending")
          .map((shift) => ({ staff, shift }))
      ),
    [staffList]
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-xl sm:text-2xl font-semibold mb-4">Time Change Requests</h1>

      {pendingRequests.length === 0 ? (
        <p className="text-gray-600">No pending requests.</p>
      ) : (
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
      )}
    </div>
  );
};

export default ApproveTimeSheet;
