import { useState, useEffect, FormEvent } from "react";
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
  ShieldAlert,
  Key,
  Mail,
  Lock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface UserData {
  id: number;
  email: string;
  displayName: string;
  role: "user" | "admin";
  isVerified: boolean;
  isDisabled: boolean;
  githubToken?: string;
  youtubeTokens?: string;
  metaTokens?: string;
  reelsPerBatch?: number;
  uploadSchedule?: string;
  postedVideos?: string;
  createdAt: string;
}

interface UploadEntry {
  id: number;
  videoName: string;
  platform: string;
  platformVideoId: string;
  status: string;
  timestamp: string;
}

interface LogEntry {
  id: number;
  action: string;
  details: string;
  timestamp: string;
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  const [userLogs, setUserLogs] = useState<LogEntry[]>([]);
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"dashboard" | "settings" | "admin" | "uploads">("dashboard");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  useEffect(() => {
    if (token) {
      fetchUserData();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchUserData = async () => {
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUserData(data);
        fetchLogs();
        fetchUploads();
      } else {
        handleLogout();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch("/api/user/logs", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUserLogs(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUploads = async () => {
    try {
      const res = await fetch("/api/user/uploads", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUploads(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const deleteUpload = async (id: number) => {
    try {
      const res = await fetch(`/api/user/uploads/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchUploads();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAllUsers = async () => {
    try {
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAllUsers(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (userData?.role === "admin" && activeTab === "admin") {
      fetchAllUsers();
    }
    if (activeTab === "dashboard" && token) {
      fetchLogs();
    }
    if (activeTab === "uploads" && token) {
      fetchUploads();
    }
  }, [userData, activeTab, token]);

  const connectSocial = async (platform: "youtube" | "meta") => {
    try {
      const res = await fetch(`/api/auth/${platform}/url`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const { url } = await res.json();
      const authWindow = window.open(url, "_blank", "width=600,height=700");
      
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === 'OAUTH_SUCCESS') {
          fetchUserData();
          alert(`${event.data.platform} connected successfully!`);
          window.removeEventListener('message', handleMessage);
        }
      };
      window.addEventListener('message', handleMessage);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogin = async (email: string, pass: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pass })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("token", data.token);
        setToken(data.token);
        setUserData(data.user);
      } else {
        alert(data.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (email: string, pass: string, name: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pass, displayName: name })
      });
      const data = await res.json();
      if (res.ok) {
        setAuthMode("login");
        alert("Registration successful! Please login.");
      } else {
        alert(data.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUserData(null);
    setAllUsers([]);
    setUserLogs([]);
    setUploads([]);
  };

  const updateSettings = async (updates: Partial<UserData>) => {
    try {
      const res = await fetch("/api/user/config", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        fetchUserData();
        alert("Settings updated!");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleUserStatus = async (targetId: number, field: "verify" | "disable", value: boolean) => {
    try {
      const res = await fetch(`/api/admin/users/${targetId}/${field}`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ [field === "verify" ? "isVerified" : "isDisabled"]: value })
      });
      if (res.ok) {
        fetchAllUsers();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const triggerAutomation = async () => {
    if (!userData?.isVerified || userData.isDisabled) return;
    try {
      const res = await fetch("/api/user/trigger", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchLogs();
        alert("Automation triggered!");
      }
    } catch (err) {
      console.error("Trigger failed", err);
    }
  };

  if (loading) return <LoadingScreen />;
  if (!token || !userData) return <AuthScreen mode={authMode} setMode={setAuthMode} onLogin={handleLogin} onRegister={handleRegister} />;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-orange-500/30">
      {/* Sidebar / Nav */}
      <nav className="fixed left-0 top-0 bottom-0 w-20 border-r border-white/10 bg-black/50 backdrop-blur-xl flex flex-col items-center py-8 gap-8 z-50">
        <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20">
          <Play className="fill-white" size={24} />
        </div>
        
        <div className="flex-1 flex flex-col gap-4">
          <NavButton active={activeTab === "dashboard"} onClick={() => setActiveTab("dashboard")} icon={<History size={20} />} />
          <NavButton active={activeTab === "uploads"} onClick={() => setActiveTab("uploads")} icon={<Layers size={20} />} />
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
              {activeTab === "uploads" && "Uploaded Content"}
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
            <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center bg-white/5">
              <UserIcon size={20} className="text-white/40" />
            </div>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            {activeTab === "dashboard" && (
              <motion.div key="dashboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <DashboardView userData={userData} logs={userLogs} onTrigger={triggerAutomation} />
              </motion.div>
            )}
            {activeTab === "uploads" && (
              <motion.div key="uploads" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <UploadsView uploads={uploads} onDelete={deleteUpload} />
              </motion.div>
            )}
            {activeTab === "settings" && (
              <motion.div key="settings" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <SettingsView userData={userData} onUpdate={updateSettings} onConnect={connectSocial} />
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

function DashboardView({ userData, logs, onTrigger }: { userData: UserData | null, logs: LogEntry[], onTrigger: () => void }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-8">
        <div className="bg-white/5 rounded-3xl border border-white/10 p-8">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-sm font-mono uppercase tracking-widest text-white/40">Automation Status</h3>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full animate-pulse ${userData?.isVerified && !userData?.isDisabled ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-xs font-mono">{userData?.isVerified && !userData?.isDisabled ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
              <p className="text-xs text-white/40 mb-1">GitHub Connection</p>
              <p className="font-medium flex items-center gap-2">
                {userData?.githubToken ? <CheckCircle2 size={16} className="text-green-500" /> : <AlertCircle size={16} className="text-orange-500" />}
                {userData?.githubToken ? 'Connected' : 'Not Configured'}
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
              <p className="text-xs text-white/40 mb-1">Social Accounts</p>
              <div className="flex gap-3">
                <Youtube size={16} className={userData?.youtubeTokens ? 'text-red-500' : 'text-white/20'} />
                <Instagram size={16} className={userData?.metaTokens ? 'text-pink-500' : 'text-white/20'} />
              </div>
            </div>
          </div>

          <button 
            onClick={onTrigger}
            disabled={!userData?.isVerified || userData?.isDisabled}
            className="w-full mt-8 py-4 bg-orange-500 text-white font-bold rounded-2xl hover:bg-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            <Play size={20} /> Trigger Manual Batch
          </button>
        </div>

        <div className="bg-white/5 rounded-3xl border border-white/10 p-8">
          <h3 className="text-sm font-mono uppercase tracking-widest text-white/40 mb-6 flex items-center gap-2">
            <Terminal size={14} /> Activity Logs
          </h3>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-4 custom-scrollbar">
            {logs.map(log => (
              <div key={log.id} className="flex gap-4 text-sm border-l border-white/10 pl-4 py-1">
                <span className="text-white/20 font-mono text-[10px] whitespace-nowrap mt-1">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <div>
                  <p className="font-medium text-white/80">{log.action}</p>
                  <p className="text-white/40 text-xs">{log.details}</p>
                </div>
              </div>
            ))}
            {logs.length === 0 && <p className="text-white/20 italic text-sm">No activity recorded yet.</p>}
          </div>
        </div>
      </div>

      <div className="space-y-8">
        <div className="bg-gradient-to-br from-orange-500/20 to-red-600/20 rounded-3xl border border-orange-500/20 p-8">
          <ShieldAlert className="text-orange-500 mb-4" size={32} />
          <h3 className="text-lg font-bold mb-2">Account Verification</h3>
          <p className="text-sm text-white/60 leading-relaxed">
            {userData?.isVerified 
              ? "Your account is fully verified. Automation will run according to your schedule." 
              : "Your account is currently pending administrator verification. Automation features are restricted."}
          </p>
        </div>
        
        <div className="bg-white/5 rounded-3xl border border-white/10 p-8">
          <History className="text-white/40 mb-4" size={32} />
          <h3 className="text-lg font-bold mb-2">System Info</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-xs">
              <span className="text-white/40">Role</span>
              <span className="font-mono uppercase">{userData?.role}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/40">Member Since</span>
              <span className="font-mono">{new Date(userData?.createdAt || "").toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UploadsView({ uploads, onDelete }: { uploads: UploadEntry[], onDelete: (id: number) => void }) {
  return (
    <div className="bg-white/5 rounded-3xl border border-white/10 overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-white/10 text-[10px] font-mono uppercase tracking-widest text-white/40">
            <th className="p-6">Video Name</th>
            <th className="p-6">Platform</th>
            <th className="p-6">Video ID</th>
            <th className="p-6">Date</th>
            <th className="p-6 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {uploads.map(u => (
            <tr key={u.id} className="hover:bg-white/5 transition-colors">
              <td className="p-6 font-medium text-sm">{u.videoName}</td>
              <td className="p-6">
                <div className="flex items-center gap-2">
                  {u.platform === 'youtube' && <Youtube size={16} className="text-red-500" />}
                  {u.platform === 'instagram' && <Instagram size={16} className="text-pink-500" />}
                  <span className="capitalize text-xs">{u.platform}</span>
                </div>
              </td>
              <td className="p-6 font-mono text-xs text-white/40">{u.platformVideoId}</td>
              <td className="p-6 text-xs text-white/40">{new Date(u.timestamp).toLocaleDateString()}</td>
              <td className="p-6 text-right">
                <button 
                  onClick={() => onDelete(u.id)}
                  className="text-xs text-red-500 hover:text-red-400 transition-colors"
                >
                  Delete Record
                </button>
              </td>
            </tr>
          ))}
          {uploads.length === 0 && (
            <tr>
              <td colSpan={5} className="p-12 text-center text-white/20 italic">
                No videos uploaded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SettingsView({ userData, onUpdate, onConnect }: { userData: UserData | null, onUpdate: (u: Partial<UserData>) => void, onConnect: (p: "youtube" | "meta") => void }) {
  const [github, setGithub] = useState(userData?.githubToken || "");
  const [batch, setBatch] = useState(userData?.reelsPerBatch || 2);
  const [schedule, setSchedule] = useState(userData?.uploadSchedule || "0 */6 * * *");

  return (
    <div className="max-w-2xl space-y-12">
      <section className="space-y-6">
        <h3 className="text-sm font-mono uppercase tracking-widest text-white/40">Social Integrations</h3>
        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => onConnect("youtube")}
            className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${userData?.youtubeTokens ? 'border-red-500/50 bg-red-500/5' : 'border-white/10 bg-white/5 hover:border-red-500/50'}`}
          >
            <div className="flex items-center gap-3">
              <Youtube className={userData?.youtubeTokens ? 'text-red-500' : 'text-white/40'} />
              <span className="font-medium">YouTube</span>
            </div>
            {userData?.youtubeTokens ? <CheckCircle2 size={16} className="text-red-500" /> : <span className="text-[10px] font-mono uppercase text-white/40">Connect</span>}
          </button>
          
          <button 
            onClick={() => onConnect("meta")}
            className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${userData?.metaTokens ? 'border-pink-500/50 bg-pink-500/5' : 'border-white/10 bg-white/5 hover:border-pink-500/50'}`}
          >
            <div className="flex items-center gap-3">
              <Instagram className={userData?.metaTokens ? 'text-pink-500' : 'text-white/40'} />
              <span className="font-medium">Instagram</span>
            </div>
            {userData?.metaTokens ? <CheckCircle2 size={16} className="text-pink-500" /> : <span className="text-[10px] font-mono uppercase text-white/40">Connect</span>}
          </button>
        </div>
      </section>

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

function AdminView({ users, onToggle }: { users: UserData[], onToggle: (id: number, field: "verify" | "disable", val: boolean) => void }) {
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
            <tr key={u.id} className="hover:bg-white/5 transition-colors">
              <td className="p-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                    <UserIcon size={16} className="text-white/40" />
                  </div>
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
                  {u.isDisabled ? <span className="text-red-500 text-xs">Disabled</span> : null}
                </div>
              </td>
              <td className="p-6 text-right space-x-2">
                <button 
                  onClick={() => onToggle(u.id, "verify", !u.isVerified)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${u.isVerified ? 'border-white/10 text-white/40 hover:bg-white/10' : 'border-green-500/50 text-green-500 hover:bg-green-500/10'}`}
                >
                  {u.isVerified ? "Revoke" : "Verify"}
                </button>
                <button 
                  onClick={() => onToggle(u.id, "disable", !u.isDisabled)}
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
      <RefreshCw className="animate-spin mr-2" /> Loading...
    </div>
  );
}

function AuthScreen({ mode, setMode, onLogin, onRegister }: { 
  mode: "login" | "register", 
  setMode: (m: "login" | "register") => void,
  onLogin: (e: string, p: string) => void,
  onRegister: (e: string, p: string, n: string) => void
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === "login") {
      onLogin(email, password);
    } else {
      onRegister(email, password, name);
    }
  };

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

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          {mode === "register" && (
            <div className="space-y-2">
              <label className="text-xs font-mono uppercase tracking-widest text-white/40 ml-2">Display Name</label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 pl-12 focus:outline-none focus:border-orange-500 transition-colors"
                  placeholder="John Doe"
                  required
                />
              </div>
            </div>
          )}
          <div className="space-y-2">
            <label className="text-xs font-mono uppercase tracking-widest text-white/40 ml-2">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 pl-12 focus:outline-none focus:border-orange-500 transition-colors"
                placeholder="name@example.com"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-mono uppercase tracking-widest text-white/40 ml-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 pl-12 focus:outline-none focus:border-orange-500 transition-colors"
                placeholder="••••••••"
                required
              />
            </div>
          </div>
          <button 
            type="submit"
            className="w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-orange-500 hover:text-white transition-all flex items-center justify-center gap-3 mt-4"
          >
            {mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <div className="text-sm text-white/40">
          {mode === "login" ? (
            <p>Don't have an account? <button onClick={() => setMode("register")} className="text-orange-500 hover:underline">Register here</button></p>
          ) : (
            <p>Already have an account? <button onClick={() => setMode("login")} className="text-orange-500 hover:underline">Login here</button></p>
          )}
        </div>

        <p className="text-[10px] text-white/20 font-mono uppercase tracking-[0.2em]">Enterprise Grade Security</p>
      </div>
    </div>
  );
}
