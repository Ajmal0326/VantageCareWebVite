import { useState } from "react"
import "./Styles/Login.css"
import { auth, db } from '../firebase';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "../context/AuthContext";
import { Eye, EyeOff } from "lucide-react";

const Login = () => {
  const [userID, setUserId] = useState('');
  const [Password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const loginWithUserId = async (userId, password) => {
    setLoading(true);
    try {
      const userRef = doc(db, "UsersDetail", userId);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        throw new Error("User ID does not exist.");
      }


      const { email, role, name } = userSnap.data();

      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      console.log("Logged in user:", userCredential.user);
      setLoading(false);
      login({
        name: name || "No Name",
        role: role || "user",
        userID:userId || "no ID",
        email:email || "no email",
      });
      navigate('/dashboard');
      // alert(`Login successful. Your role is ${role}`);
    } catch (error) {
      console.error("Login failed:", error.message);
      if (error.code === 'auth/invalid-email') {
        alert('Invalid Email: The email address is badly formatted.');
      } else if (error.code === 'auth/user-not-found') {
        alert('User Not Found: No user found with this email.');
      } else if (error.code === 'auth/wrong-password') {
        alert('Wrong Password: The password is incorrect.');
      } else if (error.code === 'auth/invalid-credential') {
        alert('Wrong Password: The password is incorrect.');
      } else {
        alert(`Login Failed: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault()
    loginWithUserId(userID, Password);
  }

  const handleReset = async (e) => {
    e.preventDefault();
    setMessage('');
    if (userID) {
      setLoading(true);
      try {
        const userRef = doc(db, "UsersDetail", userID);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          throw new Error("User ID not found. Enter Correct User ID to reset password");
        }

        const { email } = userSnap.data();

        await sendPasswordResetEmail(auth, email);
        alert("Password reset link sent to your email.");
      } catch (error) {
        setMessage(error.message);
      } finally {
        setLoading(false);
      }
    }
    else {
      alert("Enter User ID to reset Password");
    }
  };

  return (
    <div className="login-container">
      <link href="/dist/styles.css" rel="stylesheet" />
      <div className="login-form">
        <h1 className="login-title">Vantage Care</h1>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <input
              type="text"
              placeholder="Username"
              value={userID}
              onChange={(e) => setUserId(e.target.value)}
              required
            />
          </div>

          <div className="form-group relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={Password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full pr-10"
            />
            <div
              className="absolute inset-y-0 right-3 flex items-center cursor-pointer"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </div>
          </div>

          <div onClick={handleReset} className="forgot-password">
            <span style={{ cursor: 'pointer', color: 'blue' }}>
              Forget password?
            </span>
          </div>

          <button type="submit" className="sign-in-button">
            Sign in
          </button>
        </form>

        {loading && (
          <div className="loader-overlay">
            <div className="loader"></div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Login
