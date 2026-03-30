import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UPSTASH_URL, READ_ONLY_TOKEN, HIDDEN_WRITE_TOKEN } from '../config';
import { Send, Clock, List, Sparkles } from 'lucide-react';

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

export default function PlayerPage() {
  const [punishments, setPunishments] = useState<string[]>([]);
  const [history, setHistory] = useState<{text: string, time: string}[]>([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [currentDisplay, setCurrentDisplay] = useState("准备就绪");
  const [result, setResult] = useState<string | null>(null);
  
  const [suggestion, setSuggestion] = useState("");
  const [submitStatus, setSubmitStatus] = useState("");

  const fetchData = async () => {
    try {
      const resPool = await fetch(`${UPSTASH_URL}/get/punishment_list`, { headers: { Authorization: `Bearer ${READ_ONLY_TOKEN}` } });
      const dataPool = await resPool.json();
      setPunishments(safeJSONParse(dataPool.result, []));

      const resHist = await fetch(`${UPSTASH_URL}/get/draw_history`, { headers: { Authorization: `Bearer ${READ_ONLY_TOKEN}` } });
      const dataHist = await resHist.json();
      setHistory(safeJSONParse(dataHist.result, []));
    } catch (err) {
      console.error("数据获取失败", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getDynamicTextSize = (text: string) => {
    if (!text) return "text-4xl md:text-6xl";
    if (text.length > 25) return "text-lg md:text-2xl leading-snug";
    if (text.length > 15) return "text-2xl md:text-3xl leading-snug";
    if (text.length > 8) return "text-3xl md:text-4xl leading-tight";
    return "text-4xl md:text-6xl tracking-wide";
  };

  const handleDraw = () => {
    if (punishments.length === 0 || isSpinning) return;
    setIsSpinning(true);
    
    const lastResult = result;
    let counter = 0;
    const maxSpins = 25;
    
    const spinInterval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * punishments.length);
      setCurrentDisplay(punishments[randomIndex]);
      counter++;

      if (counter >= maxSpins) {
        clearInterval(spinInterval);
        
        let finalIndex;
        if (punishments.length > 1) {
          do {
            finalIndex = Math.floor(Math.random() * punishments.length);
          } while (punishments[finalIndex] === lastResult);
        } else {
          finalIndex = 0;
        }

        const finalResult = punishments[finalIndex];
        setResult(finalResult);
        setIsSpinning(false);
        saveHistory(finalResult);
      }
    }, 100);
  };

  const saveHistory = async (drawnText: string) => {
    const newEntry = { text: drawnText, time: new Date().toLocaleString() };
    const newHistory = [newEntry, ...history].slice(0, 50);
    try {
      await fetch(`${UPSTASH_URL}/set/draw_history`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${HIDDEN_WRITE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(newHistory)
      });
      setHistory(newHistory);
    } catch (err) {}
  };

  const handleSubmitSuggestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suggestion.trim()) return;
    setSubmitStatus("提交中...");
    try {
      const res = await fetch(`${UPSTASH_URL}/get/pending_punishments`, { headers: { Authorization: `Bearer ${READ_ONLY_TOKEN}` } });
      const data = await res.json();
      const currentPending = safeJSONParse(data.result, []);
      const newPending = [...currentPending, suggestion.trim()];

      const postRes = await fetch(`${UPSTASH_URL}/set/pending_punishments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${HIDDEN_WRITE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(newPending)
      });
      if ((await postRes.json()).result === "OK") {
        setSubmitStatus("提交成功！等待审核。");
        setSuggestion("");
        setTimeout(() => setSubmitStatus(""), 3000);
      }
    } catch (err) {
      setSubmitStatus("提交失败，请重试");
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f4f6] flex flex-col items-center p-4 md:p-6 relative overflow-x-hidden text-gray-800">
      <div className="absolute top-0 -left-20 w-[30rem] h-[30rem] bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob"></div>
      <div className="absolute top-40 -right-20 w-[30rem] h-[30rem] bg-pink-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-32 left-1/3 w-[30rem] h-[30rem] bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-4000"></div>

      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="z-10 flex flex-col items-center my-6">
        <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-500 tracking-wide drop-shadow-sm flex items-center gap-3">
          <Sparkles className="text-pink-500" size={36} /> 惩罚扭蛋机
        </h1>
        <p className="text-gray-500 font-medium mt-2 tracking-widest text-sm">SURVIVAL_ROULETTE // PROTOCOL</p>
      </motion.div>

      {/* 佈局容器：將 max-w 加寬，並使用 12 欄網格分配 */}
      <div className="z-10 w-full max-w-[90rem] flex flex-col lg:grid lg:grid-cols-12 gap-6 items-start">
        
        {/* ================= 左側：當前懲罰池 (佔 4/12 欄) - 手機排第 3 ================= */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} 
          className="order-3 lg:order-1 lg:col-span-4 w-full bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-5 shadow-sm flex flex-col h-[600px] lg:h-[750px]">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 border-b border-gray-200 pb-3">
            <List size={20} className="text-purple-500"/> 当前惩罚池 ({punishments.length})
          </h3>
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {punishments.length === 0 ? (
              <p className="text-gray-400 text-center py-10 text-sm">惩罚池为空，请管理员添加</p>
            ) : (
              <div className="flex flex-col gap-3">
                {punishments.map((p, index) => (
                  <div key={index} className="bg-white/80 p-4 rounded-2xl border border-purple-50 shadow-sm text-gray-700 font-bold hover:border-purple-200 hover:shadow-md transition-all text-sm break-words flex gap-2">
                    {/* 加入動態編號，顏色稍淡以凸顯內文 */}
                    <span className="text-purple-400 font-black min-w-[1.5rem]">{index + 1}.</span> 
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* ================= 中間：抽獎區與歷史記錄 (佔 5/12 欄) - 手機排第 1 ================= */}
        <div className="order-1 lg:order-2 lg:col-span-5 w-full flex flex-col gap-6">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full h-[380px] bg-white/50 backdrop-blur-xl border border-white/80 rounded-3xl shadow-sm flex flex-col items-center justify-center relative overflow-hidden p-6 text-center">
            <div className="w-full px-4 mb-16 flex items-center justify-center h-full">
              <AnimatePresence mode="wait">
                {isSpinning ? (
                  <motion.div key="spinning" className={`font-bold text-gray-400 blur-[1px] w-full break-words whitespace-normal ${getDynamicTextSize(currentDisplay)}`}>
                    {currentDisplay}
                  </motion.div>
                ) : result ? (
                  <motion.div key="result" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 120, damping: 12 }} 
                    className={`font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-500 drop-shadow-sm w-full break-words whitespace-normal py-2 ${getDynamicTextSize(result)}`}
                  >
                    {result}
                  </motion.div>
                ) : (
                  <motion.div key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-2xl font-bold text-gray-400">
                    {punishments.length === 0 ? "请先添加惩罚" : "准备就绪"}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="absolute bottom-8">
              <button onClick={handleDraw} disabled={isSpinning || punishments.length === 0} className="px-14 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xl font-bold rounded-full shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-300 disabled:opacity-50 disabled:hover:scale-100">
                {isSpinning ? '抽取中...' : '开始抽取'}
              </button>
            </div>
          </motion.div>

          {/* 歷史記錄卡片 (增高 max-h-72) */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-5 shadow-sm">
            <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2 border-b border-gray-200 pb-2">
              <Clock size={20} className="text-pink-500"/> 历史记录
            </h3>
            <div className="max-h-72 lg:max-h-80 overflow-y-auto pr-2 custom-scrollbar">
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

        {/* ================= 右側：提交建議區 (佔 3/12 欄) - 手機排第 2 ================= */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} 
          className="order-2 lg:order-3 lg:col-span-3 w-full bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-5 shadow-sm flex flex-col h-[380px]">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 border-b border-gray-200 pb-3">
            <Send size={20} className="text-purple-500"/> 提议新惩罚
          </h3>
          <p className="text-xs text-gray-500 mb-4">想到了够狠的惩罚？提交给管理员审核吧！</p>
          
          <form onSubmit={handleSubmitSuggestion} className="flex flex-col gap-4 flex-1">
            <textarea 
              value={suggestion} 
              onChange={(e) => setSuggestion(e.target.value)} 
              className="flex-1 w-full bg-white/70 border border-purple-100 focus:border-purple-400 rounded-2xl p-4 text-gray-800 outline-none transition-all shadow-inner resize-none custom-scrollbar text-sm"
              placeholder="在这里输入你的邪恶计划..."
            />
            <button type="submit" disabled={!suggestion.trim()} className="w-full bg-purple-500 text-white py-4 rounded-2xl font-bold hover:bg-purple-600 transition-colors disabled:opacity-50">
              提交审核
            </button>
          </form>
          
          <AnimatePresence>
            {submitStatus && (
              <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm mt-3 text-center text-purple-600 font-bold">
                {submitStatus}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>

      </div>

      <a href="#/admin" className="fixed bottom-4 right-4 text-gray-400 hover:text-purple-500 transition-colors opacity-30 hover:opacity-100 z-50">
        ⚙️
      </a>
    </div>
  );
}