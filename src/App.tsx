/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { Player, Match, Prediction, MatchOdds, LeaderboardEntry } from './types';
import MatchList from './components/MatchList';
import StatsDashboard from './components/StatsDashboard';
import AdminPanel from './components/AdminPanel';
import OutrightPredictions from './components/OutrightPredictions';
import {
  Trophy,
  Activity,
  Users,
  Layout,
  User,
  LogOut,
  Phone,
  Play,
  Award,
  AlertTriangle,
  Clock,
  Sparkles,
  Info,
  Calendar,
  ChevronDown,
  ChevronUp,
  Star,
} from 'lucide-react';

export default function App() {
  // State variables
  const [player, setPlayer] = useState<Player | null>(null);
  const [phoneNumberInput, setPhoneNumberInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [requiresRegistration, setRequiresRegistration] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [selectedPlayerName, setSelectedPlayerName] = useState('');

  // Rules visibility states (initially collapsed)
  const [showRules, setShowRules] = useState(false);
  
  // Selected hall of fame member to pop up
  const [selectedHallOfFamer, setSelectedHallOfFamer] = useState<{
    name: string;
    points: number;
    rank: number;
    title: string;
    medal: string;
    bgColor: string;
    textColor: string;
    outlineColor: string;
    description: string;
  } | null>(null);

  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [odds, setOdds] = useState<Record<string, MatchOdds>>({});
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [serverTime, setServerTime] = useState<string>(new Date().toISOString());
  const [isSimulatingTime, setIsSimulatingTime] = useState(false);

  const [activeTab, setActiveTab] = useState<'MATCHES' | 'LEADERBOARD' | 'STATS' | 'ADMIN'>('MATCHES');
  const [showOutrightsPanel, setShowOutrightsPanel] = useState(false);
  const [searchLeaderboardQuery, setSearchLeaderboardQuery] = useState('');
  const [countdownString, setCountdownString] = useState('');
  
  // Custom Toast System
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Trigger non-blocking notifications
  const notify = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // 1. Initial State Fetchers
  const refreshData = async () => {
    try {
      // Get server clock
      const timeRes = await fetch('/api/server-info');
      if (timeRes.ok) {
        const timeData = await timeRes.json();
        setServerTime(timeData.currentTime);
        setIsSimulatingTime(timeData.isSimulating);
      }

      // Get Matches
      const matchesHeaders: Record<string, string> = {};
      const savedCode = localStorage.getItem('wc_playerPhone');
      if (player && player.name === 'Usr-Bop') {
        matchesHeaders['x-admin-code'] = player.phoneNumber;
      } else if (savedCode) {
        matchesHeaders['x-admin-code'] = savedCode;
      }

      const matchesRes = await fetch('/api/matches', { headers: matchesHeaders });
      if (matchesRes.ok) {
        const data = await matchesRes.json();
        setMatches(data.matches);
      }

      // Get Leaderboard
      const lbRes = await fetch('/api/leaderboard');
      let latestLeaderboard: LeaderboardEntry[] = [];
      if (lbRes.ok) {
        const data = await lbRes.json();
        setLeaderboard(data.leaderboard);
        latestLeaderboard = data.leaderboard;
        if (data.leaderboard.length > 0) {
          setSelectedPlayerName((prev) => prev || data.leaderboard[0].name);
        }
      }

      // Get Odds
      const oddsRes = await fetch('/api/odds');
      if (oddsRes.ok) {
        const data = await oddsRes.json();
        const oddsMap: Record<string, MatchOdds> = {};
        data.odds.forEach((o: MatchOdds) => {
          oddsMap[o.matchId] = o;
        });
        setOdds(oddsMap);
      }

      // Refetch current user predictions if logged in
      if (player) {
        const predRes = await fetch(`/api/predictions/${player.phoneNumber}`);
        if (predRes.ok) {
          const predData = await predRes.json();
          const predsMap: Record<string, Prediction> = {};
          predData.predictions.forEach((p: Prediction) => {
            predsMap[`${p.playerPhone}_${p.matchId}`] = p;
          });
          setPredictions(predsMap);

          // Sync current player stats from updated leaderboard matching by unique name
          const playerStats = latestLeaderboard.find((l) => l.name === player.name);
          if (playerStats) {
            setPlayer({
              phoneNumber: player.phoneNumber, // retain secret code locally
              name: playerStats.name,
              score: playerStats.score,
              createdAt: playerStats.createdAt,
            });
          } else {
            // Player no longer exists in database (was reset)
            localStorage.removeItem('wc_playerPhone');
            setPlayer(null);
            setPredictions({});
          }
        }
      }
    } catch (e) {
      console.error('Không thể tải hoặc đồng bộ dữ liệu với máy chủ', e);
    }
  };

  // Handle Match Prediction Votes
  const handleVote = async (matchId: string, prediction: 'HOME' | 'DRAW' | 'AWAY') => {
    if (!player) {
      notify('Bạn phải đăng nhập để bình chọn bằng mã 6 số!', 'error');
      return;
    }

    try {
      const response = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerPhone: player.phoneNumber,
          matchId,
          prediction,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        notify(data.message || 'Lưu bình chọn nhận điểm thành công!', 'success');
        refreshData();
      } else {
        notify(data.error || 'Dự đoán thất bại, ván đấu có thể đã khóa.', 'error');
      }
    } catch (e) {
      notify('Lỗi kết nối máy chủ khi nộp dự đoán', 'error');
    }
  };

  // Handle clicking on a Hall of Fame member
  const handleHallOfFameClick = (member: {
    name: string;
    points: number;
    rank: number;
    title: string;
    medal: string;
    bgColor: string;
    textColor: string;
    outlineColor: string;
    description: string;
  }) => {
    setSelectedHallOfFamer(member);
    
    // Play spectacular interactive confetti burst patterns!
    
    // 1. Initial explosion from bottom center
    confetti({
      particleCount: 150,
      spread: 90,
      origin: { y: 0.6 },
      colors: ['#fbbf24', '#f59e0b', '#34d399', '#3b82f6', '#ec4899', '#ffffff']
    });

    // 2. Delayed fireworks bursts from left side
    setTimeout(() => {
      confetti({
        particleCount: 70,
        angle: 65,
        spread: 60,
        origin: { x: 0, y: 0.8 },
        colors: ['#fbbf24', '#34d399', '#ffffff', '#818cf8']
      });
    }, 150);

    // 3. Delayed fireworks bursts from right side
    setTimeout(() => {
      confetti({
        particleCount: 70,
        angle: 115,
        spread: 60,
        origin: { x: 1, y: 0.8 },
        colors: ['#fbbf24', '#e2e8f0', '#ffffff', '#fb7185']
      });
    }, 300);

    // 4. Sparkling star shower animation
    const duration = 1200;
    const animationEnd = Date.now() + duration;
    
    const randomInRange = (min: number, max: number) => {
      return Math.random() * (max - min) + min;
    };

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) {
        return clearInterval(interval);
      }
      
      const particleCount = 20 * (timeLeft / duration);
      
      confetti({
        particleCount,
        startVelocity: 30,
        spread: 360,
        ticks: 50,
        origin: { x: randomInRange(0.1, 0.9), y: randomInRange(0.1, 0.5) },
        colors: ['#fbbf24', '#34d399', '#f59e0b']
      });
    }, 100);
  };

  // Perform Login with a 6-char code
  const performLogin = async (codeValue: string, customName?: string, isRegister?: boolean) => {
    setLoginError('');
    const cleanCode = codeValue.trim();
    if (!cleanCode) {
      setLoginError('Vui lòng nhập mã số đăng nhập!');
      return;
    }
    if (cleanCode.length !== 6) {
      setLoginError('Mã số đăng nhập phải gồm đúng 6 ký tự / số!');
      return;
    }

    if (isRegister) {
      if (!nameInput.trim()) {
        setLoginError('Vui lòng nhập tên hiển thị!');
        return;
      }
    } else {
      if (!customName && !selectedPlayerName) {
        setLoginError('Vui lòng chọn hoặc nhập tài khoản của bạn!');
        return;
      }
    }

    try {
      const response = await fetch('/api/players/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: cleanCode,
          name: isRegister ? nameInput.trim() : (customName || selectedPlayerName),
          isRegister: !!isRegister,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setLoginError(data.error || 'Lỗi xử lý đăng nhập');
        return;
      }

      if (data.player) {
        // Complete login
        setPlayer(data.player);
        localStorage.setItem('wc_playerPhone', data.player.phoneNumber);
        setRequiresRegistration(false);
        setPhoneNumberInput('');
        setNameInput('');
        setLoginError('');
        setIsRegisterMode(false);
        notify(isRegister ? `Đăng ký & Đăng nhập thành công! Chào ${data.player.name}!` : `Chào mừng ${data.player.name} đã kết nối dự đoán!`, 'success');
        
        // Fetch predictions list right away
        const predRes = await fetch(`/api/predictions/${data.player.phoneNumber}`);
        if (predRes.ok) {
          const predData = await predRes.json();
          const predsMap: Record<string, Prediction> = {};
          predData.predictions.forEach((p: Prediction) => {
            predsMap[`${p.playerPhone}_${p.matchId}`] = p;
          });
          setPredictions(predsMap);
        }
        
        // Refresh everything to sync rankings
        refreshData();
      }
    } catch (error) {
      setLoginError('Lỗi kết nối máy chủ. Vui lòng kiểm tra và thử lại!');
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    performLogin(phoneNumberInput, undefined, isRegisterMode);
  };

  const handleSignOut = () => {
    localStorage.removeItem('wc_playerPhone');
    setPlayer(null);
    setPredictions({});
    setRequiresRegistration(false);
    notify('Đăng xuất thành công!', 'success');
  };

  // Load persistence logic on boot
  useEffect(() => {
    const checkPersistedUser = async () => {
      const savedPhone = localStorage.getItem('wc_playerPhone');
      if (savedPhone) {
        try {
          const res = await fetch('/api/players/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: savedPhone }),
          });
          const data = await res.json();
          if (res.ok && data.player) {
            setPlayer(data.player);
            // Fetch his predictions map
            const predRes = await fetch(`/api/predictions/${savedPhone}`);
            if (predRes.ok) {
              const predData = await predRes.json();
              const predsMap: Record<string, Prediction> = {};
              predData.predictions.forEach((p: Prediction) => {
                predsMap[`${p.playerPhone}_${p.matchId}`] = p;
              });
              setPredictions(predsMap);
            }
          }
        } catch (e) {
          console.error('Lỗi nạp tự động đăng nhập:', e);
        }
      }
    };

    checkPersistedUser();
    refreshData();
  }, []);

  // Set Interval Timer for Clock ticks + countdowns
  useEffect(() => {
    const timer = setInterval(() => {
      // 1. Advance Server Time Ticks locally if not simulating 
      if (!isSimulatingTime) {
        setServerTime(new Date().toISOString());
      }

      // 2. Compute Countdown to World Cup Opening (June 11, 2026 16:00 UTC)
      const targetTime = new Date('2026-06-11T16:00:00Z').getTime();
      const current = new Date(serverTime).getTime();
      const diff = targetTime - current;

      if (diff <= 0) {
        setCountdownString('ĐÃ KHAI MẠC GIẢI ĐẤU!');
      } else {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setCountdownString(`${days} ngày ${hours}h ${minutes}m ${seconds}s`);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [serverTime, isSimulatingTime]);

  // Sync every 30 seconds in the background to ensure updates while avoiding excessive server API spam
  useEffect(() => {
    const bgSync = setInterval(() => {
      refreshData();
    }, 30000);

    return () => clearInterval(bgSync);
  }, [player]);

  const filteredLeaderboard = leaderboard.filter((l) => {
    if (!searchLeaderboardQuery) return true;
    return l.name.toLowerCase().includes(searchLeaderboardQuery.toLowerCase());
  });

  // Helper calculation for user progress matching by Name
  const totalCorrect = player ? (leaderboard.find(l => l.name === player.name)?.correctCount ?? 0) : 0;
  const totalPredicted = player ? (leaderboard.find(l => l.name === player.name)?.predictedCount ?? 0) : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-white pb-12 antialiased">
      
      {/* Toast Alert Panel */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center space-x-3 py-3 px-6 rounded-2xl shadow-2xl border text-xs font-bold bg-slate-900 text-slate-100 border-slate-800`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header Panel in Bento Style */}
      <header className="max-w-7xl mx-auto mt-6 mb-6 flex flex-col md:flex-row justify-between items-center bg-slate-900/40 p-4.5 rounded-2xl border border-slate-850/80 backdrop-blur-md gap-4">
        
        {/* Brand/Logo Layout */}
        <div className="flex items-center gap-4 self-start md:self-auto">
          <div className="w-11 h-11 bg-gradient-to-br from-emerald-400 via-emerald-500 to-blue-600 rounded-xl flex items-center justify-center font-bold text-xl shadow-lg shadow-emerald-500/10 text-white font-display">
            W
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight uppercase font-display text-slate-100">
              World Cup 2026 <span className="text-emerald-400">Predictor</span>
            </h1>
            <p className="text-xs text-slate-400 font-medium">104 Matches • Live Performance Tracking</p>
          </div>
        </div>

        {/* Tournament Live Countdown Clock */}
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 w-full md:w-auto">
          {player && (
            <div className="hidden sm:block text-right">
              <p className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Phiên đăng nhập</p>
              <p className="text-sm font-mono text-emerald-400">{player.phoneNumber}</p>
            </div>
          )}

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl px-4 py-2 flex items-center space-x-4 w-full sm:w-auto justify-between sm:justify-start">
            <div className="space-y-0.5">
              <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest">Đếm ngược khai mạc (11/06)</span>
              <span className="block text-xs font-mono font-black text-rose-400 select-all tracking-tight">
                {countdownString}
              </span>
            </div>
            <div className="border-l border-slate-800/80 pl-4 space-y-0.5">
              <span className="block text-[9px] font-bold text-slate-505 uppercase tracking-widest flex items-center justify-start">
                <Clock className="w-3 h-3 text-emerald-400 mr-1 shrink-0" />
                <span>Giờ ảo {isSimulatingTime ? '🧪' : ''}</span>
              </span>
              <span className="block text-[11px] font-mono text-slate-300 font-bold">
                {new Date(serverTime).toLocaleTimeString('vi-VN')}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4">
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* SIDEBAR: Profile Card / Quick Login Module */}
          <div className="lg:col-span-1 space-y-4">
            
            {player ? (
              /* User profile when logged in (Bento styled card) */
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden group hover:border-slate-750 transition-all duration-300">
                <div className="absolute -right-6 -top-6 w-32 h-32 bg-gradient-to-br from-emerald-550/10 to-blue-500/0 rounded-full blur-2xl pointer-events-none" />
                
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <User className="w-4 h-4 text-emerald-450" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Tài khoản cá nhân</span>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                    title="Đăng xuất"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-100 truncate font-display">{player.name}</h3>
                    <p className="text-xs font-mono text-slate-450 mt-0.5">{player.phoneNumber}</p>
                  </div>

                  {/* Personal stats inner grids matching Bento Specs */}
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800/60">
                    <div className="bg-slate-950 p-3 rounded-2xl border border-slate-850/50">
                      <span className="block text-[10px] text-slate-550 font-bold uppercase tracking-wide">Dự đoán</span>
                      <span className="block font-mono text-lg font-black text-slate-100 mt-1">{totalPredicted} ván</span>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-2xl border border-slate-855/50">
                      <span className="block text-[10px] text-emerald-450 font-bold uppercase tracking-wide">Chính xác</span>
                      <span className="block font-mono text-lg font-black text-emerald-400 mt-1">{totalCorrect} ván</span>
                    </div>
                  </div>

                  {/* Core Score Badge */}
                  <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-blue-600 rounded-2xl p-4 text-center text-white shadow-xl relative overflow-hidden">
                    <div className="absolute -left-4 -bottom-4 text-white opacity-10 pointer-events-none">
                      <Trophy className="w-16 h-16" />
                    </div>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-emerald-100">Điểm số tích luỹ</span>
                    <span className="block text-4xl font-black mt-1 font-display tracking-tight">{player.score}</span>
                    
                    <div className="mt-2 inline-block bg-slate-950/20 border border-white/10 px-3 py-1 rounded-full text-[10px] font-bold text-white tracking-wide">
                      HẠNG #{leaderboard.findIndex(l => l.name === player.name) + 1} BẢNG ĐIỂM
                    </div>
                  </div>
                </div>

              </div>
            ) : (
              /* Refined login component with choice dropdown and register option */
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden group hover:border-slate-750 transition-all duration-300">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800/60">
                  <div className="flex items-center space-x-2">
                    <User className="w-4 h-4 text-emerald-450" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-display">
                      {isRegisterMode ? 'Đăng Ký Tài Khoản' : 'Chọn Vào Dự Đoán'}
                    </h3>
                  </div>
                  {/* Registration button hidden per user request */}
                </div>

                {/* Main Dynamic Form */}
                <form onSubmit={handleLoginSubmit} className="space-y-3.5">
                  {!isRegisterMode ? (
                    // LOGIN MODE
                    <>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Chọn tài khoản thành viên</label>
                        <select
                          value={selectedPlayerName}
                          onChange={(e) => setSelectedPlayerName(e.target.value)}
                          className="w-full bg-slate-950 text-xs text-slate-100 border border-slate-800 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 transition font-medium"
                        >
                          {leaderboard.length === 0 ? (
                            <option value="">(Chưa có thành viên nào)</option>
                          ) : (
                            leaderboard.map((item) => (
                              <option key={item.name} value={item.name}>
                                {item.name}
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 font-sans">Nhập mã số riêng (6 ký tự)</label>
                        <input
                          type="password"
                          maxLength={6}
                          value={phoneNumberInput}
                          onChange={(e) => setPhoneNumberInput(e.target.value)}
                          placeholder="Mã đăng nhập 6 số..."
                          className="w-full bg-slate-950 text-xs text-slate-100 border border-slate-800 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 transition font-mono tracking-widest text-center"
                        />
                      </div>
                    </>
                  ) : (
                    // REGISTRATION MODE
                    <>
                      <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-2xl text-[10.5px] text-slate-300 leading-relaxed font-sans mb-1">
                        🎯 Bạn hãy tự đặt Tên hiển thị và Mã số 6 ký tự / số ngẫu nhiên không quy luật của mình. Hãy lưu lại mã số này để sử dụng đăng nhập những lần sau!
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 font-sans font-sans">Tự chọn Mã số mật danh (đúng 6 ký tự / số)</label>
                        <input
                          type="text"
                          maxLength={6}
                          value={phoneNumberInput}
                          onChange={(e) => setPhoneNumberInput(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                          placeholder="Điền 6 ký số / tự tự chọn..."
                          className="w-full bg-slate-950 text-xs text-slate-100 border border-slate-800 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 transition font-mono text-center tracking-wider"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Đặt Họ và Tên hiển thị</label>
                        <input
                          type="text"
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          placeholder="Ví dụ: Usr-Dần, Usr-Mới..."
                          className="w-full bg-slate-950 text-xs text-slate-100 border border-slate-800 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 transition"
                        />
                      </div>
                    </>
                  )}

                  {loginError && <p className="text-rose-400 text-[11px] font-medium leading-normal bg-rose-950/20 px-2.5 py-1.5 rounded-lg border border-rose-500/15">{loginError}</p>}

                  <button
                    type="submit"
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition-all duration-200 flex items-center justify-center space-x-1.5 shadow-sm cursor-pointer active:scale-98"
                  >
                    <span>{isRegisterMode ? 'Đăng Ký & Đăng Nhập Hoạt Động' : 'Đăng Nhập Thành Viên'}</span>
                  </button>
                </form>
              </div>
            )}

            {/* Quick Helper guidelines Card (Bento styled, collapsible) */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 hover:border-slate-800/80 transition shadow-lg space-y-4">
              <button
                type="button"
                onClick={() => setShowRules(!showRules)}
                className="w-full flex items-center justify-between text-xs font-bold text-slate-350 uppercase tracking-wider font-display cursor-pointer select-none focus:outline-none"
              >
                <div className="flex items-center">
                  <Info className="w-4 h-4 text-emerald-450 mr-2 shrink-0" />
                  <span>Quy định Tính Điểm 🏆</span>
                </div>
                {showRules ? (
                  <ChevronUp className="w-4 h-4 text-slate-450 transition-transform" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-450 transition-transform" />
                )}
              </button>
              
              <AnimatePresence>
                {showRules && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <ul className="text-[11px] text-slate-400 space-y-2.5 list-disc pl-4 pr-1 leading-relaxed pt-3 border-t border-slate-800/60 font-sans mt-3">
                      <li>Đăng nhập để lưu dự đoán trận đấu & dự đoán chung cuộc (outrights).</li>
                      <li><strong>Cách tính điểm:</strong> Mỗi dự đoán <span className="text-rose-400 font-semibold">Sai hoặc Quên bình chọn</span> khi khóa cửa nhận <span className="text-rose-400 font-semibold">+1 điểm</span>, đoán đúng nhận <span className="text-emerald-400 font-semibold">0 điểm</span>. <strong>Ai ít điểm nhất sẽ thắng cuộc!</strong></li>
                      <li><strong>Trận đấu thêm (Admin tạo):</strong> Đoán đúng nhận <span className="text-emerald-400 font-semibold">0 điểm</span> (không bị cộng điểm phạt), đoán sai hoặc quên bình chọn bị <span className="text-rose-400 font-semibold">+1 điểm phạt</span> như các trận World Cup.</li>
                      <li><strong>Khấu trừ dài hạn:</strong> Đoán đúng Champion được <span className="text-emerald-400 font-bold">trừ -10đ</span>, đúng Vua phá lưới / Găng tay Vàng / Quả bóng Vàng được <span className="text-emerald-400 font-bold">trừ -5đ</span> vào điểm tổng.</li>
                      <li>Mở khóa dự đoán dài hạn trước <strong>00h00 ngày 19/06/2026</strong>. Sau giờ này sẽ khóa 🔒.</li>
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* VIP HALL OF FAME: TOP 3 LOWEST POINTS BASED ON LATEST RESULTS */}
            <div id="hall-of-fame-block" className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-amber-500/10 transition-all duration-300 -mr-10 -mt-10" />
              
              <div className="flex items-center space-x-2.5 mb-4 pb-2 border-b border-slate-800/60 font-sans">
                <div className="p-2 bg-amber-500/10 rounded-xl text-amber-400">
                  <Trophy className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-100 uppercase tracking-wider font-display">
                    Bảng Vàng Tiên Tri 🎖️
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5 select-none leading-tight">Cập nhật dựa theo kết quả hiện tại gần nhất</p>
                </div>
              </div>

              <div className="space-y-3 pt-1">
                {(leaderboard.length >= 3 ? [
                  {
                    name: leaderboard[0].name,
                    points: leaderboard[0].score,
                    rank: 1,
                    title: 'Quán Quân Toàn Khóa 🏆',
                    medal: '🥇 Quán Quân',
                    bgColor: 'from-amber-400/15 via-amber-500/5 to-transparent border-amber-500/30',
                    textColor: 'text-amber-400',
                    outlineColor: 'shadow-amber-500/5',
                    description: `Chiến thần tiên tri dẫn đầu bảng xếp hạng hiện tại với số điểm phạt vỏn vẹn ${leaderboard[0].score}đ - độ nhạy bén chiến thuật tối thượng!`
                  },
                  {
                    name: leaderboard[1].name,
                    points: leaderboard[1].score,
                    rank: 2,
                    title: 'Á Quân Xuất Sắc 🥈',
                    medal: '🥈 Á Quân',
                    bgColor: 'from-slate-400/15 via-slate-500/5 to-transparent border-slate-400/25',
                    textColor: 'text-slate-200',
                    outlineColor: 'shadow-slate-400/5',
                    description: `Bám sát nút vị trí quán quân với ${leaderboard[1].score}đ phạt. Tỷ lệ dự đoán chính xác cực kỳ đáng nể!`
                  },
                  {
                    name: leaderboard[2].name,
                    points: leaderboard[2].score,
                    rank: 3,
                    title: 'Hạng Ba Danh Giá 🥉',
                    medal: '🥉 Hạng Ba',
                    bgColor: 'from-amber-700/15 via-amber-800/5 to-transparent border-amber-700/20',
                    textColor: 'text-amber-500',
                    outlineColor: 'shadow-amber-700/5',
                    description: `Cán mốc ${leaderboard[2].score}đ phạt. Án ngữ bục vinh quang thứ ba đầy ngoạn mục!`
                  }
                ] : [
                  {
                    name: leaderboard[0]?.name || 'E Bo',
                    points: leaderboard[0]?.score ?? 27,
                    rank: 1,
                    title: 'Quán Quân Toàn Khóa 🏆',
                    medal: '🥇 Quán Quân',
                    bgColor: 'from-amber-400/15 via-amber-500/5 to-transparent border-amber-500/30',
                    textColor: 'text-amber-400',
                    outlineColor: 'shadow-amber-500/5',
                    description: 'Chiến thần phòng ngự tối cao! Hoàn thành mùa giải với số điểm phạt vỏn vẹn ít nhất - kỷ kỷ lục bất bại vượt qua mọi bão táp.'
                  },
                  {
                    name: leaderboard[1]?.name || 'E Bảy',
                    points: leaderboard[1]?.score ?? 30,
                    rank: 2,
                    title: 'Á Quân Xuất Sắc 🥈',
                    medal: '🥈 Á Quân',
                    bgColor: 'from-slate-400/15 via-slate-500/5 to-transparent border-slate-400/25',
                    textColor: 'text-slate-200',
                    outlineColor: 'shadow-slate-400/5',
                    description: 'Kiên cường bám đuổi sát nút. Sở hữu chiến lược né tránh rủi ro thượng thừa, xứng đáng lưu danh bảng vàng.'
                  },
                  {
                    name: leaderboard[2]?.name || 'A Bop',
                    points: leaderboard[2]?.score ?? 34,
                    rank: 3,
                    title: 'Hạng Ba Danh Giá 🥉',
                    medal: '🥉 Hạng Ba',
                    bgColor: 'from-amber-700/15 via-amber-800/5 to-transparent border-amber-700/20',
                    textColor: 'text-amber-500',
                    outlineColor: 'shadow-amber-700/5',
                    description: 'Tận dụng tuyệt đối quyền năng dự đoán chính xác. Án ngữ bục vinh quang thứ ba đầy ngoạn mục!'
                  }
                ]).map((member) => (
                  <button
                    key={member.rank}
                    type="button"
                    onClick={() => handleHallOfFameClick(member)}
                    className="w-full text-left bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-800/60 rounded-2xl p-3 flex items-center justify-between hover:border-slate-700 hover:scale-[1.02] active:scale-98 transition-all duration-200 cursor-pointer shadow-sm select-none"
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl filter drop-shadow select-none">
                        {member.rank === 1 ? '🥇' : member.rank === 2 ? '🥈' : '🥉'}
                      </span>
                      <div>
                        <div className="font-bold text-xs text-slate-100/90">{member.name}</div>
                        <div className="text-[9px] text-slate-450 uppercase tracking-widest font-mono mt-0.5 font-semibold">
                          {member.rank === 1 ? 'Quán Quân' : member.rank === 2 ? 'Á Quân' : 'Hạng 3'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <div className="font-mono font-black text-xs text-emerald-400">{member.points}đ</div>
                      <span className="text-[8px] text-emerald-400/80 font-bold tracking-wider">Hiện tại</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* MAIN VISUAL COLUMN: Top Tabs Selector & Layout Render */}
          <div className="lg:col-span-3 space-y-5">
            
            {/* Nav Tabs Row */}
            <div className="flex border-b border-slate-850 bg-slate-900 p-1 rounded-xl shadow">
              <button
                onClick={() => setActiveTab('MATCHES')}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center space-x-2 transition cursor-pointer ${
                  activeTab === 'MATCHES'
                    ? 'bg-slate-950 text-white shadow-md border-b-2 border-emerald-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Calendar className="w-4 h-4 shrink-0" />
                <span className="truncate">Lịch thi đấu (104)</span>
              </button>
              
              <button
                onClick={() => setActiveTab('LEADERBOARD')}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center space-x-2 transition cursor-pointer ${
                  activeTab === 'LEADERBOARD'
                    ? 'bg-slate-950 text-white shadow-md border-b-2 border-emerald-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Users className="w-4 h-4 shrink-0" />
                <span className="truncate">Bảng Xếp Hạng</span>
              </button>
              
              <button
                onClick={() => setActiveTab('STATS')}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center space-x-2 transition cursor-pointer ${
                  activeTab === 'STATS'
                    ? 'bg-slate-950 text-white shadow-md border-b-2 border-emerald-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Activity className="w-4 h-4 shrink-0" />
                <span className="truncate">Biểu đồ Thống kê</span>
              </button>
              
              {player && player.name === 'Usr-Bop' && (
                <button
                  onClick={() => setActiveTab('ADMIN')}
                  className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center space-x-2 transition cursor-pointer ${
                    activeTab === 'ADMIN'
                      ? 'bg-emerald-950/25 text-emerald-450 shadow-md border-b-2 border-emerald-500'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Layout className="w-4 h-4 shrink-0 text-amber-500" />
                  <span className="truncate">Cấu hình Admin 👑</span>
                </button>
              )}
            </div>

            {/* TAB CONTENT RENDERING */}
            <div className="min-h-[450px]">
              {activeTab === 'MATCHES' && (
                <div className="space-y-6">
                  {player && (
                    <div className="space-y-4">
                      <div className="flex justify-end select-none">
                        <button
                          type="button"
                          onClick={() => setShowOutrightsPanel(!showOutrightsPanel)}
                          className={`px-4 py-2 rounded-2xl border text-xs font-bold transition duration-200 cursor-pointer flex items-center gap-1.5 ${
                            showOutrightsPanel
                              ? 'bg-amber-500/15 text-amber-400 border-amber-500/25'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
                          }`}
                        >
                          <span>🎯 {showOutrightsPanel ? 'ẨN ĐẤU TRƯỜNG CHUNG CUỘC' : 'HIỆN ĐẤU TRƯỜNG CHUNG CUỘC'}</span>
                        </button>
                      </div>
                      {showOutrightsPanel && (
                        <OutrightPredictions
                          playerPhone={player.phoneNumber}
                          matches={matches}
                          serverTime={serverTime}
                          onNotify={notify}
                          onRefresh={refreshData}
                          leaderboardEntry={leaderboard.find(l => l.name === player.name)}
                        />
                      )}
                    </div>
                  )}
                  <MatchList
                    matches={matches}
                    predictions={predictions}
                    odds={odds}
                    playerPhone={player?.phoneNumber ?? null}
                    currentTime={serverTime}
                    onVote={handleVote}
                    onOpenLogin={() => {
                      const codeInputEl = document.querySelector('input[maxLength="6"]') as HTMLInputElement;
                      if (codeInputEl) codeInputEl.focus();
                    }}
                    isAdminUser={!!player && player.name === 'Usr-Bop'}
                  />
                </div>
              )}

              {activeTab === 'LEADERBOARD' && (
                <div className="space-y-6">
                  {/* MAGNIFICENT SYSTEM-WIDE TOTAL SCORE AND ORACLE STATS BOARD */}
                  <motion.div 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    className="relative bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/20 border border-emerald-500/30 rounded-3xl p-6 md:p-8 shadow-2xl overflow-hidden group hover:border-emerald-500/50 transition-all duration-300"
                  >
                    {/* Glowing ambient blobs */}
                    <div className="absolute -left-12 -top-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-16 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
                    
                    {/* Tiny animated dots representing system synchronization */}
                    <div className="absolute top-4 right-4 flex items-center space-x-1.5 px-3 py-1 rounded-full bg-slate-950/60 border border-slate-800/80 backdrop-blur-sm select-none">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500 absolute"></span>
                      <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest font-bold">Trạng Thái: Trực Tuyến</span>
                    </div>

                    <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                      
                      {/* Left: Beautiful big total score display */}
                      <div className="space-y-2.5">
                        <div className="flex items-center space-x-2 text-amber-400">
                          <Sparkles className="w-5 h-5 text-yellow-400 animate-pulse animate-duration-1000" />
                          <span className="text-xs font-black uppercase tracking-widest text-slate-300 font-sans">
                            CỘNG ĐỒNG TIÊN TRI • WORLD CUP 2026
                          </span>
                        </div>
                        <h2 className="text-2xl md:text-3xl font-black text-white font-display uppercase tracking-tight leading-none">
                          TỔNG ĐIỂM SỐ DỰ ĐOÁN TÍCH LŨY
                        </h2>
                        <p className="text-xs text-slate-400 leading-relaxed max-w-xl font-medium">
                          Tổng hợp toàn bộ điểm số từ tất cả người chơi trong hệ thống. <span className="text-emerald-400 font-semibold">Càng ít điểm phạt, độ nhạy bén và phòng ngự chiến thuật càng cao!</span> Hãy cùng chung sức giữ vững phong độ tiên tri tối thượng!
                        </p>
                      </div>

                      {/* Right: Big Magnificent Number of Total Score and Sub Stats */}
                      <div className="flex items-center gap-6 shrink-0 bg-slate-950/50 border border-slate-800/40 p-4 md:p-6 rounded-2xl">
                        <div className="text-center relative">
                          <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">TỔNG ĐIỂM HỆ THỐNG</span>
                          <span className="block text-4xl md:text-5xl font-black font-display text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-400 to-emerald-400 drop-shadow-lg tracking-tight select-all">
                            {leaderboard.reduce((sum, entry) => sum + entry.score, 0)}
                          </span>
                          <span className="block text-[10px] font-mono text-amber-500 font-bold mt-1.5 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full inline-block">
                            Điểm phạt tích lũy
                          </span>
                        </div>
                      </div>

                    </div>

                    {/* Bento grids showing extra aggregated statistics for extreme magnificence */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 md:mt-8 pt-6 border-t border-slate-800/80">
                      
                      <div className="bg-slate-950/40 border border-slate-850/60 p-4 rounded-2xl hover:border-emerald-500/30 transition duration-300">
                        <div className="flex items-center space-x-2 text-slate-500 mb-1.5">
                          <Users className="w-4 h-4 text-emerald-400" />
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tổng Nhân Sự</span>
                        </div>
                        <span className="block font-mono text-xl md:text-2xl font-black text-slate-100">{leaderboard.length}</span>
                        <span className="text-[9px] text-slate-400 font-medium">Nhà tiên tri hoạt động</span>
                      </div>

                      <div className="bg-slate-950/40 border border-slate-850/60 p-4 rounded-2xl hover:border-emerald-500/30 transition duration-300">
                        <div className="flex items-center space-x-2 text-slate-500 mb-1.5">
                          <Calendar className="w-4 h-4 text-emerald-450" />
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 font-sans">Tổng Bình Chọn</span>
                        </div>
                        <span className="block font-mono text-xl md:text-2xl font-black text-slate-100">
                          {leaderboard.reduce((sum, entry) => sum + entry.predictedCount, 0)}
                        </span>
                        <span className="text-[9px] text-slate-400 font-medium">Lượt dự đoán đã nộp</span>
                      </div>

                      <div className="bg-slate-950/40 border border-slate-850/60 p-4 rounded-2xl hover:border-emerald-500/30 transition duration-300">
                        <div className="flex items-center space-x-2 text-emerald-400 mb-1.5">
                          <Trophy className="w-4 h-4 text-emerald-400" />
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">Tổng Đoán Đúng</span>
                        </div>
                        <span className="block font-mono text-xl md:text-2xl font-black text-emerald-400">
                          {leaderboard.reduce((sum, entry) => sum + entry.correctCount, 0)}
                        </span>
                        <span className="text-[9px] text-slate-400 font-medium">Trận đoán trúng tuyệt đối</span>
                      </div>

                      <div className="bg-slate-950/40 border border-slate-850/60 p-4 rounded-2xl hover:border-emerald-500/30 transition duration-300">
                        <div className="flex items-center space-x-2 text-slate-500 mb-1.5">
                          <Activity className="w-4 h-4 text-emerald-400" />
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Điểm Trung Bình</span>
                        </div>
                        <span className="block font-mono text-xl md:text-2xl font-black text-slate-100">
                          {leaderboard.length > 0 ? (leaderboard.reduce((sum, entry) => sum + entry.score, 0) / leaderboard.length).toFixed(1) : '0'}đ
                        </span>
                        <span className="text-[9px] text-slate-400 font-medium">Phạt bình quân mỗi người</span>
                      </div>

                    </div>

                  </motion.div>

                  {/* Top 3 Honor Board Podium */}
                  {leaderboard.length >= 3 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end pt-4 pb-2">
                      
                      {/* 2nd place (Silver) */}
                      {leaderboard[1] && (
                        <div className="md:order-1 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg flex flex-col items-center relative overflow-hidden group hover:border-slate-700 transition duration-300">
                          <div className="absolute top-0 left-0 right-0 h-1.5 bg-slate-400" />
                          <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center border-2 border-slate-400 text-slate-350 font-black text-lg shadow-inner mb-3">
                            🥈
                          </div>
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest bg-slate-950 px-2.5 py-0.5 rounded-full border border-slate-800 mb-1">
                            HẠNG NHÌ
                          </span>
                          <h3 className="text-sm font-bold text-slate-100 truncate max-w-full text-center font-display">
                            {leaderboard[1].name}
                          </h3>
                          <div className="mt-3 grid grid-cols-2 gap-2 w-full text-center border-t border-slate-800 pt-3">
                            <div>
                              <span className="block text-[8px] text-slate-500 uppercase font-black">Chính xác</span>
                              <span className="block font-mono text-xs text-slate-300 font-bold">{leaderboard[1].correctCount} thắng</span>
                            </div>
                            <div>
                              <span className="block text-[8px] text-slate-500 uppercase font-black">Điểm số</span>
                              <span className="block font-mono text-xs text-emerald-400 font-bold">{leaderboard[1].score} đ</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 1st place (Gold) */}
                      {leaderboard[0] && (
                        <div className="md:order-2 bg-gradient-to-b from-yellow-950/20 via-slate-900 to-slate-900 border-2 border-yellow-500/30 rounded-3xl p-6 shadow-xl flex flex-col items-center relative overflow-hidden group hover:border-yellow-500/50 transition duration-300 md:-translate-y-2 scale-102">
                          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-yellow-400 to-amber-500" />
                          <div className="absolute -top-12 w-24 h-24 bg-yellow-500/10 rounded-full blur-xl pointer-events-none" />
                          <div className="w-14 h-14 bg-yellow-950/40 rounded-full flex items-center justify-center border-2 border-yellow-500 text-yellow-500 font-black text-xl shadow-lg shadow-yellow-500/5 mb-3">
                            👑
                          </div>
                          <span className="text-[11px] font-black uppercase text-yellow-500 tracking-wider bg-yellow-950 px-3 py-1 rounded-full border border-yellow-500/20 mb-1.5 flex items-center gap-1">
                            🥇 VÔ ĐỊCH
                          </span>
                          <h3 className="text-base font-black text-white truncate max-w-full text-center font-display tracking-tight uppercase">
                            {leaderboard[0].name}
                          </h3>
                          <div className="mt-4 grid grid-cols-2 gap-2 w-full text-center border-t border-slate-800 pt-3.5">
                            <div>
                              <span className="block text-[9px] text-slate-400 uppercase font-black">Chính xác</span>
                              <span className="block font-mono text-emerald-400 text-sm font-bold">{leaderboard[0].correctCount} thắng</span>
                            </div>
                            <div>
                              <span className="block text-[9px] text-slate-400 uppercase font-black">Điểm số</span>
                              <span className="block font-mono text-yellow-400 text-sm font-black">{leaderboard[0].score} đ</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 3rd place (Bronze) */}
                      {leaderboard[2] && (
                        <div className="md:order-3 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg flex flex-col items-center relative overflow-hidden group hover:border-slate-700 transition duration-300">
                          <div className="absolute top-0 left-0 right-0 h-1.5 bg-amber-700" />
                          <div className="w-12 h-12 bg-amber-950/20 rounded-full flex items-center justify-center border-2 border-amber-600 text-amber-600 font-black text-lg shadow-inner mb-3">
                            🥉
                          </div>
                          <span className="text-[10px] font-black uppercase text-amber-600 tracking-widest bg-amber-955/10 px-2.5 py-0.5 rounded-full border border-amber-800 mb-1">
                            HẠNG BA
                          </span>
                          <h3 className="text-sm font-bold text-slate-100 truncate max-w-full text-center font-display">
                            {leaderboard[2].name}
                          </h3>
                          <div className="mt-3 grid grid-cols-2 gap-2 w-full text-center border-t border-slate-800 pt-3">
                            <div>
                              <span className="block text-[8px] text-slate-500 uppercase font-black">Chính xác</span>
                              <span className="block font-mono text-xs text-slate-300 font-bold">{leaderboard[2].correctCount} thắng</span>
                            </div>
                            <div>
                              <span className="block text-[8px] text-slate-500 uppercase font-black">Điểm số</span>
                              <span className="block font-mono text-xs text-emerald-400 font-bold">{leaderboard[2].score} đ</span>
                            </div>
                          </div>
                        </div>
                      )}

                    </div>
                  )}

                  {/* Search Bar for Leaderboard */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                      <h2 className="text-sm font-bold text-slate-100 flex items-center gap-1.5 uppercase">
                        <Award className="w-4 h-4 text-emerald-400" />
                        <span>Bảng xếp hạng tài năng dự đoán</span>
                      </h2>
                      <p className="text-[11px] text-slate-400 mt-0.5">Xếp hạng dựa trên tổng số trận đấu dự đoán chính xác tuyệt đối.</p>
                    </div>

                    <input
                      type="text"
                      placeholder="Tìm kiếm người chơi..."
                      value={searchLeaderboardQuery}
                      onChange={(e) => setSearchLeaderboardQuery(e.target.value)}
                      className="w-full sm:w-64 bg-slate-950 text-xs text-slate-200 border border-slate-800 roundedpx px-3 py-1.5 rounded-md focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Leaderboard Grid */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-850">
                          <tr>
                            <th className="py-3.5 px-5">Hạng</th>
                            <th className="py-3.5 px-5">Người chơi</th>
                            <th className="py-3.5 px-5 text-center">Đã dự đoán</th>
                            <th className="py-3.5 px-5 text-center">Đoán đúng</th>
                            <th className="py-3.5 px-5 text-right pr-5">Điểm số</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850">
                          {filteredLeaderboard.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-12 text-center text-slate-500">
                                Chưa có dữ liệu bảng xếp hạng học viên. 
                                <br />
                                <span className="text-[11px] italic">Hãy đăng nhập dự đoán đầu tiên hoặc vào tab "Mô phỏng BTC" để nạp 10 người chơi ảo!</span>
                              </td>
                            </tr>
                          ) : (
                            filteredLeaderboard.map((entry) => {
                              const isCurrentUser = player?.name === entry.name;

                              let rankColor = 'text-slate-300';
                              let rankBg = 'bg-slate-950';

                              if (entry.rank === 1) {
                                rankColor = 'text-yellow-400 font-bold';
                                rankBg = 'bg-yellow-500/10 border border-yellow-500/20';
                              } else if (entry.rank === 2) {
                                rankColor = 'text-slate-300 font-bold';
                                rankBg = 'bg-slate-400/10 border border-slate-450/20';
                              } else if (entry.rank === 3) {
                                rankColor = 'text-amber-600 font-bold';
                                rankBg = 'bg-amber-700/10 border border-amber-600/20';
                              }

                              return (
                                <tr
                                  key={entry.name}
                                  className={`transition ${isCurrentUser ? 'bg-emerald-500/5 font-semibold text-emerald-300 border-l-2 border-emerald-500' : 'hover:bg-slate-900/40 text-slate-300'}`}
                                >
                                  <td className="py-3.5 px-5">
                                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] ${rankBg} ${rankColor}`}>
                                      {entry.rank}
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-5 flex items-center space-x-2">
                                    {isCurrentUser && (
                                      <span className="bg-emerald-500 text-white text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded shadow">Bạn</span>
                                    )}
                                    <span className="font-bold text-slate-100">{entry.name}</span>
                                  </td>
                                  <td className="py-3.5 px-5 text-center font-mono text-slate-200">
                                    {entry.predictedCount}
                                  </td>
                                  <td className="py-3.5 px-5 text-center text-emerald-450 font-bold font-mono">
                                    {entry.correctCount}
                                  </td>
                                  <td className="py-3.5 px-5 text-right pr-5 font-mono text-sm text-emerald-400 font-black">
                                    {entry.score}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'STATS' && (
                <StatsDashboard
                  leaderboard={leaderboard}
                  totalPredictionsCount={Object.keys(predictions).length || leaderboard.reduce((acc, entry) => acc + entry.predictedCount, 0)}
                  isAdmin={player?.name === 'Usr-Bop'}
                  adminCode={player?.phoneNumber}
                />
              )}

              {activeTab === 'ADMIN' && player && player.name === 'Usr-Bop' && (
                <AdminPanel
                  matches={matches}
                  currentTime={serverTime}
                  isSimulating={isSimulatingTime}
                  adminCode={player.phoneNumber}
                  onRefresh={refreshData}
                  onNotify={notify}
                />
              )}
            </div>

          </div>

        </div>

      </main>

      {/* Footer Design (Bento Style) */}
      <footer className="max-w-7xl mx-auto px-4 mt-16 pb-12 flex flex-col sm:flex-row justify-between items-center text-[10px] text-slate-600 border-t border-slate-900 pt-6">
        <p>© 2026 WORLD CUP PREDICTION TOOL • BUILT FOR PERFORMANCE</p>
        <div className="flex gap-4 mt-2 sm:mt-0 font-bold uppercase tracking-wider">
          <span>QUY CHẾ & ĐIỀU KHOẢN</span>
          <span className="text-emerald-500">TRẠNG THÁI MÁY CHỦ: ONLINE</span>
        </div>
      </footer>

      {/* Hall of Fame Spectacular Popup Modal */}
      <AnimatePresence>
        {selectedHallOfFamer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4 z-50 select-none overflow-hidden"
            onClick={() => setSelectedHallOfFamer(null)}
          >
            <motion.div
              initial={{ scale: 0.85, y: 40, opacity: 0 }}
              animate={{ 
                scale: 1, 
                y: 0, 
                opacity: 1,
                transition: { type: "spring", damping: 25, stiffness: 350 }
              }}
              exit={{ scale: 0.85, y: 30, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-[32px] p-8 max-w-sm w-full shadow-2xl relative text-center overflow-hidden group/modal"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Decorative particles */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-emerald-500/15 rounded-full blur-2xl pointer-events-none -mt-24 group-hover/modal:bg-emerald-500/25 transition-all duration-500" />
              
              {/* Rotating Gold Aura for #1 */}
              {selectedHallOfFamer.rank === 1 && (
                <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/5 via-transparent to-yellow-500/5 rounded-[32px] pointer-events-none" />
              )}

              {/* Position Medal Icon */}
              <motion.div
                initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
                animate={{ 
                  scale: 1, 
                  rotate: 0,
                  opacity: 1,
                }}
                transition={{ 
                  delay: 0.1, 
                  type: "spring", 
                  stiffness: 260, 
                  damping: 15 
                }}
                className="mx-auto w-24 h-24 bg-slate-950 rounded-full border-2 border-slate-800/80 p-2 flex items-center justify-center relative shadow-lg"
              >
                {/* Visual medal design */}
                <div className="absolute inset-1 rounded-full bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-850" />
                <span className="text-5xl z-10 filter drop-shadow animate-bounce select-none">
                  {selectedHallOfFamer.rank === 1 ? '🥇' : selectedHallOfFamer.rank === 2 ? '🥈' : '🥉'}
                </span>
                
                {/* Halo rings */}
                <span className="absolute -inset-1 rounded-full border border-amber-500/20 animate-ping opacity-60" />
              </motion.div>

              {/* Title & Rank */}
              <div className="mt-6 space-y-1">
                <span className="text-[10px] font-black tracking-widest uppercase font-mono bg-slate-100/10 px-3 py-1 rounded-full text-slate-350 border border-slate-800">
                  {selectedHallOfFamer.medal} Mùa Trước
                </span>
                <h4 className="text-2xl font-black text-slate-100 font-display tracking-tight pt-2">
                  {selectedHallOfFamer.name}
                </h4>
              </div>

              {/* Points Badge */}
              <div className="my-6 bg-slate-950 border border-slate-850/60 p-4 rounded-2xl flex flex-col justify-center items-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-1 bg-slate-900/40 rounded-bl-xl">
                  <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest font-black">Chung cuộc</span>
                </div>
                <div className="flex items-baseline space-x-1.5 pt-1">
                  <span className="text-4xl font-mono font-black text-emerald-400 tracking-tight">
                    {selectedHallOfFamer.points}
                  </span>
                  <span className="text-xs text-slate-400 font-bold">Điểm phạt</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1 uppercase font-semibold tracking-wider">
                  Trụ hạng vàng • Top {selectedHallOfFamer.rank} siêu thủ
                </p>
              </div>

              {/* Summary Description text */}
              <p className="text-slate-350 text-xs leading-relaxed px-1 font-sans">
                {selectedHallOfFamer.description}
              </p>

              {/* Nice motivational footer quote */}
              <div className="mt-6 border-t border-slate-850/60 pt-5 flex flex-col gap-3 font-sans">
                <button
                  type="button"
                  onClick={() => setSelectedHallOfFamer(null)}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-3 px-4 rounded-xl shadow-lg hover:shadow-emerald-500/20 transition duration-200 cursor-pointer active:scale-95"
                >
                  Đóng & Chúc Mừng 🎉
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
