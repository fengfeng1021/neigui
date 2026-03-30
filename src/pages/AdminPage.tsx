import { useState, useEffect } from 'react';
import { UPSTASH_URL, READ_ONLY_TOKEN, MY_CUSTOM_PASSWORD, HIDDEN_WRITE_TOKEN } from '../config';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Plus, LogOut, CheckCircle2, AlertCircle, Check, X, Edit2, Save, ThumbsUp, ThumbsDown } from 'lucide-react';

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
  const [pendingList, setPendingList] = useState<any[]>([]); // 改為 any[] 以兼容物件
  const [newPunishment, setNewPunishment] = useState("");
  const [inputPassword, setInputPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [status, setStatus] = useState({ message: "", type: "" });
  const navigate = useNavigate();

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  // 新增：自動通過池的狀態
  const [autoPunishments, setAutoPunishments] = useState<string[]>([]);
  const [editingAutoIndex, setEditingAutoIndex] = useState<number | null>(null);
  const [editAutoText, setEditAutoText] = useState("");

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

      const resAuto = await fetch(`${UPSTASH_URL}/get/auto_punishment_list`, { headers: { Authorization: `Bearer ${READ_ONLY_TOKEN}` } });
      const dataAuto = await resAuto.json();
      setAutoPunishments(safeJSONParse(dataAuto.result, []));

      const resPend = await fetch(`${UPSTASH_URL}/get/pending_punishments`, { headers: { Authorization: `Bearer ${READ_ONLY_TOKEN}` } });
      const dataPend = await resPend.json();
      
      // 處理資料：如果是舊的純文字，轉為物件格式方便統一顯示
      const rawPending = safeJSONParse(dataPend.result, []);
      const formattedPending = rawPending.map((item: any) => 
        typeof item === 'string' 
          ? { id: Math.random().toString(), text: item, upvotes: 0, downvotes: 0 } 
          : item
      );
      setPendingList(formattedPending);
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
    setAutoPunishments([]);
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

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPunishment.trim()) return;
    const updated = [...punishments, newPunishment.trim()];
    await updateCloud('punishment_list', updated);
    setPunishments(updated);
    setNewPunishment("");
    showStatus("添加成功", "success");
  };

  const handleSaveEdit = async (index: number) => {
    if (!editText.trim() || editText === punishments[index]) {
      setEditingIndex(null);
      return;
    }
    const updated = [...punishments];
    updated[index] = editText.trim();
    await updateCloud('punishment_list', updated);
    setPunishments(updated);
    setEditingIndex(null);
    showStatus("修改成功", "success");
  };

  const handleDelete = async (indexToDelete: number) => {
    const updated = punishments.filter((_, i) => i !== indexToDelete);
    await updateCloud('punishment_list', updated);
    setPunishments(updated);
  };

  const handleSaveAutoEdit = async (index: number) => {
    if (!editAutoText.trim() || editAutoText === autoPunishments[index]) {
      setEditingAutoIndex(null);
      return;
    }
    const updated = [...autoPunishments];
    updated[index] = editAutoText.trim();
    await updateCloud('auto_punishment_list', updated);
    setAutoPunishments(updated);
    setEditingAutoIndex(null);
    showStatus("修改成功", "success");
  };

  const handleDeleteAuto = async (indexToDelete: number) => {
    const updated = autoPunishments.filter((_, i) => i !== indexToDelete);
    await updateCloud('auto_punishment_list', updated);
    setAutoPunishments(updated);
  };

  const handleApprove = async (index: number) => {
    const item = pendingList[index];
    // 從物件中取出 text，如果是純文字就直接用
    const approvedText = typeof item === 'string' ? item : item.text; 

    const newPunishments = [...punishments, approvedText];
    const newPending = pendingList.filter((_, i) => i !== index);
    
    await updateCloud('punishment_list', newPunishments);
    await updateCloud('pending_punishments', newPending);
    
    setPunishments(newPunishments);
    setPendingList(newPending);
    showStatus(`已通过: ${approvedText}`, "success");
  };

  const handleReject = async (index: number) => {
    const newPending = pendingList.filter((_, i) => i !== index);
    await updateCloud('pending_punishments', newPending);
    setPendingList(newPending);
  };

  const handleClearVotes = async () => {
    if (!window.confirm("确定要清空所有待审核提议的投票数吗？")) return;
    const clearedList = pendingList.map(p => typeof p === 'object' ? { ...p, upvotes: 0, downvotes: 0 } : p);
    await updateCloud('pending_punishments', clearedList);
    setPendingList(clearedList);
    showStatus("已清空所有投票", "success");
  };

  return (
    <div 
      className="min-h-screen text-gray-800 flex flex-col items-center p-4 md:p-12 relative overflow-x-clip bg-cover bg-center bg-fixed"
      style={{ backgroundImage: 'url("/bg.png")' }}
    >

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
            
            <div className="bg-white/60 backdrop-blur-xl border border-purple-100 rounded-3xl p-6 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-purple-400"></div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">玩家提交待审核 ({pendingList.length})</h3>
                <button onClick={handleClearVotes} className="text-xs bg-red-100 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-200 transition-colors font-bold flex items-center gap-1">
                  <Trash2 size={14}/> 清空投票
                </button>
              </div>
              <div className="flex flex-col gap-3">
                <AnimatePresence>
                  {pendingList.length === 0 && <motion.div className="text-gray-400 py-4">目前没有待审核的提议。</motion.div>}
                  {pendingList.map((p, index) => (
                    <motion.div key={index} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.9 }}
                      className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-purple-50"
                    >
                      <div className="flex flex-col gap-2 w-full sm:flex-1">
                        <span className="font-bold text-gray-700 break-words">{typeof p === 'string' ? p : p.text}</span>
                        {/* 顯示玩家投票狀態 */}
                        {typeof p === 'object' && (
                           <div className="flex gap-4 mt-1">
                             <span className="flex items-center gap-1.5 text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-lg">
                               <ThumbsUp size={14}/> {p.upvotes || 0}
                             </span>
                             <span className="flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-lg">
                               <ThumbsDown size={14}/> {p.downvotes || 0}
                             </span>
                           </div>
                        )}
                      </div>
                      
                      <div className="flex gap-2 self-end sm:self-auto shrink-0 mt-2 sm:mt-0">
                        <button onClick={() => handleApprove(index)} className="bg-green-100 text-green-600 p-2 rounded-xl hover:bg-green-200 transition-colors" title="通过并加入惩罚池"><Check size={20}/></button>
                        <button onClick={() => handleReject(index)} className="bg-red-100 text-red-600 p-2 rounded-xl hover:bg-red-200 transition-colors" title="残忍拒绝"><X size={20}/></button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row gap-4 justify-between md:items-start">
              <h3 className="text-lg font-bold text-gray-800 mt-3">直接添加惩罚</h3>
              <form onSubmit={handleAdd} className="flex gap-3 flex-1 md:ml-8 items-stretch">
                <textarea value={newPunishment} onChange={(e) => setNewPunishment(e.target.value)} rows={2} className="flex-1 bg-white/50 border border-gray-200 focus:border-purple-400 rounded-xl p-3 text-gray-800 outline-none resize-none custom-scrollbar" placeholder="输入新惩罚 (支持多行)..." />
                <button type="submit" disabled={!newPunishment.trim()} className="bg-gray-800 text-white px-6 rounded-xl font-bold hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center"><Plus size={20} /></button>
              </form>
            </div>

            {/* 列表 1：管理員審核與手動添加 */}
            <div className="bg-white/60 backdrop-blur-xl border border-purple-100 rounded-3xl p-6 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-bold text-purple-600 flex items-center gap-2">🛡️ 管理员专属惩罚池 ({punishments.length})</span>
                <button onClick={handleLogout} className="text-gray-400 hover:text-red-500 flex items-center gap-1 text-sm"><LogOut size={16} /> 退出登录</button>
              </div>
              <div className="flex flex-col gap-3">
                <AnimatePresence>
                  {punishments.length === 0 && <motion.div className="text-gray-400 text-center py-8">惩罚池为空。</motion.div>}
                  {punishments.map((p, index) => (
                    <motion.div key={index} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.9, backgroundColor: '#fecdd3' }}
                      className="group flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white/80 p-4 rounded-2xl border border-transparent hover:border-purple-200 transition-all"
                    >
                      {editingIndex === index ? (
                        <div className="flex flex-1 w-full gap-2 items-center">
                          <input 
                            type="text" value={editText} onChange={(e) => setEditText(e.target.value)} 
                            className="flex-1 bg-white border border-purple-300 focus:border-purple-500 rounded-xl p-2 text-gray-800 outline-none text-sm font-bold w-full" 
                            autoFocus onKeyDown={(e) => { if(e.key === 'Enter') handleSaveEdit(index); if(e.key === 'Escape') setEditingIndex(null); }}
                          />
                          <button onClick={() => handleSaveEdit(index)} className="text-green-500 hover:bg-green-50 p-2 rounded-lg transition-colors shrink-0"><Save size={18} /></button>
                          <button onClick={() => setEditingIndex(null)} className="text-gray-400 hover:bg-gray-100 p-2 rounded-lg transition-colors shrink-0"><X size={18} /></button>
                        </div>
                      ) : (
                        <>
                          <span className="font-bold text-gray-700 break-words w-full sm:flex-1 pr-2 leading-relaxed">{p}</span>
                          <div className="flex gap-1 self-end sm:self-auto shrink-0 opacity-100 sm:opacity-50 sm:group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingIndex(index); setEditText(p); }} className="text-gray-400 hover:text-blue-500 transition-colors p-2 rounded-lg hover:bg-blue-50" title="编辑"><Edit2 size={18} /></button>
                            <button onClick={() => handleDelete(index)} className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50" title="删除"><Trash2 size={18} /></button>
                          </div>
                        </>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            {/* 列表 2：玩家 10 票自動通過區 */}
            <div className="bg-white/60 backdrop-blur-xl border border-pink-200 rounded-3xl p-6 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-pink-400"></div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-bold text-pink-600 flex items-center gap-2">✨ 玩家票选自动通过池 ({autoPunishments.length})</span>
                <span className="text-xs text-gray-400">满 10 赞自动进入此区</span>
              </div>
              <div className="flex flex-col gap-3">
                <AnimatePresence>
                  {autoPunishments.length === 0 && <motion.div className="text-gray-400 text-center py-8">目前没有自动通过的惩罚。</motion.div>}
                  {autoPunishments.map((p, index) => (
                    <motion.div key={`auto-${index}`} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.9, backgroundColor: '#fecdd3' }}
                      className="group flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white/80 p-4 rounded-2xl border border-transparent hover:border-pink-200 transition-all"
                    >
                      {editingAutoIndex === index ? (
                        <div className="flex flex-1 w-full gap-2 items-center">
                          <input 
                            type="text" value={editAutoText} onChange={(e) => setEditAutoText(e.target.value)} 
                            className="flex-1 bg-white border border-pink-300 focus:border-pink-500 rounded-xl p-2 text-gray-800 outline-none text-sm font-bold w-full" 
                            autoFocus onKeyDown={(e) => { if(e.key === 'Enter') handleSaveAutoEdit(index); if(e.key === 'Escape') setEditingAutoIndex(null); }}
                          />
                          <button onClick={() => handleSaveAutoEdit(index)} className="text-green-500 hover:bg-green-50 p-2 rounded-lg transition-colors shrink-0"><Save size={18} /></button>
                          <button onClick={() => setEditingAutoIndex(null)} className="text-gray-400 hover:bg-gray-100 p-2 rounded-lg transition-colors shrink-0"><X size={18} /></button>
                        </div>
                      ) : (
                        <>
                          <span className="font-bold text-gray-700 break-words w-full sm:flex-1 pr-2 leading-relaxed">{p}</span>
                          <div className="flex gap-1 self-end sm:self-auto shrink-0 opacity-100 sm:opacity-50 sm:group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingAutoIndex(index); setEditAutoText(p); }} className="text-gray-400 hover:text-blue-500 transition-colors p-2 rounded-lg hover:bg-blue-50" title="编辑"><Edit2 size={18} /></button>
                            <button onClick={() => handleDeleteAuto(index)} className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50" title="删除"><Trash2 size={18} /></button>
                          </div>
                        </>
                      )}
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