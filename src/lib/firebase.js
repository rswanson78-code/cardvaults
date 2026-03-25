import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAsJdsa6swXYDizsww_vw2IRga40UFxUW0",
  authDomain: "project-ae59c54a-4129-454d-bef.firebaseapp.com",
  projectId: "project-ae59c54a-4129-454d-bef",
  storageBucket: "project-ae59c54a-4129-454d-bef.firebasestorage.app",
  messagingSenderId: "1038328432083",
  appId: "1:1038328432083:web:87c68cff88231e6f181b26"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
