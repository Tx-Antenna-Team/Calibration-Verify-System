// Firebase Configuration — CVS Calibration Verification System
// Project: calibration-verify-system

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey:            "AIzaSyAjxNAgHLp3y0xJq2z1P_4sUNcxrAvMRVk",
  authDomain:        "calibration-verify-system.firebaseapp.com",
  projectId:         "calibration-verify-system",
  storageBucket:     "calibration-verify-system.firebasestorage.app",
  messagingSenderId: "1008225065964",
  appId:             "1:1008225065964:web:fd0c7969362e9a93e1bec9",
  measurementId:     "G-74TE3G3CGL"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// Employee ID → Firebase Auth email (transparent to users)
export const EMAIL_DOMAIN = "@cvs.internal";

export function toEmail(employeeId) {
  return `${employeeId.trim().toUpperCase()}${EMAIL_DOMAIN}`;
}
