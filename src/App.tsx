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
  Terminal
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface AutomationStatus {
  lastRun: string | null;
  nextRun: string | null;
  postedVideos: string[];
  logs: string[];
  isAutomationRunning: boolean;
}

export default function App() {
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error("Failed to fetch status", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleManualTrigger = async () => {
    setTriggering(true);
    try {
      await fetch("/api/trigger", { method: "POST" });
      setTimeout(fetchStatus, 1000);
    } catch (err) {
      console.error("Manual trigger failed", err);
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-white font-mono">
        <RefreshCw className="animate-spin mr-2" /> Initializing SocialStream AI...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-orange-500/30">
      {/* Header */}
      <header className="border-b border-white/10 p-6 flex justify-between items-center backdrop-blur-md sticky top-0 z-50 bg-black/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Play className="fill-white" size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">SocialStream AI</h1>
            <p className="text-xs text-white/40 uppercase tracking-widest font-mono">Pro Automation Engine</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/10">
            <div className={`w-2 h-2 rounded-full ${status?.isAutomationRunning ? 'bg-green-500 animate-pulse' : 'bg-white/20'}`} />
            <span className="text-xs font-mono uppercase tracking-tighter">
              {status?.isAutomationRunning ? 'System Active' : 'System Idle'}
            </span>
          </div>
          <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <Settings size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Stats & Controls */}
        <div className="lg:col-span-4 space-y-8">
          {/* Main Action */}
          <section className="bg-gradient-to-br from-white/10 to-transparent p-8 rounded-3xl border border-white/10 relative overflow-hidden group">
            <div className="relative z-10">
              <h2 className="text-2xl font-light mb-6">Automation Control</h2>
              <button 
                onClick={handleManualTrigger}
                disabled={triggering || status?.isAutomationRunning}
                className="w-full py-4 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-xl shadow-orange-500/20 active:scale-95"
              >
                {triggering ? <RefreshCw className="animate-spin" /> : <Play size={20} />}
                Run Manual Cycle
              </button>
              <p className="mt-4 text-xs text-white/40 text-center font-mono uppercase tracking-widest">
                Next scheduled run: {status?.nextRun || "Pending"}
              </p>
            </div>
            <div className="absolute -right-10 -bottom-10 opacity-5 group-hover:opacity-10 transition-opacity">
              <Play size={200} />
            </div>
          </section>

          {/* Connected Platforms */}
          <section className="bg-white/5 p-6 rounded-3xl border border-white/10">
            <h3 className="text-sm font-mono uppercase tracking-widest text-white/40 mb-6 flex items-center gap-2">
              <CheckCircle2 size={14} /> Connected Nodes
            </h3>
            <div className="space-y-4">
              <PlatformItem icon={<Github size={18} />} name="GitHub Repository" status="Connected" color="text-white" />
              <PlatformItem icon={<Youtube size={18} />} name="YouTube Channel" status="Authorized" color="text-red-500" />
              <PlatformItem icon={<Instagram size={18} />} name="Instagram Business" status="Authorized" color="text-pink-500" />
              <PlatformItem icon={<Facebook size={18} />} name="Facebook Page" status="Authorized" color="text-blue-500" />
            </div>
          </section>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Videos Posted" value={status?.postedVideos.length || 0} icon={<History size={16} />} />
            <StatCard label="Success Rate" value="100%" icon={<CheckCircle2 size={16} />} />
          </div>
        </div>

        {/* Right Column: Logs & Activity */}
        <div className="lg:col-span-8 space-y-8">
          <section className="bg-white/5 rounded-3xl border border-white/10 flex flex-col h-[600px]">
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h3 className="text-sm font-mono uppercase tracking-widest text-white/40 flex items-center gap-2">
                <Terminal size={14} /> Real-time System Logs
              </h3>
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-white/10" />
                <div className="w-2 h-2 rounded-full bg-white/10" />
                <div className="w-2 h-2 rounded-full bg-white/10" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 font-mono text-xs space-y-2 scrollbar-hide">
              <AnimatePresence initial={false}>
                {status?.logs.slice().reverse().map((log, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`p-2 rounded ${log.includes('Error') || log.includes('failed') ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'text-white/60'}`}
                  >
                    {log}
                  </motion.div>
                ))}
              </AnimatePresence>
              {status?.logs.length === 0 && (
                <div className="h-full flex items-center justify-center text-white/20 italic">
                  Waiting for system activity...
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto p-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 text-white/20 text-xs font-mono uppercase tracking-widest">
        <p>© 2026 SocialStream AI Automation Engine</p>
        <div className="flex gap-6">
          <a href="#" className="hover:text-white transition-colors">Documentation</a>
          <a href="#" className="hover:text-white transition-colors">API Reference</a>
          <a href="#" className="hover:text-white transition-colors">Security</a>
        </div>
      </footer>
    </div>
  );
}

function PlatformItem({ icon, name, status, color }: { icon: any, name: string, status: string, color: string }) {
  return (
    <div className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/5 hover:border-white/20 transition-all cursor-default group">
      <div className="flex items-center gap-3">
        <div className={`${color} opacity-60 group-hover:opacity-100 transition-opacity`}>{icon}</div>
        <span className="text-sm font-medium">{name}</span>
      </div>
      <span className="text-[10px] font-mono uppercase tracking-tighter px-2 py-0.5 bg-green-500/10 text-green-500 rounded-full border border-green-500/20">
        {status}
      </span>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string, value: string | number, icon: any }) {
  return (
    <div className="bg-white/5 p-6 rounded-3xl border border-white/10 hover:bg-white/[0.07] transition-colors">
      <div className="text-white/40 mb-2">{icon}</div>
      <div className="text-2xl font-bold tracking-tighter">{value}</div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-white/20 mt-1">{label}</div>
    </div>
  );
}
