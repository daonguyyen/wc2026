/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { LeaderboardEntry } from '../types';
import { Award, BarChart3, TrendingUp, CheckCircle2, RefreshCw, History, Zap } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface StatsDashboardProps {
  leaderboard: LeaderboardEntry[];
  totalPredictionsCount: number;
  isAdmin?: boolean;
  adminCode?: string;
}

export default function StatsDashboard({ 
  leaderboard, 
  totalPredictionsCount,
  isAdmin = false,
  adminCode
}: StatsDashboardProps) {
  // Aggregate stats
  const totalPlayers = leaderboard.length;
  const totalMatchesFinished = leaderboard.length > 0 
    ? Math.max(...leaderboard.map(l => l.predictedCount)) // can estimate based on predictions
    : 0;

  // Total evaluated correct vs wrong
  let totalEvaluatedCount = 0;
  let totalCorrectCount = 0;

  leaderboard.forEach((player) => {
    totalEvaluatedCount += player.predictedCount;
    totalCorrectCount += player.correctCount;
  });

  const totalWrongCount = totalEvaluatedCount - totalCorrectCount;
  const averageAccuracy = totalEvaluatedCount > 0 
    ? parseFloat(((totalCorrectCount / totalEvaluatedCount) * 100).toFixed(1))
    : 0;

  // Prepare data for Recharts Bar Chart (Top 10 players)
  const topPlayersData = leaderboard.slice(0, 10).map((player) => ({
    name: player.name,
    'Điểm Số': player.score,
    'Dự Đoán Đúng': player.correctCount,
    'Dự Đoán Sai': player.predictedCount - player.correctCount,
  }));

  // Prepare data for Pie Chart (Overall prediction accuracy)
  const accuracyPieData = [
    { name: 'Đúng', value: totalCorrectCount, color: '#34d399' }, // emerald-400
    { name: 'Sai', value: totalWrongCount, color: '#f87171' }, // red-450
  ];

  // Colors for charts
  const BAR_COLORS = {
    SCORE: '#10b981', // emerald-500
    CORRECT: '#60a5fa', // blue-400
    WRONG: '#f87171', // red-450
  };

  // State for user voting history (Moved from AdminPanel)
  const [historyList, setHistoryList] = React.useState<{
    playerPhone: string;
    playerName: string;
    matchId: string;
    homeTeam: string;
    awayTeam: string;
    prediction: 'HOME' | 'DRAW' | 'AWAY';
    votedAt: string;
    points: number;
    evaluated: boolean;
    matchStatus: string;
    matchTime?: string | null;
  }[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState(false);
  const [historySearch, setHistorySearch] = React.useState('');

  // Pagination for User History table
  const [historyPage, setHistoryPage] = React.useState(1);
  const historyPageSize = 8;

  const fetchPredictionsHistory = async () => {
    setLoadingHistory(true);
    try {
      const headers: Record<string, string> = {};
      if (isAdmin && adminCode) {
        headers['x-admin-code'] = adminCode;
      }
      const res = await fetch('/api/predictions-history', { headers });
      if (res.ok) {
        const data = await res.json();
        setHistoryList(data.history || []);
      }
    } catch (err) {
      console.error('Lỗi khi tải lịch sử bình chọn:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  React.useEffect(() => {
    fetchPredictionsHistory();
  }, [isAdmin, adminCode]);

  const filteredHistory = historyList.filter(h => {
    // Only search/filter if user is admin
    if (!isAdmin) return true;
    
    const query = historySearch.toLowerCase().trim();
    if (!query) return true;
    return (
      h.playerName.toLowerCase().includes(query) ||
      h.playerPhone.toLowerCase().includes(query) ||
      h.homeTeam.toLowerCase().includes(query) ||
      h.awayTeam.toLowerCase().includes(query) ||
      h.matchId.includes(query)
    );
  });

  // Calculate: Vua nhảy tàu (Last-minute predictors Top 3)
  const lastMinuteLeaderboard = React.useMemo(() => {
    const playersMap: Record<string, {
      name: string;
      phone: string;
      leapCount: number;
      gaps: number[];
    }> = {};

    historyList.forEach(h => {
      if (!h.votedAt || !h.matchTime) return;
      const voteTime = new Date(h.votedAt).getTime();
      const matchStart = new Date(h.matchTime).getTime();
      const cutoff = matchStart + 15 * 60 * 1000; // 15 mins lock limit
      
      const gap = cutoff - voteTime; // in ms
      
      // If valid prediction (before/at cutoff) and within 25 minutes of lock time
      // (This covers 10 minutes before kickoff to 15 minutes after kickoff)
      if (gap >= 0 && gap <= 25 * 60 * 1000) {
        const key = h.playerName + h.playerPhone;
        if (!playersMap[key]) {
          playersMap[key] = {
            name: h.playerName,
            phone: h.playerPhone,
            leapCount: 0,
            gaps: []
          };
        }
        playersMap[key].leapCount += 1;
        playersMap[key].gaps.push(gap);
      }
    });

    const list = Object.values(playersMap).map(p => {
      const avgGapMs = p.gaps.length > 0
        ? p.gaps.reduce((sum, g) => sum + g, 0) / p.gaps.length
        : 0;
      
      const avgGapMinutes = avgGapMs / (60 * 1000);

      return {
        name: p.name,
        phone: p.phone,
        leapCount: p.leapCount,
        avgGapMinutes: parseFloat(avgGapMinutes.toFixed(1))
      };
    });

    // Sort by leapCount desc, then avgGapMinutes asc (smaller gap is closer to locking time)
    return list
      .sort((a, b) => {
        if (b.leapCount !== a.leapCount) {
          return b.leapCount - a.leapCount;
        }
        return a.avgGapMinutes - b.avgGapMinutes;
      })
      .slice(0, 3);
  }, [historyList]);

  // History pagination slicing
  const totalHistoryCount = filteredHistory.length;
  const totalHistoryPages = Math.max(1, Math.ceil(totalHistoryCount / historyPageSize));
  const historyStartIndex = (historyPage - 1) * historyPageSize;
  const paginatedHistory = filteredHistory.slice(historyStartIndex, historyStartIndex + historyPageSize);

  // Auto adjustment for historyPage out-of-bounds
  React.useEffect(() => {
    if (historyPage > totalHistoryPages) {
      setHistoryPage(totalHistoryPages);
    }
  }, [totalHistoryPages, historyPage]);

  // Reset page when filter changes
  React.useEffect(() => {
    setHistoryPage(1);
  }, [historySearch]);

  return (
    <div id="stats-dashboard-container" className="space-y-6">
      
      {/* Metrics Grid (Bento style) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Metric 1 */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-3xl p-5 flex items-center space-x-4 shadow hover:border-slate-700/65 transition duration-300">
          <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tổng Người Chơi</h3>
            <div className="text-2xl font-black text-slate-100 font-mono mt-0.5">{totalPlayers}</div>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-3xl p-5 flex items-center space-x-4 shadow hover:border-slate-700/65 transition duration-300">
          <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-400">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tổng lượt đoán</h3>
            <div className="text-2xl font-black text-slate-100 font-mono mt-0.5">{totalPredictionsCount}</div>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-3xl p-5 flex items-center space-x-4 shadow hover:border-slate-700/65 transition duration-300">
          <div className="p-3 bg-teal-500/10 rounded-2xl text-teal-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lượt Đã Chấm</h3>
            <div className="text-2xl font-black text-slate-100 font-mono mt-0.5">{totalEvaluatedCount}</div>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-3xl p-5 flex items-center space-x-4 shadow hover:border-slate-700/65 transition duration-300">
          <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-400">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tỉ Lệ Đúng</h3>
            <div className="text-2xl font-black text-slate-100 font-mono mt-0.5">{averageAccuracy}%</div>
          </div>
        </div>
      </div>

      {/* Vua Nhảy Tàu (Last-Minute Predictors Top 3) */}
      <div id="vua-nhay-tau-banner" className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden group hover:border-slate-700/60 transition duration-300">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl group-hover:bg-amber-500/10 transition-all duration-500 -mr-20 -mt-20 pointer-events-none"></div>
        
        <div className="flex items-center space-x-3 mb-5 border-b border-slate-800 pb-3">
          <div className="p-2.5 bg-amber-500/10 rounded-2xl text-amber-400">
            <Zap className="w-5 h-5 text-amber-400 animate-bounce" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">
              Danh Hiệu Vua Nhảy Tàu 🚄 (Top 3)
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Dành cho các chiến thần dự đoán sát nút giờ đóng cổng bình chọn nhất (T + 15 phút).</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {lastMinuteLeaderboard.length === 0 ? (
            <div className="md:col-span-3 text-center py-6 text-slate-500 text-xs italic">
              Chưa đủ dữ liệu dự đoán để phân định danh hiệu hoặc chưa trận nào diễn ra.
            </div>
          ) : (
            lastMinuteLeaderboard.map((item, idx) => {
              const medalColors = [
                'from-yellow-400/20 to-amber-500/10 text-yellow-400 border-yellow-500/30' + ' shadow-yellow-500/5',
                'from-slate-300/20 to-slate-400/10 text-slate-200 border-slate-400/30 shadow-slate-400/5',
                'from-amber-600/20 to-amber-700/10 text-amber-500 border-amber-600/30 shadow-amber-600/5'
              ];
              const medals = ['🥇 Quán Quân', '🥈 Á Quân', '🥉 Hạng Ba'];
              return (
                <div 
                  key={idx} 
                  className={`bg-gradient-to-br ${medalColors[idx]} border rounded-2xl p-4 flex flex-col justify-between hover:scale-[1.02] transition duration-250 shadow-md`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-black uppercase tracking-wider font-mono bg-slate-950/40 px-2.5 py-1 rounded-full">{medals[idx]}</span>
                    <span className="text-xs font-mono font-black opacity-80">#{idx + 1}</span>
                  </div>
                  
                  <div className="mb-2">
                    <div className="font-bold text-slate-100/90 text-sm">{item.name}</div>
                    <div className="text-[10px] font-mono text-slate-400 mt-0.5">Số lần nhảy tàu: <span className="font-bold text-slate-200">{item.leapCount} trận</span></div>
                  </div>

                  <div className="border-t border-slate-800/40 pt-2.5 mt-2 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Sát giờ tb:</span>
                    <span className="font-mono font-black text-amber-400 bg-slate-950/60 px-2 py-0.5 rounded-md border border-slate-850">{item.avgGapMinutes} phút</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Bar Chart of Top 10 */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-3xl p-6 shadow-lg lg:col-span-2 hover:border-slate-700/50 transition duration-300">
          <h3 className="text-sm font-semibold text-slate-200 mb-5 flex items-center space-x-2">
            <BarChart3 className="w-4.5 h-4.5 text-emerald-400" />
            <span className="font-display font-medium">Bảng Thành Tích Xếp Hạng Top 10</span>
          </h3>
          
          <div className="h-80 w-full text-xs">
            {topPlayersData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-550 space-y-2">
                <p className="font-bold uppercase tracking-wider text-[10px] text-slate-500">Chưa có dữ liệu người chơi tranh tài.</p>
                <p className="text-[11px] italic">Sử dụng nút nạp dữ liệu tại tab "Quản Trị" để xem biểu đồ!</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topPlayersData}
                  margin={{ top: 10, right: 10, left: -25, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" stroke="#64748b" />
                  <YAxis stroke="#64748b" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#020617',
                      borderColor: '#1e293b',
                      borderRadius: '16px',
                      color: '#f8fafc',
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: 10 }} />
                  <Bar dataKey="Điểm Số" fill={BAR_COLORS.SCORE} radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Dự Đoán Đúng" fill={BAR_COLORS.CORRECT} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Accuracy Distribution Pie Chart */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-3xl p-6 shadow-lg hover:border-slate-700/50 transition duration-300">
          <h3 className="text-sm font-semibold text-slate-200 mb-5 flex items-center space-x-2">
            <TrendingUp className="w-4.5 h-4.5 text-emerald-400" />
            <span className="font-display font-medium">Độ chính xác toàn hệ thống</span>
          </h3>

          <div className="h-60 w-full relative flex items-center justify-center">
            {totalEvaluatedCount === 0 ? (
              <div className="text-center text-slate-500 text-xs font-bold uppercase tracking-wider">
                Chưa có bình chọn nào được chấm điểm.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={accuracyPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={64}
                    outerRadius={84}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {accuracyPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#020617',
                      borderColor: '#1e293b',
                      borderRadius: '16px',
                      color: '#f8fafc',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}

            {/* Absolute accuracy percentage in center of donut */}
            {totalEvaluatedCount > 0 && (
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-slate-100 font-mono tracking-tight">{averageAccuracy}%</span>
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Thời điểm</span>
              </div>
            )}
          </div>

          <div className="flex justify-center space-x-5 text-xs text-slate-300 mt-3 select-none">
            <div className="flex items-center space-x-1.5">
              <div className="w-2.5 h-2.5 bg-emerald-400 rounded-full" />
              <span className="font-medium text-[11px]">Đúng ({totalCorrectCount})</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <div className="w-2.5 h-2.5 bg-red-400 rounded-full" />
              <span className="font-medium text-[11px]">Sai ({totalWrongCount})</span>
            </div>
          </div>
        </div>

      </div>

      {/* Dynamic Performance Metrics Insights */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-3xl p-6 shadow-lg hover:border-slate-700/50 transition">
        <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-2 flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-450 animate-pulse"></span>
          <span>Báo cáo chiến thuật World Cup 2026</span>
        </h4>
        <div className="text-xs text-slate-300 leading-relaxed space-y-2">
          <p>
            - <strong>Quán quân hiện tại:</strong> {leaderboard.length > 0 ? <span className="text-amber-400 font-bold">{leaderboard[0].name}</span> : 'Chưa xác định'} hiện đang dẫn đầu bảng với tổng số điểm tích lũy <span className="font-mono text-emerald-400 font-black">{leaderboard.length > 0 ? leaderboard[0].score : 0} điểm</span>.
          </p>
          <p>
            - <strong>Tỉ lệ cạnh tranh bứt phá:</strong> World Cup với thể chế gồm 104 trận đấu tranh hùng toàn lục địa Bắc Mỹ sẽ kiểm chứng tài thao lược bền bỉ. Với đặc quy chế đóng băng cổng bình chọn nghiêm ngặt sau <strong>15 phút bóng lăn</strong>, mỗi tay dự đoán thông thái cần nhạy bén cập nhật tình hình ra sân để mang về những điểm số vàng ròng!
          </p>
        </div>
      </div>

      {/* SECTION: USER VOTING HISTORY (Viewable by all users, search & codes restricted to Admin) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center pb-4 border-b border-slate-800/85 gap-3">
          <div>
            <h2 className="text-base font-black text-slate-100 font-display flex items-center gap-2 uppercase">
              <History className="w-5 h-5 text-sky-400" /> Lịch sử bình chọn của các User
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Tra cứu cụ thể ngày giờ thực tế và lựa chọn dự đoán tỷ số/kết quả của từng thành viên.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <input 
                type="text"
                placeholder="Tìm theo tên hoặc mã..."
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                className="bg-slate-950 border border-slate-850 text-xs font-semibold text-slate-100 rounded-xl py-2 px-3 focus:outline-none w-48"
              />
            )}
            <button 
              type="button"
              onClick={fetchPredictionsHistory} 
              className="p-2 bg-slate-800 hover:bg-slate-705 rounded-xl text-slate-350 transition cursor-pointer"
              title="Cập nhật danh sách mới nhất"
            >
              <RefreshCw className={`w-4 h-4 ${loadingHistory ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/65">
          <div className="overflow-x-auto max-h-[350px] scrollbar-thin">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[9px] tracking-wider border-b border-slate-800 sticky top-0 z-10">
                <tr>
                  <th className="py-3 px-4">Thời gian bình chọn (GMT+7)</th>
                  <th className="py-3 px-4">Thành viên</th>
                  <th className="py-3 px-4">Trận đấu</th>
                  <th className="py-3 px-3 text-center">Lựa chọn</th>
                  <th className="py-3 px-3 text-center">Cách tính điểm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-slate-300">
                {loadingHistory ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500 italic">Đang tải lịch sử bình chọn...</td>
                  </tr>
                ) : filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500 italic">Không có lịch sử bình chọn nào khớp.</td>
                  </tr>
                ) : (
                  paginatedHistory.map((h, idx) => {
                    const formattedDate = h.votedAt 
                      ? new Date(h.votedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
                      : '(chưa rõ thời gian)';
                    return (
                      <tr key={`${h.playerPhone}_${h.matchId}_${idx}`} className="hover:bg-slate-900/40 transition">
                        <td className="py-3 px-4 font-mono text-xs text-slate-400">
                          {formattedDate}
                        </td>
                        <td className="py-3 px-4 text-slate-200">
                          <span className="font-bold">{h.playerName}</span>
                          {isAdmin && h.playerPhone !== '******' && (
                            <span className="block font-mono text-[9px] text-slate-500">{h.playerPhone}</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-slate-300">
                            Trận #{h.matchId}: <strong className="text-slate-100">{h.homeTeam}</strong> vs <strong className="text-slate-100">{h.awayTeam}</strong>
                          </span>
                          <span className="block text-[9.5px] text-slate-500 mt-0.5">Trạng thái: {h.matchStatus === 'FINISHED' ? 'Đã hoàn thành' : 'Chưa hoàn thành'}</span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-wide ${
                            h.prediction === 'HOME' 
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20' 
                              : h.prediction === 'AWAY' 
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/20' 
                                : 'bg-slate-850 text-slate-400 border border-slate-800'
                          }`}>
                            {h.prediction === 'HOME' ? 'Thắng (Home) 🟢' : h.prediction === 'AWAY' ? 'Thua (Away) 🔴' : 'Hòa (Draw) 🟡'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-mono">
                          {h.evaluated ? (
                            <span className={`text-[11px] font-bold ${h.points === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {h.points === 0 ? 'Đoán Đúng (0đ)' : `Đoán Sai/Bỏ qua (+${h.points}đ)`}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic text-[11px]">Chưa tổng kết</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Dynamic Pagination Controls */}
        {totalHistoryPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-800 pt-4 gap-3 text-[11px] pb-1 select-none">
            <span className="text-slate-400 font-sans leading-relaxed text-center sm:text-left">
              Hiển thị <span className="text-slate-200 font-bold">{(historyPage - 1) * historyPageSize + 1} - {Math.min(historyPage * historyPageSize, totalHistoryCount)}</span> trong tổng số <span className="text-slate-200 font-bold">{totalHistoryCount}</span> lượt đoán
            </span>
            <div className="flex items-center space-x-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setHistoryPage(1)}
                disabled={historyPage === 1}
                className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-850 text-[10px] font-semibold border border-slate-850 text-slate-400 hover:text-slate-200 disabled:opacity-40 hover:disabled:text-slate-400 active:scale-95 transition cursor-pointer select-none"
              >
                Đầu
              </button>
              <button
                type="button"
                onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
                disabled={historyPage === 1}
                className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-850 text-[10px] font-semibold border border-slate-850 text-slate-400 hover:text-slate-200 disabled:opacity-40 hover:disabled:text-slate-400 active:scale-95 transition cursor-pointer select-none"
              >
                Trước
              </button>
              <span className="font-mono font-bold text-slate-300 bg-slate-900 border border-slate-850 py-1.5 px-3 rounded-lg text-center min-w-16">
                P. {historyPage} / {totalHistoryPages}
              </span>
              <button
                type="button"
                onClick={() => setHistoryPage((prev) => Math.min(totalHistoryPages, prev + 1))}
                disabled={historyPage === totalHistoryPages}
                className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-850 text-[10px] font-semibold border border-slate-850 text-slate-400 hover:text-slate-200 disabled:opacity-40 hover:disabled:text-slate-450 active:scale-95 transition cursor-pointer select-none"
              >
                Sau
              </button>
              <button
                type="button"
                onClick={() => setHistoryPage(totalHistoryPages)}
                disabled={historyPage === totalHistoryPages}
                className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-850 text-[10px] font-semibold border border-slate-850 text-slate-400 hover:text-slate-200 disabled:opacity-40 hover:disabled:text-slate-450 active:scale-95 transition cursor-pointer select-none"
              >
                Cuối
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
