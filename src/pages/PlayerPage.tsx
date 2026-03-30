import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UPSTASH_URL, READ_ONLY_TOKEN, HIDDEN_WRITE_TOKEN } from '../config';
import { Send, Clock, List, ThumbsUp, ThumbsDown, Vote } from 'lucide-react';
import confetti from 'canvas-confetti';

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

type PendingItem = { id: string; text: string; upvotes: number; downvotes: number };

// ================= 音頻引擎 =================
let globalAudioCtx: AudioContext | null = null;

const initAudio = () => {
  if (!globalAudioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) globalAudioCtx = new AudioContextClass();
  }
  if (globalAudioCtx && globalAudioCtx.state === 'suspended') {
    globalAudioCtx.resume();
  }
};

const playBeep = (freq = 400, type = 'square', duration = 0.015, vol = 0.1) => {
  if (!globalAudioCtx) return;
  const osc = globalAudioCtx.createOscillator();
  const gain = globalAudioCtx.createGain();
  osc.type = type as OscillatorType;
  osc.frequency.setValueAtTime(freq, globalAudioCtx.currentTime);
  gain.gain.setValueAtTime(vol, globalAudioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, globalAudioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(globalAudioCtx.destination);
  osc.start();
  osc.stop(globalAudioCtx.currentTime + duration);
};

const playWinSound = () => {
  [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
    setTimeout(() => playBeep(freq, 'triangle', 0.6, 0.3), i * 100);
  });
};

// ================= 主程式 =================
export default function PlayerPage() {
  const [punishments, setPunishments] = useState<string[]>([]);
  const [history, setHistory] = useState<{text: string, time: string, timestamp?: number}[]>([]);
  const [pendingList, setPendingList] = useState<PendingItem[]>([]);
  const [votedIds, setVotedIds] = useState<string[]>([]);
  const [spinStatus, setSpinStatus] = useState<'idle' | 'spinning' | 'landed'>('idle');
  const [result, setResult] = useState<string | null>(null);
  
  const [tape, setTape] = useState<string[]>([]);
  const [winIndex, setWinIndex] = useState(-1); 
  const [finalY, setFinalY] = useState(0);     

  const [suggestion, setSuggestion] = useState("");
  const [submitStatus, setSubmitStatus] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const fetchData = async () => {
    try {
      const resPool = await fetch(`${UPSTASH_URL}/get/punishment_list`, { headers: { Authorization: `Bearer ${READ_ONLY_TOKEN}` } });
      const dataPool = await resPool.json();
      setPunishments(safeJSONParse(dataPool.result, []));

      const resHist = await fetch(`${UPSTASH_URL}/get/draw_history`, { headers: { Authorization: `Bearer ${READ_ONLY_TOKEN}` } });
      const dataHist = await resHist.json();
      setHistory(safeJSONParse(dataHist.result, []));

      // 獲取並格式化待審核清單 (兼容舊的純字串資料)
      const resPend = await fetch(`${UPSTASH_URL}/get/pending_punishments`, { headers: { Authorization: `Bearer ${READ_ONLY_TOKEN}` } });
      const dataPend = await resPend.json();
      const rawPend = safeJSONParse(dataPend.result, []);
      const formattedPend = rawPend.map((p: any) => 
        typeof p === 'string' ? { id: Math.random().toString(36).substr(2, 9), text: p, upvotes: 0, downvotes: 0 } : p
      );
      setPendingList(formattedPend);
    } catch (err) {}
  };

  useEffect(() => {
    fetchData();
    const savedVotes = localStorage.getItem('valo_voted_ids');
    if (savedVotes) setVotedIds(JSON.parse(savedVotes));

    const createHeart = (e: MouseEvent, isClick = false) => {
      if (!isClick && Math.random() > 0.08) return; 
      const heart = document.createElement('div');
      heart.innerHTML = isClick ? '💖' : '❤️';
      heart.style.position = 'fixed';
      heart.style.left = (e.clientX - 10) + 'px';
      heart.style.top = (e.clientY - 10) + 'px';
      heart.style.pointerEvents = 'none';
      heart.style.zIndex = '9999';
      heart.style.fontSize = isClick ? '28px' : '14px';
      heart.style.willChange = 'transform, opacity'; 
      const rotate = Math.random() * 60 - 30;
      heart.style.transform = `rotate(${rotate}deg)`;
      heart.style.transition = 'transform 1s ease-out, opacity 1s ease-out';
      document.body.appendChild(heart);
      setTimeout(() => {
        heart.style.transform = `translateY(-60px) scale(${isClick ? 1.5 : 0.5}) rotate(${rotate}deg)`;
        heart.style.opacity = '0';
      }, 10);
      setTimeout(() => heart.remove(), 1000);
    };

    window.addEventListener('mousemove', (e) => createHeart(e, false));
    window.addEventListener('click', (e) => createHeart(e, true));

    return () => {
      window.removeEventListener('mousemove', (e) => createHeart(e, false));
      window.removeEventListener('click', (e) => createHeart(e, true));
    };
  }, []);

  const getDynamicTextSize = (text: string) => {
    if (!text) return "text-4xl md:text-6xl";
    if (text.length > 25) return "text-2xl md:text-3xl leading-snug";
    if (text.length > 15) return "text-3xl md:text-4xl leading-snug";
    if (text.length > 8) return "text-4xl md:text-5xl leading-tight";
    return "text-5xl md:text-7xl tracking-wide";
  };

  const handleDraw = () => {
    if (punishments.length === 0 || spinStatus !== 'idle') return;
    initAudio();
    confetti.reset();
    setSpinStatus('spinning');
    setResult(null); 
    
    const finalResult = punishments[Math.floor(Math.random() * punishments.length)];
    const newTape = Array.from({ length: 70 }, () => punishments[Math.floor(Math.random() * punishments.length)]);
    const targetIndex = 45 + Math.floor(Math.random() * 10);
    newTape[targetIndex] = finalResult; 
    setTape(newTape);
    setWinIndex(targetIndex);

    const baseFinalY = 150 - (targetIndex * 80);
    const randomOffset = (Math.random() * 60) - 30; 
    setFinalY(baseFinalY + randomOffset);

    const spinDuration = 3500; 
    const start = Date.now();

    const rollAudio = () => {
      const elapsed = Date.now() - start;
      if (elapsed > spinDuration - 150) return; 
      playBeep(180 + Math.random() * 80, 'square', 0.015, 0.1);
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10); 
      const progress = elapsed / spinDuration;
      const nextDelay = 25 + Math.pow(progress, 3) * 400; 
      setTimeout(rollAudio, nextDelay);
    };
    rollAudio(); 

    setTimeout(() => {
      setSpinStatus('landed');
      setTimeout(() => {
        setSpinStatus('idle');
        setResult(finalResult);
        saveHistory(finalResult);
        playWinSound();
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([100, 50, 100]); 
        const defaults: confetti.Options = { spread: 360, ticks: 100, gravity: 0.5, decay: 0.94, startVelocity: 30, shapes: ['star'], colors: ['#FFE400', '#FFBD00', '#E89400', '#FFCA6C', '#FDFFB8', '#9333ea', '#ec4899'] };
        confetti({ ...defaults, particleCount: 80, origin: { x: 0.5, y: 0.5 } });
        setTimeout(() => confetti({ ...defaults, particleCount: 50, origin: { x: 0.2, y: 0.6 } }), 200);
        setTimeout(() => confetti({ ...defaults, particleCount: 50, origin: { x: 0.8, y: 0.6 } }), 400);
      }, 850);
    }, spinDuration); 
  };

  const saveHistory = async (drawnText: string) => {
    const newEntry = { text: drawnText, time: new Date().toLocaleString(), timestamp: Date.now() };
    const newHistory = [newEntry, ...history].slice(0, 50);
    try {
      await fetch(`${UPSTASH_URL}/set/draw_history`, { method: 'POST', headers: { Authorization: `Bearer ${HIDDEN_WRITE_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(newHistory) });
      setHistory(newHistory);
    } catch (err) {}
  };

  const handleSubmitSuggestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suggestion.trim()) return;
    setSubmitStatus("提交中...");
    try {
      const res = await fetch(`${UPSTASH_URL}/get/pending_punishments`, { headers: { Authorization: `Bearer ${READ_ONLY_TOKEN}` } });
      const currentRaw = safeJSONParse((await res.json()).result, []);
      const currentPending = currentRaw.map((p: any) => typeof p === 'string' ? { id: Math.random().toString(36).substr(2, 9), text: p, upvotes: 0, downvotes: 0 } : p);
      
      const newSuggestion: PendingItem = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        text: suggestion.trim(),
        upvotes: 0,
        downvotes: 0
      };

      const postRes = await fetch(`${UPSTASH_URL}/set/pending_punishments`, { 
        method: 'POST', 
        headers: { Authorization: `Bearer ${HIDDEN_WRITE_TOKEN}`, 'Content-Type': 'application/json' }, 
        body: JSON.stringify([...currentPending, newSuggestion]) 
      });

      if ((await postRes.json()).result === "OK") {
        setSubmitStatus("提交成功！等待审核。");
        setSuggestion("");
        setPendingList([...pendingList, newSuggestion]); // Optimistic update
        setCooldown(5); // 触发 5 秒冷却
        setTimeout(() => setSubmitStatus(""), 3000);
      }
    } catch (err) {
      setSubmitStatus("提交失败，请重试");
    }
  };

  const handleVote = async (id: string, type: 'up' | 'down') => {
    if (votedIds.includes(id)) return;
    
    // 樂觀更新 UI (讓玩家立刻看到數字跳動)
    setPendingList(prev => prev.map(p => 
      p.id === id ? { ...p, upvotes: p.upvotes + (type === 'up' ? 1 : 0), downvotes: p.downvotes + (type === 'down' ? 1 : 0) } : p
    ));
    const newVoted = [...votedIds, id];
    setVotedIds(newVoted);
    localStorage.setItem('valo_voted_ids', JSON.stringify(newVoted));

    // 背景同步到資料庫
    try {
      const res = await fetch(`${UPSTASH_URL}/get/pending_punishments`, { headers: { Authorization: `Bearer ${READ_ONLY_TOKEN}` } });
      let serverList = safeJSONParse((await res.json()).result, []).map((p: any) => typeof p === 'string' ? { id: Math.random().toString(36).substr(2, 9), text: p, upvotes: 0, downvotes: 0 } : p);
      const updatedList = serverList.map((p: any) => p.id === id ? { ...p, upvotes: p.upvotes + (type === 'up' ? 1 : 0), downvotes: p.downvotes + (type === 'down' ? 1 : 0) } : p);
      
      await fetch(`${UPSTASH_URL}/set/pending_punishments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${HIDDEN_WRITE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedList)
      });
    } catch (err) {}
  };

  return (
    <div className="min-h-screen bg-[#f3f4f6] flex flex-col items-center p-4 md:p-6 relative overflow-x-clip text-gray-800">
      <style>{`
        ::-webkit-scrollbar, body::-webkit-scrollbar, .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track, body::-webkit-scrollbar-track, .custom-scrollbar::-webkit-scrollbar-track { background: transparent !important; border-radius: 10px; }
        ::-webkit-scrollbar-thumb, body::-webkit-scrollbar-thumb, .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(192, 132, 252, 0.4); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover, body::-webkit-scrollbar-thumb:hover, .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgba(168, 85, 247, 0.8); }
      `}</style>

      {/* GPU 硬體加速背景 */}
      <div className="absolute top-0 -left-20 w-[30rem] h-[30rem] bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob" style={{ transform: 'translateZ(0)', willChange: 'transform' }}></div>
      <div className="absolute top-40 -right-20 w-[30rem] h-[30rem] bg-pink-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000" style={{ transform: 'translateZ(0)', willChange: 'transform' }}></div>
      <div className="absolute -bottom-32 left-1/3 w-[30rem] h-[30rem] bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-4000" style={{ transform: 'translateZ(0)', willChange: 'transform' }}></div>

      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="z-10 flex flex-col items-center my-6">
        <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-500 tracking-wide drop-shadow-sm flex items-center">
          惩罚扭蛋机
        </h1>
      </motion.div>

      <div className="z-10 w-full max-w-[105rem] mx-auto px-4 lg:px-8 flex flex-col lg:grid lg:grid-cols-10 gap-6 lg:gap-8 items-start justify-center">
        
        {/* 左側：當前懲罰池 */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="order-3 lg:order-1 lg:col-span-3 w-full bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-5 shadow-sm flex flex-col h-[600px] lg:h-[750px]">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 border-b border-gray-200 pb-3">
            <List size={20} className="text-purple-500"/> 当前惩罚池 ({punishments.length})
          </h3>
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
            {punishments.length === 0 ? (
              <p className="text-gray-400 text-center py-10 text-sm">惩罚池为空，请管理员添加</p>
            ) : (
              <div className="flex flex-col gap-3">
                {punishments.map((p, index) => (
                  <div key={index} className="bg-white/80 p-4 rounded-2xl border border-purple-50 shadow-sm text-gray-700 font-bold hover:border-purple-200 hover:shadow-md transition-all text-sm break-words flex gap-2">
                    <span className="text-purple-400 font-black min-w-[1.5rem]">{index + 1}.</span> 
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* 中間：抽獎區 */}
        <div className="order-1 lg:order-2 lg:col-span-4 w-full flex flex-col gap-6">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full h-[380px] bg-white/50 backdrop-blur-xl border border-white/80 rounded-3xl shadow-sm flex flex-col items-center justify-center relative overflow-hidden p-6 text-center">
            <AnimatePresence>
              {(spinStatus === 'spinning' || spinStatus === 'landed') && (
                <div className="absolute top-1/2 left-0 right-0 h-[80px] -translate-y-1/2 z-20 pointer-events-none box-border flex items-center justify-center">
                    <motion.div initial={{ width: 0 }} animate={{ width: '45%' }} exit={{ width: 0 }} transition={{ duration: 0.3, delay: 0.2 }} className="h-[2px] bg-purple-500 shadow-[0_0_15px_3px_rgba(168,85,247,0.7)]" />
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, delay: 0.5 }} className="w-[10px] h-[10px] bg-purple-600 rounded-full shadow-[0_0_20px_6px_rgba(168,85,247,0.9)]" />
                    <motion.div initial={{ width: 0 }} animate={{ width: '45%' }} exit={{ width: 0 }} transition={{ duration: 0.3, delay: 0.2 }} className="h-[2px] bg-purple-500 shadow-[0_0_15px_3px_rgba(168,85,247,0.7)]" />
                </div>
              )}
            </AnimatePresence>

            <div className="absolute inset-0 w-full overflow-hidden pointer-events-none" style={{ maskImage: 'linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%)' }}>
              <AnimatePresence>
                {(spinStatus === 'spinning' || spinStatus === 'landed') && (
                  <motion.div
                    initial={{ y: 0 }} animate={{ y: finalY }} transition={{ duration: 3.5, ease: [0.15, 0.9, 0.25, 1] }} 
                    className="absolute top-0 left-0 w-full flex flex-col" style={{ willChange: "transform" }}
                  >
                    {tape.map((item, i) => (
                      <div key={i} className="h-[80px] w-full flex items-center justify-center px-8 py-1.5">
                        <div className={`w-full h-full bg-white rounded-xl shadow-sm border-2 flex items-center justify-center px-4 transition-colors ${spinStatus === 'landed' && i === winIndex ? 'border-purple-500 bg-purple-50' : 'border-gray-100'}`}>
                          <span className={`font-bold text-xl md:text-2xl truncate ${spinStatus === 'landed' && i === winIndex ? 'text-purple-700' : 'text-gray-500'}`}>{item}</span>
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {spinStatus === 'idle' && result && (
                <motion.div key="result" initial={{ scale: 0.3, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 200, damping: 15 }} className={`absolute font-black text-transparent bg-clip-text bg-gradient-to-br from-purple-700 via-pink-600 to-orange-500 drop-shadow-[0_4px_4px_rgba(0,0,0,0.15)] w-full px-4 text-center break-words whitespace-normal py-2 ${getDynamicTextSize(result)}`}>{result}</motion.div>
              )}
              {spinStatus === 'idle' && !result && (
                <motion.div key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute text-2xl font-bold text-gray-400 text-center">
                  {punishments.length === 0 ? "请先添加惩罚" : "准备就绪"}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="absolute bottom-6 z-20">
              <button onClick={handleDraw} disabled={spinStatus !== 'idle' || punishments.length === 0} className="px-14 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xl font-bold rounded-full shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-300 disabled:opacity-50 disabled:hover:scale-100">
                {spinStatus !== 'idle' ? '系统抽取中...' : '开始抽取'}
              </button>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-5 shadow-sm">
            <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2 border-b border-gray-200 pb-2">
              <Clock size={20} className="text-pink-500"/> 历史记录 (仅保留 72 小时)
            </h3>
            <div className="max-h-72 lg:max-h-80 overflow-y-auto pr-2 custom-scrollbar overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
              {history.length === 0 ? (
                <p className="text-gray-400 text-center py-6 text-sm">暂无抽取记录</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {history.map((item, index) => (
                    <div key={index} className="flex justify-between items-center bg-white/80 p-3 rounded-2xl border border-pink-50 hover:border-pink-200 transition-colors">
                      <span className="font-bold text-gray-700 text-sm flex-1 break-words mr-4">{item.text}</span>
                      <span className="text-xs text-gray-400 font-medium bg-gray-100 px-2 py-1 rounded-full whitespace-nowrap">{item.time.split(' ')[1]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* 右側：分為提交區與投票區 */}
        <div className="order-2 lg:order-3 lg:col-span-3 w-full flex flex-col gap-6">
          
          {/* 區塊 A：提交新懲罰 */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="w-full bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-5 shadow-sm flex flex-col">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 border-b border-gray-200 pb-3">
              <Send size={20} className="text-purple-500"/> 提议新惩罚
            </h3>
            <p className="text-xs text-gray-500 mb-4">想到了够狠的惩罚？提交给管理员审核吧！</p>
            <form onSubmit={handleSubmitSuggestion} className="flex flex-col gap-4">
              <textarea value={suggestion} onChange={(e) => setSuggestion(e.target.value)} rows={3} className="w-full bg-white/70 border border-purple-100 focus:border-purple-400 rounded-2xl p-4 text-gray-800 outline-none transition-all shadow-inner resize-none custom-scrollbar text-sm" placeholder="在这里输入你的邪恶计划..." />
              <button type="submit" disabled={!suggestion.trim() || cooldown > 0} className="w-full bg-purple-500 text-white py-3 rounded-2xl font-bold hover:bg-purple-600 transition-colors disabled:opacity-50">
                {cooldown > 0 ? `提交冷却中 (${cooldown}s)` : '提交审核'}
              </button>
            </form>
            <AnimatePresence>
              {submitStatus && <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm mt-3 text-center text-purple-600 font-bold">{submitStatus}</motion.p>}
            </AnimatePresence>
          </motion.div>

          {/* 區塊 B：玩家投票區 */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }} className="w-full bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-5 shadow-sm flex flex-col h-[400px]">
             <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center gap-2"><Vote size={20} className="text-pink-500"/> 待审核惩罚投票 </div>
              <span className="text-xs bg-pink-100 text-pink-600 px-2 py-1 rounded-full">{pendingList.length} 个待审</span>
            </h3>
            <p className="text-xs text-gray-500 mb-4">管理觉得一般或看不懂所以放着没管 大家觉得好玩就通过</p>
            
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
              {pendingList.length === 0 ? (
                <p className="text-gray-400 text-center py-10 text-sm">目前没有待审核的提议</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {pendingList.map((p) => {
                    const hasVoted = votedIds.includes(p.id);
                    return (
                      <div key={p.id} className="bg-white/80 p-4 rounded-2xl border border-pink-50 shadow-sm flex flex-col gap-3 hover:border-pink-200 transition-colors">
                        <span className="font-bold text-gray-700 text-sm break-words leading-relaxed">{p.text}</span>
                        <div className="flex gap-2 justify-end mt-1">
                          <button onClick={() => handleVote(p.id, 'up')} disabled={hasVoted} className={`flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-bold transition-all ${hasVoted ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-green-50 text-green-600 hover:bg-green-100 hover:scale-105 active:scale-95'}`}>
                            <ThumbsUp size={14}/> {p.upvotes || 0}
                          </button>
                          <button onClick={() => handleVote(p.id, 'down')} disabled={hasVoted} className={`flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-bold transition-all ${hasVoted ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-red-50 text-red-600 hover:bg-red-100 hover:scale-105 active:scale-95'}`}>
                            <ThumbsDown size={14}/> {p.downvotes || 0}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </motion.div>

        </div>
      </div>

      <a href="#/admin" className="fixed bottom-4 right-4 text-gray-400 hover:text-purple-500 transition-colors opacity-30 hover:opacity-100 z-50">⚙️</a>
    </div>
  );
}