import { useState, useEffect } from "react";
import { 
  Play, 
  Settings, 
  History, 
  CheckCircle2, 
  AlertCircle, 
  Github, 
  Youtube, 
  Instagram, 
  Facebook,
  RefreshCw,
  Terminal,
  LogOut,
  User as UserIcon,
  ShieldCheck,
  Clock,
  Layers,
  ShieldAlert
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  onSnapshot,
  collection,
  query,
  where,
  getDocs,
  User
} from "./firebase";

interface UserData {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  isVerified: boolean;
  isDisabled: boolean;
  role: "user" | "admin";
  githubToken?: string;
  reelsPerBatch?: number;
  uploadSchedule?: string;
  postedVideos?: string[];
  logs?: string[];
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  const [activeTab, setActiveTab] = useState<"dashboard" | "settings" | "admin">("dashboard");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Sync user data
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
          const newData: UserData = {
            uid: currentUser.uid,
            email: currentUser.email || "",
            displayName: currentUser.displayName || "",
            photoURL: currentUser.photoURL || "",
            isVerified: false,
            isDisabled: false,
            role: currentUser.email === "gopig4974@gmail.com" ? "admin" : "user", // Default admin
            reelsPerBatch: 2,
            uploadSchedule: "0 */6 * * *",
            postedVideos: [],
            logs: []
          };
          await setDoc(userRef, newData);
          setUserData(newData);
        }

        // Listen for real-time updates
        onSnapshot(userRef, (doc) => {
          setUserData(doc.data() as UserData);
        });
      } else {
        setUserData(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Admin: Fetch all users
  useEffect(() => {
    if (userData?.role === "admin" && activeTab === "admin") {
      const q = query(collection(db, "users"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const users = snapshot.docs.map(doc => doc.data() as UserData);
        setAllUsers(users);
      });
      return () => unsubscribe();
    }
  }, [userData, activeTab]);

  const handleLogin = () => signInWithPopup(auth, googleProvider);
  const handleLogout = () => signOut(auth);

  const updateSettings = async (updates: Partial<UserData>) => {
    if (!user) return;
    await updateDoc(doc(db, "users", user.uid), updates);
  };

  const toggleUserStatus = async (targetUid: string, field: "isVerified" | "isDisabled", value: boolean) => {
    await updateDoc(doc(db, "users", targetUid), { [field]: value });
  };

  const triggerAutomation = async () => {
    if (!userData || !userData.isVerified || userData.isDisabled) return;
    try {
      await fetch("/api/trigger-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user?.uid, userData })
      });
    } catch (err) {
      console.error("Trigger failed", err);
    }
  };

  if (loading) return <LoadingScreen />;
  if (!user) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-orange-500/30">
      {/* Sidebar / Nav */}
      <nav className="fixed left-0 top-0 bottom-0 w-20 border-r border-white/10 bg-black/50 backdrop-blur-xl flex flex-col items-center py-8 gap-8 z-50">
        <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20">
          <Play className="fill-white" size={24} />
        </div>
        
        <div className="flex-1 flex flex-col gap-4">
          <NavButton active={activeTab === "dashboard"} onClick={() => setActiveTab("dashboard")} icon={<History size={20} />} />
          <NavButton active={activeTab === "settings"} onClick={() => setActiveTab("settings")} icon={<Settings size={20} />} />
          {userData?.role === "admin" && (
            <NavButton active={activeTab === "admin"} onClick={() => setActiveTab("admin")} icon={<ShieldCheck size={20} />} />
          )}
        </div>

        <button onClick={handleLogout} className="p-3 text-white/40 hover:text-red-500 transition-colors">
          <LogOut size={20} />
        </button>
      </nav>

      <main className="pl-20">
        <header className="p-8 border-b border-white/10 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {activeTab === "dashboard" && "Automation Hub"}
              {activeTab === "settings" && "System Configuration"}
              {activeTab === "admin" && "Admin Control Center"}
            </h1>
            <p className="text-sm text-white/40 font-mono uppercase tracking-widest mt-1">
              {userData?.isVerified ? "Verified Account" : "Awaiting Verification"}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium">{userData?.displayName}</p>
              <p className="text-[10px] text-white/40 font-mono">{userData?.email}</p>
            </div>
            <img src={userData?.photoURL} alt="" className="w-10 h-10 rounded-full border border-white/10" />
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            {activeTab === "dashboard" && (
              <motion.div key="dashboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <DashboardView userData={userData} onTrigger={triggerAutomation} />
              </motion.div>
            )}
            {activeTab === "settings" && (
              <motion.div key="settings" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <SettingsView userData={userData} onUpdate={updateSettings} />
              </motion.div>
            )}
            {activeTab === "admin" && userData?.role === "admin" && (
              <motion.div key="admin" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <AdminView users={allUsers} onToggle={toggleUserStatus} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function DashboardView({ userData, onTrigger }: { userData: UserData | null, onTrigger: () => void }) {
  if (!userData?.isVerified) {
    return (
      <div className="bg-orange-500/10 border border-orange-500/20 p-12 rounded-3xl text-center">
        <ShieldAlert className="mx-auto text-orange-500 mb-4" size={48} />
        <h2 className="text-2xl font-bold mb-2">Account Pending Verification</h2>
        <p className="text-white/60 max-w-md mx-auto">
          Your account is currently under review by the administrator. Automation features will be enabled once your account is verified.
        </p>
      </div>
    );
  }

  if (userData.isDisabled) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 p-12 rounded-3xl text-center">
        <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
        <h2 className="text-2xl font-bold mb-2">Account Disabled</h2>
        <p className="text-white/60 max-w-md mx-auto">
          Your account has been disabled by the administrator. Please contact support for more information.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-4 space-y-6">
        <div className="bg-gradient-to-br from-white/10 to-transparent p-8 rounded-3xl border border-white/10">
          <h3 className="text-lg font-medium mb-4">Quick Actions</h3>
          <button 
            onClick={onTrigger}
            className="w-full py-4 bg-orange-500 hover:bg-orange-600 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-xl shadow-orange-500/20"
          >
            <Play size={20} /> Start Manual Cycle
          </button>
        </div>
        
        <div className="bg-white/5 p-6 rounded-3xl border border-white/10">
          <h3 className="text-xs font-mono uppercase tracking-widest text-white/40 mb-4">Active Config</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-white/40">Batch Size</span>
              <span className="font-mono">{userData.reelsPerBatch} Reels</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/40">Schedule</span>
              <span className="font-mono">{userData.uploadSchedule}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="lg:col-span-8">
        <div className="bg-white/5 rounded-3xl border border-white/10 flex flex-col h-[500px]">
          <div className="p-6 border-b border-white/10 flex items-center gap-2">
            <Terminal size={14} className="text-white/40" />
            <h3 className="text-sm font-mono uppercase tracking-widest text-white/40">Activity Logs</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-6 font-mono text-xs space-y-2">
            {userData.logs?.slice().reverse().map((log, i) => (
              <div key={i} className="text-white/60 border-l border-white/10 pl-3 py-1">
                {log}
              </div>
            ))}
            {(!userData.logs || userData.logs.length === 0) && (
              <div className="h-full flex items-center justify-center text-white/20 italic">
                No activity recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsView({ userData, onUpdate }: { userData: UserData | null, onUpdate: (u: Partial<UserData>) => void }) {
  const [github, setGithub] = useState(userData?.githubToken || "");
  const [batch, setBatch] = useState(userData?.reelsPerBatch || 2);
  const [schedule, setSchedule] = useState(userData?.uploadSchedule || "0 */6 * * *");

  return (
    <div className="max-w-2xl space-y-8">
      <section className="space-y-4">
        <h3 className="text-sm font-mono uppercase tracking-widest text-white/40 flex items-center gap-2">
          <Github size={14} /> GitHub Integration
        </h3>
        <input 
          type="password"
          value={github}
          onChange={(e) => setGithub(e.target.value)}
          placeholder="Personal Access Token"
          className="w-full bg-white/5 border border-white/10 rounded-xl p-4 focus:outline-none focus:border-orange-500 transition-colors"
        />
      </section>

      <section className="grid grid-cols-2 gap-8">
        <div className="space-y-4">
          <h3 className="text-sm font-mono uppercase tracking-widest text-white/40 flex items-center gap-2">
            <Layers size={14} /> Reels Per Batch
          </h3>
          <select 
            value={batch}
            onChange={(e) => setBatch(Number(e.target.value))}
            className="w-full bg-white/5 border border-white/10 rounded-xl p-4 focus:outline-none focus:border-orange-500 transition-colors appearance-none"
          >
            {[1, 2, 3, 4, 5, 10].map(n => <option key={n} value={n} className="bg-[#0a0a0a]">{n} Reels</option>)}
          </select>
        </div>
        <div className="space-y-4">
          <h3 className="text-sm font-mono uppercase tracking-widest text-white/40 flex items-center gap-2">
            <Clock size={14} /> Upload Schedule
          </h3>
          <input 
            type="text"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            placeholder="Cron (e.g. 0 */6 * * *)"
            className="w-full bg-white/5 border border-white/10 rounded-xl p-4 focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>
      </section>

      <button 
        onClick={() => onUpdate({ githubToken: github, reelsPerBatch: batch, uploadSchedule: schedule })}
        className="px-8 py-4 bg-white text-black font-bold rounded-2xl hover:bg-orange-500 hover:text-white transition-all"
      >
        Save Configuration
      </button>
    </div>
  );
}

function AdminView({ users, onToggle }: { users: UserData[], onToggle: (uid: string, field: "isVerified" | "isDisabled", val: boolean) => void }) {
  return (
    <div className="bg-white/5 rounded-3xl border border-white/10 overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-white/10 text-[10px] font-mono uppercase tracking-widest text-white/40">
            <th className="p-6">User</th>
            <th className="p-6">Role</th>
            <th className="p-6">Status</th>
            <th className="p-6 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {users.map(u => (
            <tr key={u.uid} className="hover:bg-white/5 transition-colors">
              <td className="p-6">
                <div className="flex items-center gap-3">
                  <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full" />
                  <div>
                    <p className="text-sm font-medium">{u.displayName}</p>
                    <p className="text-xs text-white/40">{u.email}</p>
                  </div>
                </div>
              </td>
              <td className="p-6">
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${u.role === 'admin' ? 'border-orange-500/50 text-orange-500' : 'border-white/20 text-white/40'}`}>
                  {u.role}
                </span>
              </td>
              <td className="p-6">
                <div className="flex gap-2">
                  {u.isVerified ? <span className="text-green-500 text-xs">Verified</span> : <span className="text-orange-500 text-xs">Pending</span>}
                  {u.isDisabled && <span className="text-red-500 text-xs">Disabled</span>}
                </div>
              </td>
              <td className="p-6 text-right space-x-2">
                <button 
                  onClick={() => onToggle(u.uid, "isVerified", !u.isVerified)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${u.isVerified ? 'border-white/10 text-white/40 hover:bg-white/10' : 'border-green-500/50 text-green-500 hover:bg-green-500/10'}`}
                >
                  {u.isVerified ? "Revoke" : "Verify"}
                </button>
                <button 
                  onClick={() => onToggle(u.uid, "isDisabled", !u.isDisabled)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${u.isDisabled ? 'border-green-500/50 text-green-500 hover:bg-green-500/10' : 'border-red-500/50 text-red-500 hover:bg-red-500/10'}`}
                >
                  {u.isDisabled ? "Enable" : "Disable"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NavButton({ active, icon, onClick }: { active: boolean, icon: any, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`p-4 rounded-2xl transition-all ${active ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-white/40 hover:bg-white/5 hover:text-white'}`}
    >
      {icon}
    </button>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-white font-mono">
      <RefreshCw className="animate-spin mr-2" /> Authenticating...
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-red-600 rounded-3xl flex items-center justify-center mx-auto shadow-2xl shadow-orange-500/20">
          <Play className="fill-white" size={40} />
        </div>
        <div>
          <h1 className="text-4xl font-bold tracking-tighter mb-2">SocialStream AI</h1>
          <p className="text-white/40">The ultimate social media automation engine.</p>
        </div>
        <button 
          onClick={onLogin}
          className="w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-orange-500 hover:text-white transition-all flex items-center justify-center gap-3"
        >
          <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="" />
          Continue with Google
        </button>
        <p className="text-[10px] text-white/20 font-mono uppercase tracking-[0.2em]">Enterprise Grade Security</p>
      </div>
    </div>
  );
}
