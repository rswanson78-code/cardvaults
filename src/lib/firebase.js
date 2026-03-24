import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDF4GwZrcZcIEkdwbZIXHNlhbxspwSt1ng",
  authDomain: "studio-6132422334-d26a3.firebaseapp.com",
  projectId: "studio-6132422334-d26a3",
  storageBucket: "studio-6132422334-d26a3.firebasestorage.app",
  messagingSenderId: "489557408741",
  appId: "1:489557408741:web:13f0c69cb1d25267af0d0c"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
