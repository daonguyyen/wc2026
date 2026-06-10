/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Trophy, Award, Shield, Crown, Clock, Lock, CheckCircle2, XCircle, RotateCcw, AlertCircle
} from 'lucide-react';
import { Match } from '../types';

interface OutrightPredictionsProps {
  playerPhone: string;
  matches: Match[];
  serverTime: string;
  onNotify: (msg: string, type: 'success' | 'error') => void;
  onRefresh: () => void;
  leaderboardEntry?: any; // To read current user outcomes/outright correctness
}

export default function OutrightPredictions({
  playerPhone,
  matches,
  serverTime,
  onNotify,
  onRefresh,
  leaderboardEntry
}: OutrightPredictionsProps) {
  // Lock time is 19/06/2026 at 00:00:00 UTC+7 (Vietnam Time)
  // equivalent to 2026-06-18T17:00:00.000Z
  const LOCK_TIME_ISO = '2026-06-18T17:00:00.000Z';
  const lockTime = new Date(LOCK_TIME_ISO).getTime();

  const [champion, setChampion] = useState('');
  const [goldenBoot, setGoldenBoot] = useState('');
  const [goldenGlove, setGoldenGlove] = useState('');
  const [goldenBall, setGoldenBall] = useState('');
  
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countdownText, setCountdownText] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [teams, setTeams] = useState<string[]>([]);

  // Filter the list of 48 World Cup teams from matches
  const getUniqueTeams = (): string[] => {
    const allNames = matches.flatMap(m => [m.homeTeam, m.awayTeam]);
    const filtered = allNames.filter(name => {
      if (!name) return false;
      const placeholderKeyWords = [
        'Nhất Bảng', 'Nhì Bảng', 'ThắngTrận', 'ThuaTrận', 'Chưa xác định', 
        'Thắng Trận', 'Thua Trận', 'Tử kết', 'Bán kết', 'Chung kết', 'Thua', 'Thắng'
      ];
      return !placeholderKeyWords.some(kw => name.includes(kw));
    });
    return Array.from(new Set(filtered)).sort();
  };

  // Load available 48 teams from dedicated teams endpoint to handle regular users who don't see all matches
  const fetchTeams = async () => {
    try {
      const res = await fetch('/api/teams');
      if (res.ok) {
        const data = await res.json();
        if (data.teams && data.teams.length > 0) {
          setTeams(data.teams);
          return;
        }
      }
    } catch (err) {
      console.error('Lỗi khi nạp danh sách đội tuyển từ API /api/teams:', err);
    }
    // Fallback if API fails or for offline support
    setTeams(getUniqueTeams());
  };

  // Load existing player's selections
  const fetchMyOutright = async () => {
    if (!playerPhone) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/outright-predictions/${playerPhone}`);
      if (res.ok) {
        const data = await res.json();
        if (data.outright) {
          setChampion(data.outright.champion || '');
          setGoldenBoot(data.outright.goldenBoot || '');
          setGoldenGlove(data.outright.goldenGlove || '');
          setGoldenBall(data.outright.goldenBall || '');
        }
      }
    } catch (e) {
      console.error('Lỗi khi nạp dữ liệu dự đoán chung cuộc:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeams();
    fetchMyOutright();
  }, [playerPhone, matches]);

  // Handle Lock and Countdown interval
  useEffect(() => {
    const updateTime = () => {
      // Use parent server time synchronized ticking
      const now = new Date(serverTime).getTime();
      const diff = lockTime - now;

      if (diff <= 0) {
        setIsLocked(true);
        setCountdownText('Dự đoán đã đóng (00h 19/06)');
      } else {
        setIsLocked(false);
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setCountdownText(`Khóa sau: ${days} ngày ${hours}h ${minutes}p ${seconds}s`);
      }
    };

    updateTime();
  }, [serverTime, lockTime]);

  // Submit choices
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) {
      onNotify('Thời gian dự đoán đã khoá học viên!', 'error');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/outright-predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerPhone,
          champion,
          goldenBoot,
          goldenGlove,
          goldenBall
        })
      });

      const data = await res.json();
      if (res.ok) {
        onNotify(data.message || 'Lưu dự đoán dài hạn thành công!', 'success');
        onRefresh();
      } else {
        onNotify(data.error || 'Nộp dự đoán thất bại!', 'error');
      }
    } catch (err) {
      onNotify('Lỗi kết nối máy chủ.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Obtain evaluations from the leaderboardEntry (if present or fetched)
  const evaluated = leaderboardEntry && leaderboardEntry.outright;
  
  // Checking correctness of entries if admin checked them or matched them
  // Let's call these results from the database or leaderboard representation directly.
  // We'll read these from the backend data directly, wait, leaderboardEntry holds `outright` with details.
  // Let's pass the results/evaluation from user outright predictions so it's beautifully visual.

  return (
    <div id="outright-predictions-panel" className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
      {/* Visual glowing backdrop */}
      <div className="absolute -left-12 -bottom-12 w-48 h-48 bg-gradient-to-tr from-emerald-500/10 to-transparent rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -right-12 -top-12 w-48 h-48 bg-gradient-to-bl from-blue-500/10 to-transparent rounded-full blur-2xl pointer-events-none" />

      {/* Header with Title and localized countdown */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800/80 pb-4 mb-5 gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase text-emerald-400 tracking-wider bg-emerald-950/30 border border-emerald-500/20 rounded-full px-2.5 py-0.5">
            🎯 Đấu trường chung cuộc
          </span>
          <h2 className="text-lg font-black text-slate-100 font-display mt-1.5 uppercase">
            Dự Đoán Outright World Cup 2026
          </h2>
        </div>

        <div className={`px-4 py-2 rounded-2xl border text-xs font-mono font-bold flex items-center space-x-2 shrink-0 ${
          isLocked 
            ? 'bg-rose-950/20 border-rose-500/20 text-rose-450' 
            : 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400'
        }`}>
          {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5 animate-pulse" />}
          <span>{countdownText}</span>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-slate-500 text-xs">Phác thảo dữ liệu chung cuộc...</div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Category 1: Champion */}
            <div className="bg-slate-950 border border-slate-850 p-4.5 rounded-2xl flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center space-x-2 text-slate-300">
                    <Trophy className="w-4 h-4 text-yellow-400" />
                    <span className="text-xs font-bold uppercase tracking-wider">Đội Vô Địch</span>
                  </div>
                  <span className="text-[10px] bg-yellow-405/10 text-yellow-450 font-bold px-1.5 py-0.5 rounded border border-yellow-500/20">Trừ 10đ</span>
                </div>
                <p className="text-[11px] text-slate-450 leading-relaxed mb-3">Dự đoán Đội nâng cao chiếc Cúp Vô Địch trong tổng số 48 đội tham dự.</p>
              </div>

              {isLocked ? (
                <div className="bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs font-semibold text-slate-200 flex justify-between items-center">
                  <span className="truncate">{champion || '(Chưa chọn)'}</span>
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                </div>
              ) : (
                <select
                  value={champion}
                  onChange={(e) => setChampion(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 text-xs font-medium text-slate-200 rounded-xl py-2 px-3 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- Chọn đội vô địch --</option>
                  {teams.map(team => (
                    <option key={team} value={team}>{team}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Category 2: Golden Boot */}
            <div className="bg-slate-950 border border-slate-850 p-4.5 rounded-2xl flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center space-x-2 text-slate-300">
                    <Crown className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold uppercase tracking-wider">Vua Phá Lưới (Top Scorer)</span>
                  </div>
                  <span className="text-[10px] bg-emerald-450/10 text-emerald-400 font-bold px-1.5 py-0.5 rounded border border-emerald-550/20">Trừ 5đ</span>
                </div>
                <p className="text-[11px] text-slate-450 leading-relaxed mb-3">Dự đoán cầu thủ đạt danh hiệu Chiếc giày Vàng (Ghi nhiều bàn thắng nhất).</p>
              </div>

              {isLocked ? (
                <div className="bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs font-semibold text-slate-200 flex justify-between items-center">
                  <span className="truncate">{goldenBoot || '(Chưa nhập)'}</span>
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                </div>
              ) : (
                <input
                  type="text"
                  placeholder="Nhập tên cầu thủ..."
                  value={goldenBoot}
                  onChange={(e) => setGoldenBoot(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 text-xs font-medium text-slate-200 rounded-xl py-2 px-3 focus:outline-none focus:border-emerald-500"
                />
              )}
            </div>

            {/* Category 3: Golden Glove */}
            <div className="bg-slate-950 border border-slate-850 p-4.5 rounded-2xl flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center space-x-2 text-slate-300">
                    <Shield className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-bold uppercase tracking-wider">Thủ Môn Xuất Sắc Nhất</span>
                  </div>
                  <span className="text-[10px] bg-blue-500/10 text-blue-400 font-bold px-1.5 py-0.5 rounded border border-blue-500/20">Trừ 5đ</span>
                </div>
                <p className="text-[11px] text-slate-450 leading-relaxed mb-3">Dự đoán người gác đền đoạt giải thưởng Găng tay Vàng (Golden Glove).</p>
              </div>

              {isLocked ? (
                <div className="bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs font-semibold text-slate-200 flex justify-between items-center">
                  <span className="truncate">{goldenGlove || '(Chưa nhập)'}</span>
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                </div>
              ) : (
                <input
                  type="text"
                  placeholder="Nhập tên thủ môn..."
                  value={goldenGlove}
                  onChange={(e) => setGoldenGlove(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 text-xs font-medium text-slate-200 rounded-xl py-2 px-3 focus:outline-none focus:border-emerald-500"
                />
              )}
            </div>

            {/* Category 4: Golden Ball */}
            <div className="bg-slate-950 border border-slate-850 p-4.5 rounded-2xl flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center space-x-2 text-slate-300">
                    <Award className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-bold uppercase tracking-wider">Cầu Thủ Xuất Sắc Nhất</span>
                  </div>
                  <span className="text-[10px] bg-purple-500/10 text-purple-400 font-bold px-1.5 py-0.5 rounded border border-purple-500/20">Trừ 5đ</span>
                </div>
                <p className="text-[11px] text-slate-450 leading-relaxed mb-3">Dự đoán danh hiệu Quả bóng Vàng World Cup 2026 (Cầu thủ kiến thiết xuất sắc nhất).</p>
              </div>

              {isLocked ? (
                <div className="bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs font-semibold text-slate-200 flex justify-between items-center">
                  <span className="truncate">{goldenBall || '(Chưa nhập)'}</span>
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                </div>
              ) : (
                <input
                  type="text"
                  placeholder="Nhập tên cầu thủ xuất sắc nhất..."
                  value={goldenBall}
                  onChange={(e) => setGoldenBall(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 text-xs font-medium text-slate-200 rounded-xl py-2 px-3 focus:outline-none focus:border-emerald-500"
                />
              )}
            </div>

          </div>

          {/* Guidelines warning */}
          {!isLocked && (
            <div className="bg-emerald-950/20 border border-emerald-500/15 rounded-2xl p-4 flex items-start space-x-3 text-[11px] text-slate-405 leading-relaxed">
              <AlertCircle className="w-4.5 h-4.5 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>LƯU Ý:</strong> Bạn có thể tự do nhấn "Lưu Dự Đoán" nhiều lần để cập nhật các dự đoán dài hạn trước thời điểm đóng đăng ký (<strong>00:00 ngày 19/06/2026 UTC+7</strong>). Sau mốc này, toàn bộ mục bình chọn sẽ tự động khóa cứng và ghi nhận để đánh giá.
              </span>
            </div>
          )}

          {/* Form Actions */}
          {!isLocked && (
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-6 py-3 rounded-2xl transition duration-200 flex items-center space-x-1.5 shadow-lg shadow-emerald-700/15 cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <span>Đang ghi lên máy chủ...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4.5 h-4.5" />
                    <span>Lưu Dự Đoán Chung Cuộc</span>
                  </>
                )}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
