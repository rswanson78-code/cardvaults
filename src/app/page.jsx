"use client";
import { useState, useEffect, useRef } from "react";
import { doc, setDoc, onSnapshot, collection, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const GRADING_SCALES = {
  PSA: ["10 Gem Mint","9 Mint","8 NM-MT","7 NM","6 EX-MT","5 EX","4 VG-EX","3 VG","2 Good","1.5 Fair","1 Poor"],
  SGC: ["10 Pristine","9.5 Mint+","9 Mint","8.5 NM-MT+","8 NM-MT","7.5 NM+","7 NM","6.5 EX-NM+","6 EX-NM","5.5 EX+","5 EX","4.5 VG-EX+","4 VG-EX","3.5 VG+","3 VG","2.5 Good+","2 Good","1.5 Fair","1 Poor"],
};
const RAW_CONDITIONS = ["Gem Mint","Mint","Near Mint-Mint","Near Mint","Excellent-Mint","Excellent","Very Good-Excellent","Very Good","Good","Fair","Poor"];
const FOOTBALL_BRANDS = ["Panini","Topps","Upper Deck","Leaf","Sage","SAGE Hit","Wild Card","Press Pass","Other"];
const POKEMON_BRANDS = ["The Pokémon Company","Wizards of the Coast","Other"];
const OTHER_BRANDS = ["Panini","Topps","Upper Deck","Leaf","Fleer","Donruss","Bowman","Other"];
const FOOTBALL_SETS = ["Prizm","Mosaic","Select","Optic","Donruss","Playbook","Spectra","Immaculate","National Treasures","Contenders","Phoenix","Absolute","Chronicles","Score","Prestige","Certified","Crown Royale","Obsidian","Chrome","Bowman Chrome","Stadium Club","Other"];
const POKEMON_SETS = ["Obsidian Flames","Paldea Evolved","Scarlet & Violet","Crown Zenith","Silver Tempest","Lost Origin","Astral Radiance","Brilliant Stars","Fusion Strike","Evolving Skies","Chilling Reign","Battle Styles","Vivid Voltage","Champion's Path","Hidden Fates","Other"];
const OTHER_SETS = ["Chrome","Prizm","Mosaic","Select","Optic","Donruss","Bowman","Topps Series 1","Topps Series 2","Topps Update","Stadium Club","Other"];
const CATEGORIES = ["Football","Pokémon","Basketball","Baseball","Soccer","Hockey","Other"];

const DEFAULT_CARD = {
  id: "", owner: "", category: "Football", playerName: "", brand: "", set: "", variation: "",
  year: new Date().getFullYear().toString(), cardNumber: "", serialNumber: "", isGraded: false,
  gradingCompany: "PSA", grade: "", certNumber: "", rawCondition: "", frontImage: null, backImage: null,
  manualValue: "", notes: "", dateAdded: "",
};

const PROFILE_COLORS = ["#c9a34f","#5b8def","#e0574f","#43b88c","#b06de4","#e8923b","#4dd4d4","#d4699e"];

const STORAGE_KEY = "card-vault-data";
const loadData = () => { try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; } catch { return null; } };
const saveData = (d) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {} };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const fmt = (v) => { const n = parseFloat(v); return isNaN(n) ? "$0.00" : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
const toBase64 = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
const compressImage = (dataUrl, maxW = 800) => new Promise((res) => {
  const img = new Image(); img.onload = () => {
    const c = document.createElement("canvas"); const scale = Math.min(1, maxW / img.width);
    c.width = img.width * scale; c.height = img.height * scale;
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", 0.7));
  }; img.src = dataUrl;
});

const scanCardWithAI = async (frontImg, backImg, category) => {
  try {
    const images = [];
    if (frontImg) { const b = frontImg.split(",")[1]; const m = frontImg.split(";")[0].split(":")[1] || "image/jpeg"; images.push({ type: "image", source: { type: "base64", media_type: m, data: b } }); images.push({ type: "text", text: "Above is the FRONT of the card." }); }
    if (backImg) { const b = backImg.split(",")[1]; const m = backImg.split(";")[0].split(":")[1] || "image/jpeg"; images.push({ type: "image", source: { type: "base64", media_type: m, data: b } }); images.push({ type: "text", text: "Above is the BACK of the card." }); }
    const prompt = `You are an expert ${category === "Pokémon" ? "Pokémon" : "sports"} card identifier. Analyze the card image(s) and extract information. Respond ONLY with a JSON object, no markdown, no backticks:\n{"playerName":"","brand":"","set":"","variation":"","year":"","cardNumber":"","serialNumber":"","estimatedCondition":""}\nIf you cannot determine a field, use empty string. Be specific.`;
    
    const response = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, prompt, images }) });
    if (!response.ok) {
      let errMsg = response.statusText;
      try { const errData = await response.json(); if (errData.error) errMsg = errData.error; } catch(e) {}
      console.error("Backend Error:", response.status, errMsg);
      return { error: errMsg };
    }
    
    const data = await response.json(); 
    let text = data.content?.map(i => i.text || "").join("") || "";
    
    // Robust extraction: find the first { and the last }
    const startIndex = text.indexOf('{');
    const endIndex = text.lastIndexOf('}');
    if (startIndex !== -1 && endIndex !== -1) {
      text = text.substring(startIndex, endIndex + 1);
    } else {
      throw new Error("No JSON format detected in AI response.");
    }
    
    return JSON.parse(text);
  } catch (err) { console.error("AI scan error:", err); return { error: err.message || "Unknown scan error" }; }
};

const I = ({ name, size = 20 }) => {
  const d = {
    sun: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
    moon: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
    plus: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    search: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    edit: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    trash: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
    camera: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
    upload: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>,
    back: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
    x: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    check: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
    ext: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
    cards: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="4" width="14" height="18" rx="2"/><path d="M18 8h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2"/></svg>,
    scan: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
    settings: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    allCards: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  };
  return d[name] || null;
};

const ImageUpload = ({ label, image, onImage, darkMode }) => {
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const handle = async (e) => { const f = e.target.files?.[0]; if (!f) return; const b = await toBase64(f); onImage(await compressImage(b)); };
  const bg = darkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)";
  const bdr = darkMode ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)";
  const btnBg = darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)";
  return (
    <div style={{ border: `2px dashed ${bdr}`, borderRadius: 12, padding: image ? 8 : 24, textAlign: "center", background: bg, position: "relative" }}>
      {image ? (
        <div style={{ position: "relative" }}>
          <img src={image} alt={label} style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8, objectFit: "contain" }} />
          <button onClick={() => onImage(null)} style={{ position: "absolute", top: 4, right: 4, background: "rgba(220,50,50,0.9)", color: "#fff", border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><I name="x" size={14} /></button>
        </div>
      ) : (
        <>
          <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: 14, opacity: 0.7 }}>{label}</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => fileRef.current?.click()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", background: btnBg, color: "inherit", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><I name="upload" size={16} /> Upload</button>
            <button onClick={() => cameraRef.current?.click()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", background: btnBg, color: "inherit", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><I name="camera" size={16} /> Camera</button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handle} style={{ display: "none" }} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handle} style={{ display: "none" }} />
        </>
      )}
    </div>
  );
};

export default function CardVault() {
  const [darkMode, setDarkMode] = useState(true);
  const [view, setView] = useState("home");
  const [activeProfile, setActiveProfile] = useState(null);
  const [profiles, setProfiles] = useState(["Dad", "Son 1", "Son 2"]);
  const [cards, setCards] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [filterCategory, setFilterCategory] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("dateAdded");
  const [cardForm, setCardForm] = useState({ ...DEFAULT_CARD });
  const [scanning, setScanning] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [editingProfile, setEditingProfile] = useState(null);
  const [editProfileName, setEditProfileName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [prevView, setPrevView] = useState("home");

  const isInitialLoad = useRef(true);
  const skipSync = useRef(false);

  useEffect(() => {
    const unsubMeta = onSnapshot(doc(db, "vault", "v1"), (dSnapshot) => {
      if (dSnapshot.exists()) {
        const d = dSnapshot.data();
        skipSync.current = true;
        if (d.profiles) setProfiles(d.profiles);
        if (d.darkMode !== undefined) setDarkMode(d.darkMode);
        
        // Auto-migrate legacy cards array to subcollection
        if (d.cards && d.cards.length > 0) {
          d.cards.forEach(c => {
            setDoc(doc(db, "vault", "v1", "cards", c.id), c).catch(console.error);
          });
          // Remove them from the main doc to free up space
          setDoc(doc(db, "vault", "v1"), { profiles: d.profiles || [], darkMode: d.darkMode !== undefined ? d.darkMode : true }).catch(console.error);
        }
        
        setTimeout(() => { skipSync.current = false; }, 100);
      }
    });

    const unsubCards = onSnapshot(collection(db, "vault", "v1", "cards"), (snapshot) => {
      setCards(snapshot.docs.map(docSnap => docSnap.data()));
    });

    return () => { unsubMeta(); unsubCards(); };
  }, []);

  useEffect(() => {
    if (isInitialLoad.current) { isInitialLoad.current = false; return; }
    if (skipSync.current) return;
    setDoc(doc(db, "vault", "v1"), { profiles, darkMode }).catch(console.error);
  }, [profiles, darkMode]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };
  const getBrands = (cat) => cat === "Pokémon" ? POKEMON_BRANDS : cat === "Football" ? FOOTBALL_BRANDS : OTHER_BRANDS;
  const getSets = (cat) => cat === "Pokémon" ? POKEMON_SETS : cat === "Football" ? FOOTBALL_SETS : OTHER_SETS;
  const updateForm = (k, v) => setCardForm(p => ({ ...p, [k]: v }));
  const profileColor = (name) => PROFILE_COLORS[profiles.indexOf(name) % PROFILE_COLORS.length];

  const goBack = () => {
    if (view === "cardDetail" || view === "addCard" || view === "editCard") {
      setCardForm({ ...DEFAULT_CARD }); setDeleteConfirm(null);
      if (activeProfile) setView("profile"); else if (prevView === "allCards") setView("allCards"); else setView("home");
    } else if (view === "profile" || view === "allCards" || view === "manageProfiles") {
      setView("home"); setActiveProfile(null); setFilterCategory("All"); setSearchTerm("");
    } else { setView("home"); }
  };

  const openProfile = (name) => { setActiveProfile(name); setFilterCategory("All"); setSearchTerm(""); setSortBy("dateAdded"); setView("profile"); };
  const openAllCards = () => { setActiveProfile(null); setFilterCategory("All"); setSearchTerm(""); setSortBy("dateAdded"); setPrevView("allCards"); setView("allCards"); };
  const openDetail = (card) => { setSelectedCard(card); setPrevView(view); setView("cardDetail"); };
  const openEdit = (card) => { setCardForm({ ...card }); setView("editCard"); };
  const openAddCard = (owner) => { setCardForm({ ...DEFAULT_CARD, owner: owner || "" }); setView("addCard"); };

  const handleScan = async () => {
    if (!cardForm.frontImage && !cardForm.backImage) { showToast("Upload at least one image to scan"); return; }
    setScanning(true);
    const result = await scanCardWithAI(cardForm.frontImage, cardForm.backImage, cardForm.category);
    setScanning(false);
    
    if (result && result.error) {
      showToast(`Scan failed: ${result.error}`);
    } else if (result) {
      setCardForm(p => ({ ...p, playerName: result.playerName || p.playerName, brand: result.brand || p.brand, set: result.set || p.set, variation: result.variation || p.variation, year: result.year || p.year, cardNumber: result.cardNumber || p.cardNumber, serialNumber: result.serialNumber || p.serialNumber, rawCondition: result.estimatedCondition || p.rawCondition }));
      showToast("Card scanned! Review the details below.");
    } else { 
      showToast("Scan failed — fill in details manually."); 
    }
  };

  const handleSaveCard = async () => {
    if (!cardForm.playerName.trim()) { showToast("Player/Character name is required"); return; }
    if (!cardForm.owner) { showToast("Please select an owner"); return; }
    
    const cardData = cardForm.id ? { ...cardForm } : { ...cardForm, id: uid(), dateAdded: new Date().toISOString() };
    
    if (cardForm.id) { setCards(p => p.map(c => c.id === cardData.id ? cardData : c)); showToast("Card updated!"); }
    else { setCards(p => [cardData, ...p]); showToast("Card added to the vault!"); }
    
    setCardForm({ ...DEFAULT_CARD });
    if (activeProfile) setView("profile"); else setView("home");
    
    try {
      await setDoc(doc(db, "vault", "v1", "cards", cardData.id), cardData);
    } catch (err) {
      console.error("Error saving card to cloud:", err);
      showToast("Error saving card to cloud!");
    }
  };

  const handleDeleteCard = async (id) => {
    setCards(p => p.filter(c => c.id !== id)); setDeleteConfirm(null);
    if (activeProfile) setView("profile"); else setView("home"); showToast("Card removed.");
    
    try {
      await deleteDoc(doc(db, "vault", "v1", "cards", id));
    } catch (err) {
      console.error("Error deleting card:", err);
    }
  };

  const handleRenameProfile = (index, oldName, newName) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setProfiles(pr => pr.map((pp, ii) => (ii === index ? trimmed : pp)));
    setCards(pr => pr.map(c => {
      if (c.owner === oldName) {
        const nc = { ...c, owner: trimmed };
        setDoc(doc(db, "vault", "v1", "cards", nc.id), nc).catch(console.error);
        return nc;
      }
      return c;
    }));
    setEditingProfile(null);
  };

  const getValueUrl = (card, src) => {
    const q = [card.playerName, card.brand, card.set, card.variation, card.year, card.serialNumber ? `/${card.serialNumber}` : "", card.isGraded ? `${card.gradingCompany} ${card.grade}` : ""].filter(Boolean).join(" ").trim();
    if (src === "ebay") return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Complete=1&LH_Sold=1&_sop=13`;
    return `https://130point.com/sales/?search=${encodeURIComponent(q)}`;
  };

  const contextCards = (activeProfile ? cards.filter(c => c.owner === activeProfile) : cards)
    .filter(c => { if (filterCategory !== "All" && c.category !== filterCategory) return false; if (searchTerm) { const s = searchTerm.toLowerCase(); return [c.playerName, c.brand, c.set, c.variation, c.year, c.notes].some(f => (f || "").toLowerCase().includes(s)); } return true; })
    .sort((a, b) => { if (sortBy === "dateAdded") return new Date(b.dateAdded) - new Date(a.dateAdded); if (sortBy === "name") return (a.playerName || "").localeCompare(b.playerName || ""); if (sortBy === "value") return (parseFloat(b.manualValue) || 0) - (parseFloat(a.manualValue) || 0); if (sortBy === "year") return (b.year || "").localeCompare(a.year || ""); return 0; });

  const totalValue = cards.reduce((s, c) => s + (parseFloat(c.manualValue) || 0), 0);
  const getOwnerStats = (name) => { const oc = cards.filter(c => c.owner === name); return { count: oc.length, value: oc.reduce((s, c) => s + (parseFloat(c.manualValue) || 0), 0), categories: [...new Set(oc.map(c => c.category))] }; };

  const t = {
    bg: darkMode ? "#0f1117" : "#f4f2ef", surface: darkMode ? "#1a1d27" : "#ffffff",
    border: darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    text: darkMode ? "#e8e6e3" : "#1a1a1a", textMuted: darkMode ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)",
    accent: "#c9a34f", accentBg: darkMode ? "rgba(201,163,79,0.12)" : "rgba(201,163,79,0.08)",
    danger: "#d94444", green: "#3aad5f",
  };
  const btnP = { padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer", background: t.accent, color: "#000", fontWeight: 700, fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6, transition: "all 0.2s" };
  const btnS = { padding: "10px 20px", borderRadius: 10, border: `1px solid ${t.border}`, cursor: "pointer", background: "transparent", color: t.text, fontWeight: 600, fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6, transition: "all 0.2s" };
  const inp = { width: "100%", padding: "10px 14px", borderRadius: 10, fontSize: 14, border: `1px solid ${t.border}`, background: darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)", color: t.text, outline: "none", boxSizing: "border-box" };
  const lbl = { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.05em" };
  const chip = (a) => ({ padding: "6px 14px", borderRadius: 20, border: `1px solid ${a ? t.accent : t.border}`, background: a ? t.accentBg : "transparent", color: a ? t.accent : t.textMuted, cursor: "pointer", fontSize: 13, fontWeight: a ? 700 : 500, whiteSpace: "nowrap" });

  const CardGrid = ({ cardList, emptyMsg }) => (
    cardList.length === 0 ? (
      <div style={{ textAlign: "center", padding: "50px 20px", opacity: 0.4 }}><I name="cards" size={44} /><p style={{ marginTop: 10, fontSize: 15, fontWeight: 500 }}>{emptyMsg}</p></div>
    ) : (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {cardList.map(card => (
          <div key={card.id} onClick={() => openDetail(card)} style={{ background: t.surface, borderRadius: 14, border: `1px solid ${t.border}`, overflow: "hidden", cursor: "pointer" }}>
            {card.frontImage ? (
              <div style={{ height: 170, overflow: "hidden", background: darkMode ? "#111" : "#eee", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <img src={card.frontImage} alt={card.playerName} style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} />
              </div>
            ) : (
              <div style={{ height: 70, display: "flex", alignItems: "center", justifyContent: "center", background: t.accentBg }}><I name="cards" size={28} /></div>
            )}
            <div style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.playerName}</div>
                  <div style={{ fontSize: 12, opacity: 0.5, marginTop: 2 }}>{[card.year, card.brand, card.set].filter(Boolean).join(" · ")}</div>
                </div>
                {card.manualValue && <div style={{ background: t.accentBg, color: t.accent, padding: "3px 9px", borderRadius: 8, fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", flexShrink: 0 }}>{fmt(card.manualValue)}</div>}
              </div>
              {card.variation && <div style={{ fontSize: 12, color: t.accent, fontWeight: 600, marginTop: 4 }}>{card.variation}</div>}
              <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: t.accentBg, color: t.textMuted, fontWeight: 600 }}>{card.category}</span>
                {!activeProfile && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: `${profileColor(card.owner)}22`, color: profileColor(card.owner), fontWeight: 600 }}>{card.owner}</span>}
                {card.isGraded && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "rgba(58,173,95,0.15)", color: t.green, fontWeight: 600 }}>{card.gradingCompany} {card.grade}</span>}
                {card.serialNumber && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "rgba(217,68,68,0.12)", color: "#e86464", fontWeight: 600 }}>#{card.serialNumber}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  );

  const FilterBar = () => (
    <>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180, position: "relative" }}>
          <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.4 }}><I name="search" size={16} /></div>
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search cards..." style={{ ...inp, paddingLeft: 36 }} />
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...inp, width: "auto", minWidth: 130, cursor: "pointer" }}>
          <option value="dateAdded">Newest First</option><option value="name">Name A-Z</option><option value="value">Highest Value</option><option value="year">Year</option>
        </select>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        <button onClick={() => setFilterCategory("All")} style={chip(filterCategory === "All")}>All Types</button>
        {CATEGORIES.map(c => <button key={c} onClick={() => setFilterCategory(c)} style={chip(filterCategory === c)}>{c}</button>)}
      </div>
    </>
  );

  const CardForm = ({ isEdit }) => (
    <div style={{ animation: "fadeIn 0.4s ease", paddingTop: 20 }}>
      <h2 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 800 }}>{isEdit ? "Edit Card" : "Add New Card"}{activeProfile && !isEdit ? ` — ${activeProfile}` : ""}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        <ImageUpload label="Front of Card" image={cardForm.frontImage} onImage={img => updateForm("frontImage", img)} darkMode={darkMode} />
        <ImageUpload label="Back of Card" image={cardForm.backImage} onImage={img => updateForm("backImage", img)} darkMode={darkMode} />
      </div>
      <button onClick={handleScan} disabled={scanning || (!cardForm.frontImage && !cardForm.backImage)} style={{ ...btnP, width: "100%", justifyContent: "center", marginBottom: 20, padding: "14px 20px", opacity: scanning || (!cardForm.frontImage && !cardForm.backImage) ? 0.5 : 1, borderRadius: 14, background: scanning ? t.textMuted : t.accent }}>
        <I name="scan" size={18} /> {scanning ? "Scanning Card..." : "AI Scan Card Details"}
      </button>
      {scanning && <div style={{ textAlign: "center", padding: "0 0 16px", fontSize: 13, opacity: 0.5 }}>Analyzing with AI vision — a few seconds...</div>}
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label style={lbl}>Owner *</label><select value={cardForm.owner} onChange={e => updateForm("owner", e.target.value)} style={{ ...inp, cursor: "pointer" }}><option value="">Select owner...</option>{profiles.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
          <div><label style={lbl}>Category</label><select value={cardForm.category} onChange={e => updateForm("category", e.target.value)} style={{ ...inp, cursor: "pointer" }}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
        </div>
        <div><label style={lbl}>{cardForm.category === "Pokémon" ? "Pokémon Name *" : "Player Name *"}</label><input value={cardForm.playerName} onChange={e => updateForm("playerName", e.target.value)} placeholder={cardForm.category === "Pokémon" ? "e.g. Charizard" : "e.g. Patrick Mahomes"} style={inp} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label style={lbl}>Brand</label><input list="brand-options" value={cardForm.brand} onChange={e => updateForm("brand", e.target.value)} placeholder="Select or type new..." style={{ ...inp }} /><datalist id="brand-options">{getBrands(cardForm.category).map(b => <option key={b} value={b} />)}</datalist></div>
          <div><label style={lbl}>Set</label><input list="set-options" value={cardForm.set} onChange={e => updateForm("set", e.target.value)} placeholder="Select or type new..." style={{ ...inp }} /><datalist id="set-options">{getSets(cardForm.category).map(s => <option key={s} value={s} />)}</datalist></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label style={lbl}>Variation / Parallel</label><input value={cardForm.variation} onChange={e => updateForm("variation", e.target.value)} placeholder="e.g. Silver, Green Pulsar" style={inp} /></div>
          <div><label style={lbl}>Year</label><input value={cardForm.year} onChange={e => updateForm("year", e.target.value)} placeholder="e.g. 2024" style={inp} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label style={lbl}>Card Number</label><input value={cardForm.cardNumber} onChange={e => updateForm("cardNumber", e.target.value)} placeholder="e.g. 101" style={inp} /></div>
          <div><label style={lbl}>Serial Number</label><input value={cardForm.serialNumber} onChange={e => updateForm("serialNumber", e.target.value)} placeholder="e.g. 1/25" style={inp} /></div>
        </div>
        <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, fontWeight: 600, marginBottom: cardForm.isGraded ? 14 : 0 }}>
            <input type="checkbox" checked={cardForm.isGraded} onChange={e => updateForm("isGraded", e.target.checked)} style={{ width: 18, height: 18, accentColor: t.accent, cursor: "pointer" }} /> Professionally Graded
          </label>
          {cardForm.isGraded ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div><label style={lbl}>Company</label><select value={cardForm.gradingCompany} onChange={e => updateForm("gradingCompany", e.target.value)} style={{ ...inp, cursor: "pointer" }}><option value="PSA">PSA</option><option value="SGC">SGC</option></select></div>
              <div><label style={lbl}>Grade</label><select value={cardForm.grade} onChange={e => updateForm("grade", e.target.value)} style={{ ...inp, cursor: "pointer" }}><option value="">Select...</option>{GRADING_SCALES[cardForm.gradingCompany]?.map(g => <option key={g} value={g}>{g}</option>)}</select></div>
              <div><label style={lbl}>Cert #</label><input value={cardForm.certNumber} onChange={e => updateForm("certNumber", e.target.value)} placeholder="Cert number" style={inp} /></div>
            </div>
          ) : (
            <div style={{ marginTop: 10 }}><label style={lbl}>Estimated Condition (Raw)</label><select value={cardForm.rawCondition} onChange={e => updateForm("rawCondition", e.target.value)} style={{ ...inp, cursor: "pointer" }}><option value="">Select...</option>{RAW_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          )}
        </div>
        <div><label style={lbl}>Manual Value ($)</label><input type="number" step="0.01" value={cardForm.manualValue} onChange={e => updateForm("manualValue", e.target.value)} placeholder="Enter estimated value" style={inp} /></div>
        <div><label style={lbl}>Notes</label><textarea value={cardForm.notes} onChange={e => updateForm("notes", e.target.value)} placeholder="Any notes..." rows={3} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} /></div>
        <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: 16 }}>
          <label style={{ ...lbl, marginBottom: 10 }}>Lookup Market Value</label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href={getValueUrl(cardForm, "ebay")} target="_blank" rel="noopener noreferrer" style={{ ...btnS, textDecoration: "none", color: t.text }}><I name="ext" size={14} /> eBay Sold</a>
            <a href={getValueUrl(cardForm, "130point")} target="_blank" rel="noopener noreferrer" style={{ ...btnS, textDecoration: "none", color: t.text }}><I name="ext" size={14} /> 130point</a>
          </div>
          <p style={{ fontSize: 12, opacity: 0.4, marginTop: 8, marginBottom: 0 }}>Opens in new tab — enter value above after checking.</p>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button onClick={handleSaveCard} style={{ ...btnP, flex: 1, justifyContent: "center", padding: "14px 20px", borderRadius: 14 }}><I name="check" size={18} /> {isEdit ? "Save Changes" : "Add to Vault"}</button>
          <button onClick={goBack} style={{ ...btnS, borderRadius: 14 }}>Cancel</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Outfit', 'DM Sans', sans-serif", background: t.bg, color: t.text, minHeight: "100vh", transition: "all 0.3s ease" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
      {toast && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: t.surface, color: t.text, padding: "12px 24px", borderRadius: 12, border: `1px solid ${t.accent}`, boxShadow: "0 8px 32px rgba(0,0,0,0.3)", fontSize: 14, fontWeight: 600, animation: "fadeIn 0.3s ease" }}>{toast}</div>}

      {/* Header */}
      <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${t.border}`, background: t.surface, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {view !== "home" && <button onClick={goBack} style={{ ...btnS, padding: "6px 10px", border: "none" }}><I name="back" size={20} /></button>}
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", cursor: "pointer" }} onClick={() => { setView("home"); setActiveProfile(null); }}>
            <span style={{ color: t.accent }}>THE</span> CARD VAULT
          </h1>
          {activeProfile && (view === "profile" || view === "addCard" || view === "editCard") && <span style={{ fontSize: 14, opacity: 0.5, fontWeight: 500 }}>/ {activeProfile}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => setDarkMode(!darkMode)} style={{ ...btnS, padding: 8, border: "none" }}><I name={darkMode ? "sun" : "moon"} size={18} /></button>
          <button onClick={() => setView("manageProfiles")} style={{ ...btnS, padding: 8, border: "none" }}><I name="settings" size={18} /></button>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 16px 100px" }}>

        {/* â•â•â• HOME â•â•â• */}
        {view === "home" && (
          <div style={{ animation: "fadeIn 0.4s ease" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, margin: "20px 0" }}>
              <div style={{ background: t.surface, borderRadius: 14, padding: "16px 18px", border: `1px solid ${t.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Cards</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: t.accent, marginTop: 2 }}>{cards.length}</div>
              </div>
              <div style={{ background: t.surface, borderRadius: 14, padding: "16px 18px", border: `1px solid ${t.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Value</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: t.green, marginTop: 2 }}>{fmt(totalValue)}</div>
              </div>
            </div>

            <h2 style={{ margin: "28px 0 14px", fontSize: 17, fontWeight: 700, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.04em" }}>Collectors</h2>
            <div style={{ display: "grid", gap: 12 }}>
              {profiles.map(name => {
                const stats = getOwnerStats(name);
                const color = profileColor(name);
                const recent = cards.filter(c => c.owner === name).sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded)).slice(0, 4);
                return (
                  <div key={name} onClick={() => openProfile(name)} style={{ background: t.surface, borderRadius: 16, border: `1px solid ${t.border}`, padding: 20, cursor: "pointer", transition: "all 0.2s", borderLeft: `4px solid ${color}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: recent.length > 0 ? 12 : 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 12, background: `${color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color }}>{name.charAt(0).toUpperCase()}</div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 18 }}>{name}</div>
                          <div style={{ fontSize: 13, opacity: 0.5 }}>{stats.count} card{stats.count !== 1 ? "s" : ""}{stats.categories.length > 0 && ` · ${stats.categories.join(", ")}`}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: t.green }}>{fmt(stats.value)}</div>
                        <div style={{ fontSize: 11, opacity: 0.4, textTransform: "uppercase", fontWeight: 600 }}>Value</div>
                      </div>
                    </div>
                    {recent.length > 0 && (
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        {recent.map(c => (
                          <div key={c.id} style={{ width: 52, height: 72, borderRadius: 8, overflow: "hidden", background: darkMode ? "#111" : "#eee", border: `1px solid ${t.border}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {c.frontImage ? <img src={c.frontImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <I name="cards" size={16} />}
                          </div>
                        ))}
                        {stats.count > 4 && <div style={{ width: 52, height: 72, borderRadius: 8, background: t.accentBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: t.accent, flexShrink: 0 }}>+{stats.count - 4}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 20 }}>
              <button onClick={openAllCards} style={{ ...btnS, justifyContent: "center", padding: "16px", borderRadius: 14, fontSize: 15 }}><I name="allCards" size={18} /> All Cards</button>
              <button onClick={() => openAddCard("")} style={{ ...btnP, justifyContent: "center", padding: "16px", borderRadius: 14, fontSize: 15 }}><I name="plus" size={18} /> Add Card</button>
            </div>
          </div>
        )}

        {/* â•â•â• PROFILE PAGE â•â•â• */}
        {view === "profile" && activeProfile && (() => {
          const stats = getOwnerStats(activeProfile);
          const color = profileColor(activeProfile);
          return (
            <div style={{ animation: "fadeIn 0.4s ease" }}>
              <div style={{ background: t.surface, borderRadius: 16, border: `1px solid ${t.border}`, padding: 20, marginTop: 20, borderLeft: `4px solid ${color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 50, height: 50, borderRadius: 14, background: `${color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, color }}>{activeProfile.charAt(0).toUpperCase()}</div>
                    <div><div style={{ fontWeight: 800, fontSize: 22 }}>{activeProfile}</div><div style={{ fontSize: 13, opacity: 0.5 }}>{stats.count} card{stats.count !== 1 ? "s" : ""} in collection</div></div>
                  </div>
                  <div style={{ textAlign: "right" }}><div style={{ fontSize: 26, fontWeight: 800, color: t.green }}>{fmt(stats.value)}</div><div style={{ fontSize: 11, opacity: 0.4, textTransform: "uppercase", fontWeight: 600 }}>Collection Value</div></div>
                </div>
                {stats.categories.length > 0 && (
                  <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                    {CATEGORIES.map(cat => { const n = cards.filter(c => c.owner === activeProfile && c.category === cat).length; if (!n) return null; return <span key={cat} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 8, background: t.accentBg, color: t.textMuted, fontWeight: 600 }}>{cat}: {n}</span>; })}
                  </div>
                )}
              </div>
              <button onClick={() => openAddCard(activeProfile)} style={{ ...btnP, width: "100%", justifyContent: "center", padding: "14px 20px", fontSize: 15, marginTop: 16, marginBottom: 16, borderRadius: 14 }}><I name="plus" size={18} /> Add Card for {activeProfile}</button>
              {FilterBar()}
              {CardGrid({ cardList: contextCards, emptyMsg: `${activeProfile} hasn't added any cards yet.` })}
            </div>
          );
        })()}

        {/* â•â•â• ALL CARDS â•â•â• */}
        {view === "allCards" && (
          <div style={{ animation: "fadeIn 0.4s ease", paddingTop: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>All Cards ({cards.length})</h2>
              <button onClick={() => openAddCard("")} style={btnP}><I name="plus" size={16} /> Add Card</button>
            </div>
            {FilterBar()}
            {CardGrid({ cardList: contextCards, emptyMsg: "No cards match your filters." })}
          </div>
        )}

        {view === "addCard" && CardForm({ isEdit: false })}
        {view === "editCard" && CardForm({ isEdit: true })}

        {/* â•â•â• CARD DETAIL â•â•â• */}
        {view === "cardDetail" && selectedCard && (
          <div style={{ animation: "fadeIn 0.4s ease", paddingTop: 20 }}>
            {(selectedCard.frontImage || selectedCard.backImage) && (
              <div style={{ display: "flex", gap: 12, marginBottom: 20, justifyContent: "center", flexWrap: "wrap" }}>
                {selectedCard.frontImage && <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${t.border}`, maxWidth: 300 }}><img src={selectedCard.frontImage} alt="Front" style={{ width: "100%", display: "block" }} /></div>}
                {selectedCard.backImage && <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${t.border}`, maxWidth: 300 }}><img src={selectedCard.backImage} alt="Back" style={{ width: "100%", display: "block" }} /></div>}
              </div>
            )}
            <div style={{ background: t.surface, borderRadius: 14, border: `1px solid ${t.border}`, padding: 20, marginBottom: 16, borderLeft: `4px solid ${profileColor(selectedCard.owner)}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div><h2 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{selectedCard.playerName}</h2><div style={{ fontSize: 14, opacity: 0.5, marginTop: 4 }}>{[selectedCard.year, selectedCard.brand, selectedCard.set].filter(Boolean).join(" · ")}</div></div>
                {selectedCard.manualValue && <div style={{ background: t.accentBg, color: t.accent, padding: "8px 16px", borderRadius: 10, fontWeight: 800, fontSize: 22 }}>{fmt(selectedCard.manualValue)}</div>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16, marginTop: 20 }}>
                {[["Owner", selectedCard.owner], ["Category", selectedCard.category], ["Variation", selectedCard.variation], ["Card #", selectedCard.cardNumber], ["Serial #", selectedCard.serialNumber], ["Condition", selectedCard.isGraded ? `${selectedCard.gradingCompany} ${selectedCard.grade}` : selectedCard.rawCondition], selectedCard.isGraded ? ["Cert #", selectedCard.certNumber] : null, ["Added", selectedCard.dateAdded ? new Date(selectedCard.dateAdded).toLocaleDateString() : ""]].filter(Boolean).filter(([, v]) => v).map(([l, v]) => (
                  <div key={l}><div style={{ fontSize: 11, fontWeight: 600, opacity: 0.4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</div><div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{v}</div></div>
                ))}
              </div>
              {selectedCard.notes && <div style={{ marginTop: 16, padding: 12, background: darkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", borderRadius: 10 }}><div style={{ fontSize: 11, fontWeight: 600, opacity: 0.4, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Notes</div><div style={{ fontSize: 14, opacity: 0.8 }}>{selectedCard.notes}</div></div>}
            </div>
            <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
              <label style={{ ...lbl, marginBottom: 10 }}>Lookup Current Market Value</label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <a href={getValueUrl(selectedCard, "ebay")} target="_blank" rel="noopener noreferrer" style={{ ...btnS, textDecoration: "none", color: t.text }}><I name="ext" size={14} /> eBay Sold</a>
                <a href={getValueUrl(selectedCard, "130point")} target="_blank" rel="noopener noreferrer" style={{ ...btnS, textDecoration: "none", color: t.text }}><I name="ext" size={14} /> 130point</a>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => openEdit(selectedCard)} style={{ ...btnP, flex: 1, justifyContent: "center", borderRadius: 14 }}><I name="edit" size={16} /> Edit Card</button>
              {deleteConfirm === selectedCard.id ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => handleDeleteCard(selectedCard.id)} style={{ ...btnS, color: t.danger, borderColor: t.danger, borderRadius: 14 }}>Confirm Delete</button>
                  <button onClick={() => setDeleteConfirm(null)} style={{ ...btnS, borderRadius: 14 }}>Cancel</button>
                </div>
              ) : <button onClick={() => setDeleteConfirm(selectedCard.id)} style={{ ...btnS, color: t.danger, borderRadius: 14 }}><I name="trash" size={16} /></button>}
            </div>
          </div>
        )}

        {/* â•â•â• MANAGE PROFILES â•â•â• */}
        {view === "manageProfiles" && (
          <div style={{ animation: "fadeIn 0.4s ease", paddingTop: 20 }}>
            <h2 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 800 }}>Manage Collectors</h2>
            {profiles.map((p, i) => {
              const color = profileColor(p); const count = cards.filter(c => c.owner === p).length;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: t.surface, borderRadius: 12, border: `1px solid ${t.border}`, marginBottom: 10, borderLeft: `3px solid ${color}` }}>
                  {editingProfile === i ? (
                    <>
                      <input value={editProfileName} onChange={e => setEditProfileName(e.target.value)} style={{ ...inp, flex: 1 }} autoFocus onKeyDown={e => { if (e.key === "Enter") handleRenameProfile(i, profiles[i], editProfileName); }} />
                      <button onClick={() => handleRenameProfile(i, profiles[i], editProfileName)} style={{ ...btnP, padding: "6px 12px" }}><I name="check" size={16} /></button>
                      <button onClick={() => setEditingProfile(null)} style={{ ...btnS, padding: "6px 12px" }}><I name="x" size={16} /></button>
                    </>
                  ) : (
                    <>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color, flexShrink: 0 }}>{p.charAt(0).toUpperCase()}</div>
                      <div style={{ flex: 1, fontWeight: 600 }}>{p}</div>
                      <span style={{ fontSize: 12, opacity: 0.4 }}>{count} cards</span>
                      <button onClick={() => { setEditingProfile(i); setEditProfileName(p); }} style={{ ...btnS, padding: "6px 10px", border: "none" }}><I name="edit" size={16} /></button>
                      <button onClick={() => { if (count > 0) showToast(`Remove all of ${p}'s cards first`); else setProfiles(pr => pr.filter((_, ii) => ii !== i)); }} style={{ ...btnS, padding: "6px 10px", border: "none", color: t.danger }}><I name="trash" size={16} /></button>
                    </>
                  )}
                </div>
              );
            })}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <input value={newProfileName} onChange={e => setNewProfileName(e.target.value)} placeholder="New collector name..." style={{ ...inp, flex: 1 }} onKeyDown={e => { if (e.key === "Enter" && newProfileName.trim()) { setProfiles(p => [...p, newProfileName.trim()]); setNewProfileName(""); } }} />
              <button onClick={() => { if (newProfileName.trim()) { setProfiles(p => [...p, newProfileName.trim()]); setNewProfileName(""); } }} style={btnP}><I name="plus" size={16} /> Add</button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        select { appearance: auto; }
        option { background: ${t.surface}; color: ${t.text}; }
        input:focus, select:focus, textarea:focus { border-color: ${t.accent} !important; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.3); border-radius: 3px; }
      `}</style>
    </div>
  );
}


