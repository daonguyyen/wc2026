/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { LeaderboardEntry } from '../types';
import { Award, BarChart3, TrendingUp, HelpCircle, CheckCircle2, RefreshCw } from 'lucide-react';
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
}

export default function StatsDashboard({ leaderboard, totalPredictionsCount }: StatsDashboardProps) {
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
    { name: 'Sai', value: totalWrongCount, color: '#f87171' }, // red-400
  ];

  // Colors for charts
  const BAR_COLORS = {
    SCORE: '#10b981', // emerald-500
    CORRECT: '#60a5fa', // blue-400
    WRONG: '#f87171', // red-450
  };

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
    </div>
  );
}
