import { useState, useEffect } from 'react';
import { UPSTASH_URL, READ_ONLY_TOKEN, MY_CUSTOM_PASSWORD, HIDDEN_WRITE_TOKEN } from '../config';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Plus, LogOut, CheckCircle2, AlertCircle, Check, X } from 'lucide-react';

const safeJSONParse = (data: any, fallback: any) => {
  if (!data) return fallback;
  try {
    let parsed = JSON.parse(data);
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    return parsed;
  } catch {
    return fallback;
  }
};

export default function AdminPage() {
  const [punishments, setPunishments] = useState<string[]>([]);
  const [pendingList, setPendingList] = useState<string[]>([]);
  const [newPunishment, setNewPunishment] = useState("");
  const [inputPassword, setInputPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [status, setStatus] = useState({ message: "", type: "" });
  const navigate = useNavigate();

  useEffect(() => {
    const savedLogin = localStorage.getItem('valo_admin_logged_in');
    if (savedLogin === 'true') {
      setIsLoggedIn(true);
      fetchData(); 
    }
  }, []);

  const fetchData = async () => {
    try {
      const resPool = await fetch(`${UPSTASH_URL}/get/punishment_list`, { headers: { Authorization: `Bearer ${READ_ONLY_TOKEN}` } });
      const dataPool = await resPool.json();
      setPunishments(safeJSONParse(dataPool.result, []));

      const resPend = await fetch(`${UPSTASH_URL}/get/pending_punishments`, { headers: { Authorization: `Bearer ${READ_ONLY_TOKEN}` } });
      const dataPend = await resPend.json();
      setPendingList(safeJSONParse(dataPend.result, []));
    } catch (err) {
      showStatus("数据加载失败", "error");
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputPassword === MY_CUSTOM_PASSWORD) {
      localStorage.setItem('valo_admin_logged_in', 'true');
      setIsLoggedIn(true);
      fetchData();
      showStatus("身份验证成功", "success");
    } else {
      showStatus("密码错误", "error");
      setInputPassword("");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('valo_admin_logged_in');
    setIsLoggedIn(false);
    setPunishments([]);
    setPendingList([]);
  };

  const showStatus = (msg: string, type: "success" | "error") => {
    setStatus({ message: msg, type });
    setTimeout(() => setStatus({ message: "", type: "" }), 3000);
  };

  const updateCloud = async (key: string, dataArray: any[]) => {
    await fetch(`${UPSTASH_URL}/set/${key}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${HIDDEN_WRITE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(dataArray)
    });
  };

  // 手動新增懲罰
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPunishment.trim()) return;
    const updated = [...punishments, newPunishment.trim()];
    await updateCloud('punishment_list', updated);
    setPunishments(updated);
    setNewPunishment("");
    showStatus("添加成功", "success");
  };

  // 刪除現有懲罰
  const handleDelete = async (indexToDelete: number) => {
    const updated = punishments.filter((_, i) => i !== indexToDelete);
    await updateCloud('punishment_list', updated);
    setPunishments(updated);
  };

  // 審核通過：加入正式池，並從待審核移除
  const handleApprove = async (index: number) => {
    const item = pendingList[index];
    const newPunishments = [...punishments, item];
    const newPending = pendingList.filter((_, i) => i !== index);
    
    await updateCloud('punishment_list', newPunishments);
    await updateCloud('pending_punishments', newPending);
    
    setPunishments(newPunishments);
    setPendingList(newPending);
    showStatus(`已通过: ${item}`, "success");
  };

  // 審核拒絕：直接從待審核移除
  const handleReject = async (index: number) => {
    const newPending = pendingList.filter((_, i) => i !== index);
    await updateCloud('pending_punishments', newPending);
    setPendingList(newPending);
  };

  return (
    <div className="min-h-screen bg-[#f3f4f6] text-gray-800 flex flex-col items-center p-6 md:p-12 relative overflow-x-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-pink-200 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>

      <div className="w-full max-w-4xl flex justify-between items-center mb-10 z-10">
        <h1 className="text-2xl md:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-500 tracking-wide">
          管理控制台
        </h1>
        <button onClick={() => navigate('/')} className="px-5 py-2 rounded-full bg-white/50 backdrop-blur-md border border-gray-200 text-gray-600 hover:bg-white transition-all text-sm font-bold">
          返回前台
        </button>
      </div>

      <AnimatePresence>
        {status.message && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className={`fixed top-8 z-50 px-6 py-3 rounded-full font-bold shadow-lg flex items-center gap-2 ${status.type === 'error' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}
          >
            {status.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            {status.message}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full max-w-4xl z-10">
        {!isLoggedIn ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-8 md:p-12 shadow-sm max-w-md mx-auto">
            <h2 className="text-2xl font-bold mb-2 text-gray-800">身份验证</h2>
            <p className="text-gray-500 mb-8 text-sm">请输入密码解锁功能。</p>
            <form onSubmit={handleLogin} className="flex flex-col gap-5">
              <input type="password" value={inputPassword} onChange={(e) => setInputPassword(e.target.value)} className="w-full bg-white/50 border border-gray-200 focus:border-purple-400 focus:ring-2 rounded-2xl p-4 text-gray-800 outline-none" placeholder="PASSWORD" autoFocus />
              <button type="submit" className="bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-4 rounded-2xl hover:opacity-90 transition-all">解锁控制台</button>
            </form>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
            
            {/* 區塊 1：待審核清單 */}
            <div className="bg-white/60 backdrop-blur-xl border border-purple-100 rounded-3xl p-6 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-purple-400"></div>
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">玩家提交待审核 ({pendingList.length})</h3>
              <div className="flex flex-col gap-3">
                <AnimatePresence>
                  {pendingList.length === 0 && <motion.div className="text-gray-400 py-4">目前没有待审核的提议。</motion.div>}
                  {pendingList.map((p, index) => (
                    <motion.div key={index} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.9 }}
                      className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-purple-50"
                    >
                      <span className="font-bold text-gray-700">{p}</span>
                      <div className="flex gap-2">
                        <button onClick={() => handleApprove(index)} className="bg-green-100 text-green-600 p-2 rounded-xl hover:bg-green-200 transition-colors" title="通过并加入惩罚池"><Check size={20}/></button>
                        <button onClick={() => handleReject(index)} className="bg-red-100 text-red-600 p-2 rounded-xl hover:bg-red-200 transition-colors" title="残忍拒绝"><X size={20}/></button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            {/* 區塊 2：手動新增 */}
            <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row gap-4 justify-between md:items-center">
              <h3 className="text-lg font-bold text-gray-800">直接添加惩罚</h3>
              <form onSubmit={handleAdd} className="flex gap-3 flex-1 md:ml-8">
                <input type="text" value={newPunishment} onChange={(e) => setNewPunishment(e.target.value)} className="flex-1 bg-white/50 border border-gray-200 focus:border-purple-400 rounded-xl p-3 text-gray-800 outline-none" placeholder="输入新惩罚..." />
                <button type="submit" disabled={!newPunishment.trim()} className="bg-gray-800 text-white px-6 rounded-xl font-bold hover:bg-gray-700 disabled:opacity-50"><Plus size={20} /></button>
              </form>
            </div>

            {/* 區塊 3：現有懲罰列表 */}
            <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-6 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm text-gray-500 font-medium">当前正式惩罚池 ({punishments.length})</span>
                <button onClick={handleLogout} className="text-gray-400 hover:text-red-500 flex items-center gap-1 text-sm"><LogOut size={16} /> 退出登录</button>
              </div>
              <div className="flex flex-col gap-3">
                <AnimatePresence>
                  {punishments.length === 0 && <motion.div className="text-gray-400 text-center py-8">惩罚池为空。</motion.div>}
                  {punishments.map((p, index) => (
                    <motion.div key={index} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.9, backgroundColor: '#fecdd3' }}
                      className="group flex justify-between items-center bg-white/80 p-4 rounded-2xl border border-transparent hover:border-pink-200 transition-all"
                    >
                      <span className="font-bold text-gray-700">{p}</span>
                      <button onClick={() => handleDelete(index)} className="text-gray-300 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50"><Trash2 size={18} /></button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

          </motion.div>
        )}
      </div>
    </div>
  );
}