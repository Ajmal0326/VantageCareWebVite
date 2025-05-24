import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAOLXbbeulaF0DVYdjw5h7pGODPxmFGJig",
  authDomain: "vantage-care.firebaseapp.com",
  projectId: "vantage-care",
  storageBucket: "vantage-care.firebasestorage.app",
  messagingSenderId: "691756682733",
  appId: "1:691756682733:web:e47914ea2a3bd5d3c02be4",
  measurementId: "G-J4QBDQ94S2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const analytics = getAnalytics(app);