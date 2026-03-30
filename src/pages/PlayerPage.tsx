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
      // 獲取管理員手動懲罰池
      const resPool = await fetch(`${UPSTASH_URL}/get/punishment_list`, { headers: { Authorization: `Bearer ${READ_ONLY_TOKEN}` } });
      const manualPool = safeJSONParse(await resPool.json().then((d: any) => d.result), []);

      // 獲取自動通過懲罰池
      const resAuto = await fetch(`${UPSTASH_URL}/get/auto_punishment_list`, { headers: { Authorization: `Bearer ${READ_ONLY_TOKEN}` } });
      const autoPool = safeJSONParse(await resAuto.json().then((d: any) => d.result), []);

      // 合併兩個池子作為前台抽獎用
      setPunishments([...manualPool, ...autoPool]);

      const resHist = await fetch(`${UPSTASH_URL}/get/draw_history`, { headers: { Authorization: `Bearer ${READ_ONLY_TOKEN}` } });
      const dataHist = await resHist.json();
      const rawHistory = safeJSONParse(dataHist.result, []);
      
      // 過濾掉超過 72 小時的舊紀錄
      const SEVENTY_TWO_HOURS = 72 * 60 * 60 * 1000;
      const validHistory = (Array.isArray(rawHistory) ? rawHistory : []).filter((item: any) => {
        if (!item.timestamp) return false; 
        return (Date.now() - item.timestamp) < SEVENTY_TWO_HOURS;
      });
      setHistory(validHistory);

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
    
    // 1. 立即決定最終結果
    const finalResult = punishments[Math.floor(Math.random() * punishments.length)];
    
    // 2. 防作弊核心：在動畫開始前，"立即" 寫入後端資料庫
    const newEntry = { text: finalResult, time: new Date().toLocaleString(), timestamp: Date.now() };
    const SEVENTY_TWO_HOURS = 72 * 60 * 60 * 1000;
    
    // 過濾出 72 小時內的歷史，加上最新這筆，並嚴格保留最多 50 筆 (slice(0, 50) 會丟棄第 51 筆最舊紀錄)
    const currentHistory = Array.isArray(history) ? history : [];
    const validHistory = currentHistory.filter(item => item.timestamp && (Date.now() - item.timestamp) < SEVENTY_TWO_HOURS);
    const updatedHistoryForDB = [newEntry, ...validHistory].slice(0, 50);

    // 背景發送 API 鎖定抽獎結果，玩家重整也無效
    fetch(`${UPSTASH_URL}/set/draw_history`, { 
      method: 'POST', 
      headers: { Authorization: `Bearer ${HIDDEN_WRITE_TOKEN}`, 'Content-Type': 'application/json' }, 
      body: JSON.stringify(updatedHistoryForDB) 
    }).catch(err => console.error("History save error:", err));

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
        
        // 動畫完全播完後，才更新畫面上的歷史紀錄列表，避免提前暴雷
        setHistory(updatedHistoryForDB);
        
        playWinSound();
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([100, 50, 100]); 
        const defaults: confetti.Options = { spread: 360, ticks: 100, gravity: 0.5, decay: 0.94, startVelocity: 30, shapes: ['star'], colors: ['#FFE400', '#FFBD00', '#E89400', '#FFCA6C', '#FDFFB8', '#9333ea', '#ec4899'] };
        confetti({ ...defaults, particleCount: 80, origin: { x: 0.5, y: 0.5 } });
        setTimeout(() => confetti({ ...defaults, particleCount: 50, origin: { x: 0.2, y: 0.6 } }), 200);
        setTimeout(() => confetti({ ...defaults, particleCount: 50, origin: { x: 0.8, y: 0.6 } }), 400);
      }, 850);
    }, spinDuration); 
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
    
    let isAutoApproved = false;
    let approvedText = "";

    // 1. 樂觀更新 UI
    setPendingList(prev => {
      let newList = prev.map(p => {
        if (p.id === id) {
          const newUpvotes = p.upvotes + (type === 'up' ? 1 : 0);
          const newDownvotes = p.downvotes + (type === 'down' ? 1 : 0);
          if (newUpvotes >= 10) {
            isAutoApproved = true;
            approvedText = p.text;
          }
          return { ...p, upvotes: newUpvotes, downvotes: newDownvotes };
        }
        return p;
      });
      
      // 如果達標，直接從前台待審核清單移除
      if (isAutoApproved) {
        newList = newList.filter(p => p.id !== id);
      }
      return newList;
    });

    // 如果達標，樂觀更新到正式懲罰池 (前台馬上可以抽到)
    if (isAutoApproved) {
      setPunishments(prev => [...prev, approvedText]);
    }

    const newVoted = [...votedIds, id];
    setVotedIds(newVoted);
    localStorage.setItem('valo_voted_ids', JSON.stringify(newVoted));

    // 2. 背景同步到資料庫
    try {
      const res = await fetch(`${UPSTASH_URL}/get/pending_punishments`, { headers: { Authorization: `Bearer ${READ_ONLY_TOKEN}` } });
      let serverList = safeJSONParse((await res.json()).result, []).map((p: any) => typeof p === 'string' ? { id: Math.random().toString(36).substr(2, 9), text: p, upvotes: 0, downvotes: 0 } : p);
      
      const targetIndex = serverList.findIndex((p: any) => p.id === id);
      if (targetIndex !== -1) {
        serverList[targetIndex].upvotes += (type === 'up' ? 1 : 0);
        serverList[targetIndex].downvotes += (type === 'down' ? 1 : 0);
        
        if (serverList[targetIndex].upvotes >= 10) {
          // 達到 10 票，自動通過
          const textToAdd = serverList[targetIndex].text;
          serverList.splice(targetIndex, 1); // 從待審核移除
          
          // 更新待審核
          await fetch(`${UPSTASH_URL}/set/pending_punishments`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${HIDDEN_WRITE_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(serverList)
          });
          
          // 加入自動通過專屬池
          const resAuto = await fetch(`${UPSTASH_URL}/get/auto_punishment_list`, { headers: { Authorization: `Bearer ${READ_ONLY_TOKEN}` } });
          const autoList = safeJSONParse((await resAuto.json()).result, []);
          autoList.push(textToAdd);
          await fetch(`${UPSTASH_URL}/set/auto_punishment_list`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${HIDDEN_WRITE_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(autoList)
          });
        } else {
          // 未達 10 票，單純更新票數
          await fetch(`${UPSTASH_URL}/set/pending_punishments`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${HIDDEN_WRITE_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(serverList)
          });
        }
      }
    } catch (err) {}
  };

  return (
    <div 
      className="min-h-screen flex flex-col items-center p-4 md:p-6 relative overflow-x-clip text-gray-800 bg-cover bg-center bg-fixed"
      style={{ backgroundImage: 'url("/bg.png")' }}
    >
      <style>{`
        ::-webkit-scrollbar, body::-webkit-scrollbar, .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track, body::-webkit-scrollbar-track, .custom-scrollbar::-webkit-scrollbar-track { background: transparent !important; border-radius: 10px; }
        ::-webkit-scrollbar-thumb, body::-webkit-scrollbar-thumb, .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(192, 132, 252, 0.4); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover, body::-webkit-scrollbar-thumb:hover, .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgba(168, 85, 247, 0.8); }
      `}</style>

      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="z-10 flex flex-col items-center my-6 w-full relative">
        <div className="relative w-full py-6 flex items-center justify-center drop-shadow-[0_0_8px_#3b82f6] drop-shadow-[0_0_16px_#9333ea] drop-shadow-[0_0_35px_rgba(168,85,247,0.9)]">
          
          {/* 背景能量场与动态速度线 */}
          <div className="absolute inset-0 flex items-center justify-center -z-10 pointer-events-none">
            {/* 核心模糊光晕 */}
            <div className="absolute w-[250px] h-[100px] bg-[radial-gradient(circle,rgba(147,51,234,0.6)_0%,transparent_60%)] blur-2xl"></div>
            {/* 旋转速度线 */}
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 20, ease: "linear" }} className="absolute w-[350px] h-[350px] bg-[repeating-conic-gradient(transparent_0deg,rgba(168,85,247,0.2)_15deg,transparent_30deg,rgba(59,130,246,0.2)_45deg)] opacity-70 blur-xl" style={{ WebkitMaskImage: 'radial-gradient(circle, black 0%, transparent 65%)', maskImage: 'radial-gradient(circle, black 0%, transparent 65%)' }}></motion.div>
          </div>

          {/* 飞溅的蓝色/紫色粒子 */}
          <div className="absolute inset-0 flex items-center justify-center -z-10 pointer-events-none">
            <motion.div animate={{ y: [-20, 20, -20], x: [-10, 10, -10], opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }} className="absolute top-[10%] left-[25%] md:left-[35%] w-2 h-2 bg-blue-300 rounded-full shadow-[0_0_10px_#60a5fa]"></motion.div>
            <motion.div animate={{ y: [20, -20, 20], x: [10, -10, 10], opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut", delay: 0.5 }} className="absolute bottom-[10%] right-[25%] md:right-[35%] w-3 h-3 bg-purple-300 rounded-full shadow-[0_0_15px_#a855f7]"></motion.div>
            <motion.div animate={{ scale: [0.5, 1.5, 0.5], opacity: [0, 0.8, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay: 1 }} className="absolute top-[70%] right-[20%] md:right-[38%] w-1.5 h-1.5 bg-indigo-200 rounded-full shadow-[0_0_8px_#818cf8]"></motion.div>
            <motion.div animate={{ scale: [0.8, 1.2, 0.8], opacity: [0, 0.9, 0] }} transition={{ repeat: Infinity, duration: 2.5, delay: 0.2 }} className="absolute bottom-[70%] left-[20%] md:left-[38%] w-2.5 h-2.5 bg-purple-200 rounded-full shadow-[0_0_12px_#d8b4fe]"></motion.div>
          </div>

          {/* 底层：粗外框层 (6px 描边) */}
          <h1 className="absolute text-5xl md:text-6xl font-black tracking-widest text-transparent [-webkit-text-stroke:6px_#2e1065] text-center flex items-center">
            惩罚扭蛋机
          </h1>
          
          {/* 顶层：渐层文字层 (高饱和度彩色渐变，无描边) */}
          <h1 className="relative text-5xl md:text-6xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-pink-400 to-purple-500 text-center flex items-center">
            惩罚扭蛋机
          </h1>
          
        </div>
      </motion.div>

      <div className="z-10 w-full max-w-[105rem] mx-auto px-4 lg:px-8 flex flex-col lg:grid lg:grid-cols-10 gap-6 lg:gap-8 items-start justify-center">
        
        {/* 左側：當前懲罰池 */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="order-3 lg:order-1 lg:col-span-3 w-full bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-5 shadow-sm flex flex-col h-[600px] lg:h-[750px]">
          <div className="mb-2 text-sm font-bold text-purple-600 bg-purple-100/80 px-3 py-1.5 rounded-xl w-fit shadow-sm">
            KOOK ID: 80810454
          </div>
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
                <motion.div key="result" initial={{ scale: 0.3, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 200, damping: 15 }} className="absolute w-full px-4 flex flex-col items-center justify-center pointer-events-none">
                  
                  {/* 背景能量場與動態速度線 (已調整為深紫-桃粉色調) */}
                  <div className="absolute inset-0 flex items-center justify-center -z-10">
                    {/* 核心模糊光暈 - 調整為較強烈、深邃的紫色核心 */}
                    <div className="absolute w-[150%] h-[200%] bg-[radial-gradient(circle,rgba(88,28,135,0.7)_0%,transparent_65%)] blur-2xl"></div>
                    {/* 旋轉速度線 - 調整為紫色到桃粉色的間隔 */}
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 20, ease: "linear" }} className="absolute w-[200%] h-[300%] bg-[repeating-conic-gradient(transparent_0deg,rgba(107,33,168,0.2)_15deg,transparent_30deg,rgba(244,114,182,0.25)_45deg)] opacity-70 blur-xl" style={{ WebkitMaskImage: 'radial-gradient(circle, black 0%, transparent 65%)', maskImage: 'radial-gradient(circle, black 0%, transparent 65%)' }}></motion.div>
                  </div>

                  {/* 飛濺的紫桃色粒子 (全數調整色調) */}
                  <div className="absolute inset-0 flex items-center justify-center -z-10">
                    <motion.div animate={{ y: [-20, 20, -20], x: [-10, 10, -10], opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }} className="absolute top-[-20%] left-[20%] w-2 h-2 bg-pink-300 rounded-full shadow-[0_0_10px_#f472b6]"></motion.div>
                    <motion.div animate={{ y: [20, -20, 20], x: [10, -10, 10], opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut", delay: 0.5 }} className="absolute bottom-[-30%] right-[25%] w-3 h-3 bg-purple-400 rounded-full shadow-[0_0_15px_#8b5cf6]"></motion.div>
                    <motion.div animate={{ scale: [0.5, 1.5, 0.5], opacity: [0, 0.8, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay: 1 }} className="absolute top-[30%] right-[10%] w-1.5 h-1.5 bg-pink-200 rounded-full shadow-[0_0_8px_#f472b6]"></motion.div>
                    <motion.div animate={{ scale: [0.8, 1.2, 0.8], opacity: [0, 0.9, 0] }} transition={{ repeat: Infinity, duration: 2.5, delay: 0.2 }} className="absolute bottom-[20%] left-[15%] w-2.5 h-2.5 bg-purple-300 rounded-full shadow-[0_0_12px_#a78bfa]"></motion.div>
                  </div>

                  {/* 主文字 (調整發光與外框為深紫-桃粉漸層) */}
                  <div className="relative w-full py-4 flex items-center justify-center drop-shadow-[0_0_8px_#818cf8] drop-shadow-[0_0_20px_#a855f7] drop-shadow-[0_0_40px_rgba(244,114,182,0.8)]">
                    
                    {/* 底層：粗外框層 (6px 透明描邊 + 深紫-桃粉漸層背景，製造出深邃外框感) */}
                    <span className={`absolute w-full font-black tracking-widest text-transparent [-webkit-text-stroke:6px_transparent] bg-clip-text bg-gradient-to-r from-purple-800 to-pink-400 text-center break-words whitespace-normal ${getDynamicTextSize(result)}`}>
                      {result}
                    </span>
                    
                    {/* 頂層：漸層文字層 (純淨的白色系漸層，無描邊，讓內部白色最大化) */}
                    <span className={`relative w-full font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-blue-100 text-center break-words whitespace-normal ${getDynamicTextSize(result)}`}>
                      {result}
                    </span>
                    
                  </div>
                  
                </motion.div>
              )}
              {spinStatus === 'idle' && !result && (
                <motion.div key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute text-2xl font-bold text-gray-400 text-center pointer-events-none">
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
              <div className="flex items-center gap-2"><Vote size={20} className="text-pink-500"/> 待审核惩罚投票（满10票自动通过） </div>
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