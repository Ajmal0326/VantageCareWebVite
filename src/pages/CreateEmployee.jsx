// src/pages/CreateEmployee.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  collection,
  where,
  getDocs,
  query as fsQuery,
} from "firebase/firestore";
import { getApp, initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";

const ROLE_OPTIONS = ["Staff", "HR", "Admin"];
const DEFAULT_WEEKLY_CAP_HOURS = 38;
const ID_OK = /^[A-Za-z0-9_-]{3,64}$/; // allowed chars for doc id

const CreateEmployee = () => {
  const navigate = useNavigate();

  // form
  const [userId, setUserId] = useState(""); // Firestore doc id
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Staff");
  const [weeklyCap, setWeeklyCap] = useState(String(DEFAULT_WEEKLY_CAP_HOURS));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // ui
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const validate = () => {
    if (!userId.trim()) return "User ID is required.";
    if (!ID_OK.test(userId.trim()))
      return "User ID must be 3–64 chars: letters, numbers, - or _ only.";
    if (!name.trim()) return "Name is required.";
    if (!email.trim()) return "Email is required.";
    const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!okEmail) return "Please enter a valid email.";
    if (!ROLE_OPTIONS.includes(role)) return "Role must be Staff, HR, or Admin.";
    const cap = Number(weeklyCap);
    if (!Number.isFinite(cap) || cap <= 0) return "Weekly cap must be a positive number.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    if (password !== confirm) return "Password and confirmation do not match.";
    return "";
  };

  const handleCreate = async () => {
    setError("");
    const v = validate();
    if (v) return setError(v);
    setSaving(true);

    let secondary;
    try {
      const id = userId.trim();

      // 1) ensure doc id not taken
      const existing = await getDoc(doc(db, "UsersDetail", id));
      if (existing.exists()) {
        setSaving(false);
        return setError("This User ID already exists. Choose a different one.");
      }

      // 2) optional: duplicate-email guard in Firestore
      const dup = await getDocs(
        fsQuery(collection(db, "UsersDetail"), where("email", "==", email.trim()))
      );
      if (!dup.empty) {
        setSaving(false);
        return setError("An employee with this email already exists in Firestore.");
      }

      // 3) create Auth user via a SECONDARY app (keeps current admin signed in)
      const primary = getApp();
      const secondaryName = `secondary-${Date.now()}`;
      secondary = initializeApp(primary.options, secondaryName);
      const sAuth = getAuth(secondary);
      const cred = await createUserWithEmailAndPassword(sAuth, email.trim(), password);
      const authUid = cred.user.uid;

      // 4) write Firestore document (no phone/FCM fields)
      await setDoc(doc(db, "UsersDetail", id), {
        uid: authUid,                 // auth uid reference
        userId: id,                   // store your chosen doc id as a field too
        name: name.trim(),
        email: email.trim(),
        role,
        weeklyHourCap: Number(weeklyCap) || DEFAULT_WEEKLY_CAP_HOURS,
        shifts: [],
        messages: [],
        lastShiftCreatedAt: null,
        active: true,
        createdAt: serverTimestamp(),
        lastLoginAt: null,
      });

      alert("Employee created (Auth user + Firestore doc).");
      navigate("/employees");
    } catch (e) {
      const msg =
        e?.code === "auth/email-already-in-use"
          ? "This email already exists in Firebase Authentication."
          : e?.message || "Failed to create employee.";
      console.error("Create employee failed:", e);
      setError(msg);
    } finally {
      if (secondary) {
        try { await deleteApp(secondary); } catch {}
      }
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-xl sm:text-2xl font-semibold mb-4">Create New Employee</h1>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 w-full max-w-xl">
        {error && (
          <div className="mb-3 p-2 bg-red-50 text-red-700 rounded border border-red-200">
            {error}
          </div>
        )}

        {/* User ID (document id) */}
        <label className="block mb-3">
          <span className="text-sm text-gray-700">User ID (document id)</span>
          <input
            type="text"
            className="block w-full p-2 mt-1 border rounded"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="e.g., Vicky001"
          />
          <p className="text-xs text-gray-500 mt-1">
            Allowed: letters, numbers, dash (-), underscore (_). This becomes
            <code className="ml-1">UsersDetail/&lt;UserID&gt;</code>.
          </p>
        </label>

        {/* Name */}
        <label className="block mb-3">
          <span className="text-sm text-gray-700">Full name</span>
          <input
            type="text"
            className="block w-full p-2 mt-1 border rounded"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
          />
        </label>

        {/* Email */}
        <label className="block mb-3">
          <span className="text-sm text-gray-700">Email</span>
          <input
            type="email"
            className="block w-full p-2 mt-1 border rounded"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-gray-700">Role</span>
            <select
              className="block w-full p-2 mt-1 border rounded bg-white"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm text-gray-700">Weekly Hour Cap</span>
            <input
              type="number"
              min="1"
              className="block w-full p-2 mt-1 border rounded"
              value={weeklyCap}
              onChange={(e) => setWeeklyCap(e.target.value)}
              placeholder={String(DEFAULT_WEEKLY_CAP_HOURS)}
            />
          </label>
        </div>

        {/* Passwords */}
        <div className="mt-4 border-t pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-gray-700">Password</span>
            <input
              type="password"
              className="block w-full p-2 mt-1 border rounded"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
            />
          </label>
          <label className="block">
            <span className="text-sm text-gray-700">Confirm Password</span>
            <input
              type="password"
              className="block w-full p-2 mt-1 border rounded"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            className="px-4 py-2 bg-gray-400 text-white rounded"
            onClick={() => navigate(-1)}
          >
            Cancel
          </button>
          <button
            className={`px-4 py-2 rounded text-white ${
              saving ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600"
            }`}
            onClick={handleCreate}
            disabled={saving}
          >
            {saving ? "Creating..." : "Create Employee"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateEmployee;
