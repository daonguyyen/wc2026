/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Match, Prediction, MatchOdds } from '../types';
import { Calendar, CheckCircle2, XCircle, Search, Trophy, Lock, Unlock, AlertCircle, Clock } from 'lucide-react';

interface MatchListProps {
  matches: Match[];
  predictions: Record<string, Prediction>; // key: playerPhone_matchId
  odds: Record<string, MatchOdds>; // key: matchId
  playerPhone: string | null;
  currentTime: string;
  onVote: (matchId: string, prediction: 'HOME' | 'DRAW' | 'AWAY') => void;
  onOpenLogin: () => void;
  isAdminUser?: boolean;
}

const TEAM_FLAGS: Record<string, string> = {
  'Mexico': '🇲🇽', 'Ecuador': '🇪🇨', 'Venezuela': '🇻🇪', 'Jamaica': '🇯🇲',
  'Canada': '🇨🇦', 'Argentina': '🇦🇷', 'Peru': '🇵🇪', 'Chile': '🇨🇱',
  'Mỹ (USA)': '🇺🇸', 'Uruguay': '🇺🇾', 'Panama': '🇵🇦', 'Bolivia': '🇧🇴',
  'Brazil': '🇧🇷', 'Colombia': '🇨🇴', 'Paraguay': '🇵🇾', 'Costa Rica': '🇨🇷',
  'Pháp (France)': '🇫🇷', 'Hà Lan': '🇳🇱', 'Ba Lan': '🇵🇱', 'Áo': '🇦🇹',
  'Bỉ (Belgium)': '🇧🇪', 'Slovakia': '🇸🇰', 'Romania': '🇷🇴', 'Ukraine': '🇺🇦',
  'Đức (Germany)': '🇩🇪', 'Hungary': '🇭🇺', 'Thụy Sĩ': '🇨🇭', 'Scotland': '🏴',
  'Tây Ban Nha': '🇪🇸', 'Croatia': '🇭🇷', 'Ý (Italy)': '🇮🇹', 'Albania': '🇦🇱',
  'Anh (England)': '🏴', 'Đan Mạch': '🇩🇰', 'Slovenia': '🇸🇮', 'Serbia': '🇷🇸',
  'Bồ Đào Nha': '🇵🇹', 'Thổ Nhĩ Kỳ': '🇹🇷', 'Georgia': '🇬🇪', 'CH Séc': '🇨🇿',
  'Ma-rốc (Morocco)': '🇲🇦', 'CHDC Công-gô': '🇨🇩', 'Zambia': '🇿🇲', 'Tanzania': '🇹🇿',
  'Nhật Bản (Japan)': '🇯🇵', 'Úc (Australia)': '🇦🇺', 'Ả Rập Xê-út': '🇸🇦', 'Bahrain': '🇧🇭'
};

function getTeamFlag(teamName: string): string {
  for (const k of Object.keys(TEAM_FLAGS)) {
    if (teamName.includes(k) || k.includes(teamName)) {
      return TEAM_FLAGS[k];
    }
  }
  return '⚽';
}

export default function MatchList({
  matches,
  predictions,
  odds,
  playerPhone,
  currentTime,
  onVote,
  onOpenLogin,
  isAdminUser = false,
}: MatchListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<'ALL' | 'GROUP' | 'PLAYOFF'>('ALL');
  const [predictionTypeFilter, setPredictionTypeFilter] = useState<'ALL' | 'VOTED' | 'NOT_VOTED' | 'OPEN'>('ALL');
  const [showHiddenByAdmin, setShowHiddenByAdmin] = useState(false);

  const now = new Date(currentTime);

  // Filter and sort matches
  const filteredMatches = matches.filter((m) => {
    // 0. Match Visibility Filter
    if (m.visible === false && (!isAdminUser || !showHiddenByAdmin)) {
      return false;
    }

    // 1. Search Query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchText = `${m.homeTeam} ${m.awayTeam} ${m.stage} trận ${m.id}`.toLowerCase();
      if (!matchText.includes(q)) return false;
    }

    // 2. Stage Filter
    if (stageFilter === 'GROUP' && !m.stage.startsWith('Vòng bảng')) return false;
    if (stageFilter === 'PLAYOFF' && m.stage.startsWith('Vòng bảng')) return false;

    // 3. User Vote Status Filter
    if (playerPhone) {
      const predKey = `${playerPhone}_${m.id}`;
      const hasPred = !!predictions[predKey];
      const matchTime = new Date(m.matchTime);
      const isLocked = now > new Date(matchTime.getTime() + 15 * 60 * 1000);

      if (predictionTypeFilter === 'VOTED' && !hasPred) return false;
      if (predictionTypeFilter === 'NOT_VOTED' && hasPred) return false;
      if (predictionTypeFilter === 'OPEN' && (isLocked || m.status === 'FINISHED')) return false;
    } else {
      if (predictionTypeFilter !== 'ALL') {
        // Can't filter by user status if not logged in - reset or ignore
        return true;
      }
    }

    return true;
  });

  // Calculate timing status of a match
  const getMatchTimeStatus = (m: Match) => {
    const matchTime = new Date(m.matchTime);
    const lockTime = new Date(matchTime.getTime() + 15 * 60 * 1000); // T + 15'
    
    if (m.status === 'FINISHED') {
      return { label: 'Kết thúc', style: 'bg-slate-800 text-slate-400 border-slate-750', value: 'FINISHED' };
    }

    if (now > lockTime) {
      return { label: 'Đã khóa bình chọn', style: 'bg-rose-500/10 text-rose-400 border-rose-500/20', value: 'LOCKED', icon: <Lock className="w-3.5 h-3.5 mr-1" /> };
    }

    if (now > matchTime) {
      // Within first 15 minutes of match start!
      const elapsedMins = Math.floor((now.getTime() - matchTime.getTime()) / 60000);
      const remainingMins = 15 - elapsedMins;
      return {
        label: `Đang đá (Phút ${elapsedMins}') - Còn ${remainingMins} phút để khoá`,
        style: 'bg-amber-500/15 text-amber-400 border-amber-500/20 animate-pulse font-semibold',
        value: 'START_ACTIVE',
        icon: <Clock className="w-3.5 h-3.5 mr-1 animate-spin text-amber-400" />
      };
    }

    return { label: 'Mở bình chọn', style: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', value: 'OPEN', icon: <Unlock className="w-3.5 h-3.5 mr-1" /> };
  };

  return (
    <div id="match-center-container" className="space-y-6">
      
      {/* Controls & Filter Header (Bento styled rounded-3xl) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-lg space-y-5">
        
        {/* Search and Stage Selector Row */}
        <div className="flex flex-col md:flex-row gap-4">
          
          {/* Fuzzy Search Box */}
          <div className="relative flex-grow">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Tìm kiếm quốc gia, vòng đấu, Mã trận... (Ví dụ: 'Mỹ', 'Knockout', 'Trận 104')"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 text-xs text-slate-200 pl-11 pr-4 py-3 border border-slate-800 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all font-medium"
            />
          </div>

          {/* Group vs Playoff Filter Row (Bento styled capsule) */}
          <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800/80 shrink-0 select-none">
            <button
              onClick={() => setStageFilter('ALL')}
              className={`text-[11px] font-semibold px-4 py-2 rounded-lg transition-all ${stageFilter === 'ALL' ? 'bg-slate-800 text-slate-100 shadow-md border border-slate-700/50' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Tất cả (104)
            </button>
            <button
              onClick={() => setStageFilter('GROUP')}
              className={`text-[11px] font-semibold px-4 py-2 rounded-lg transition-all ${stageFilter === 'GROUP' ? 'bg-slate-800 text-slate-100 shadow-md border border-slate-700/50' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Vòng Bảng (72)
            </button>
            <button
              onClick={() => setStageFilter('PLAYOFF')}
              className={`text-[11px] font-semibold px-4 py-2 rounded-lg transition-all ${stageFilter === 'PLAYOFF' ? 'bg-slate-800 text-slate-100 shadow-md border border-slate-700/50' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Knockout (32)
            </button>
          </div>
        </div>

        {/* Prediction Status Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-2 border-t border-slate-800/60 gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mr-1">Lọc nhanh:</span>
            
            <button
              onClick={() => setPredictionTypeFilter('ALL')}
              className={`text-[10px] font-bold py-1.5 px-3 rounded-full border transition uppercase tracking-wide ${predictionTypeFilter === 'ALL' ? 'bg-slate-800 text-slate-100 border-slate-755' : 'bg-slate-950 text-slate-400 border-slate-850 hover:border-slate-800'}`}
            >
              Tất cả trận đấu
            </button>

            {playerPhone ? (
              <>
                <button
                  onClick={() => setPredictionTypeFilter('VOTED')}
                  className={`text-[10px] font-bold py-1.5 px-3 rounded-full border transition uppercase tracking-wide ${predictionTypeFilter === 'VOTED' ? 'bg-emerald-950/60 text-emerald-400 border-emerald-900/50' : 'bg-slate-950 text-slate-400 border-slate-850 hover:border-slate-800'}`}
                >
                  Đã bình chọn
                </button>
                <button
                  onClick={() => setPredictionTypeFilter('NOT_VOTED')}
                  className={`text-[10px] font-bold py-1.5 px-3 rounded-full border transition uppercase tracking-wide ${predictionTypeFilter === 'NOT_VOTED' ? 'bg-amber-950/40 text-amber-400 border-amber-900/30' : 'bg-slate-950 text-slate-400 border-slate-850 hover:border-slate-800'}`}
                >
                  Chưa bình chọn
                </button>
                <button
                  onClick={() => setPredictionTypeFilter('OPEN')}
                  className={`text-[10px] font-bold py-1.5 px-3 rounded-full border transition uppercase tracking-wide ${predictionTypeFilter === 'OPEN' ? 'bg-blue-950/65 text-blue-400 border-blue-900/40' : 'bg-slate-950 text-slate-400 border-slate-850 hover:border-slate-800'}`}
                >
                  Đang mở bình chọn
                </button>
              </>
            ) : (
              <span className="text-[10px] text-slate-550 italic leading-snug">
                * Phiên đăng nhập SĐT được kích hoạt sẽ mở bộ lọc chi tiết cho ván đấu cá nhân.
              </span>
            )}
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-3">
            {isAdminUser && (
              <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-850 select-none">
                <input
                  type="checkbox"
                  id="admin-toggle-hidden-matches"
                  checked={showHiddenByAdmin}
                  onChange={(e) => setShowHiddenByAdmin(e.target.checked)}
                  className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer rounded"
                />
                <label htmlFor="admin-toggle-hidden-matches" className="text-[10px] uppercase tracking-wider font-extrabold text-amber-500 cursor-pointer">
                  Hiện trận đang ẩn 👁️‍🗨️
                </label>
              </div>
            )}

            <div className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-wider text-right py-0.5">
              đang hiển thị: <span className="text-emerald-405 text-xs font-black">{filteredMatches.length}</span> / {matches.length} TRẬN
            </div>
          </div>
        </div>

      </div>

      {/* Rules Notice Callout in Bento style */}
      <div className="bg-slate-900/40 border border-amber-500/20 text-slate-300 p-5 rounded-3xl flex items-start space-x-4 text-xs leading-relaxed hover:border-amber-500/30 transition-colors duration-300">
        <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-amber-400">LUẬT BÌNH CHỌN: </span>
          Mỗi lượt đoán chính xác mang lại <span className="text-emerald-400 font-bold">+1 điểm</span>. 
          Khung giờ bình chọn chỉ mở hợp pháp trước trận đấu và kéo dài đúng <strong>15 phút đầu tiên</strong> (T + 15') kể từ lúc bóng lăn. 
          Quá thời gian trên cổng bình chọn hoặc chỉnh sửa sẽ <span className="text-rose-400 font-semibold border-b border-rose-455/30">bị khóa vĩnh viễn 🔒</span> và vạch kết quả trận đó xem như không có điểm.
        </div>
      </div>

      {/* Matches Grid (Bento cards layout) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredMatches.length === 0 ? (
          <div className="md:col-span-2 py-12 text-center text-slate-500 text-xs font-bold border border-slate-850 bg-slate-950 rounded-3xl uppercase tracking-wider">
            Không tìm thấy trận đấu nào thỏa mãn bộ lọc hiển thị.
          </div>
        ) : (
          filteredMatches.map((m) => {
            const timeStatus = getMatchTimeStatus(m);
            const mTime = new Date(m.matchTime);
            
            const predKey = playerPhone ? `${playerPhone}_${m.id}` : '';
            const userPred = playerPhone ? predictions[predKey] : null;
            const matchOdds = odds[m.id];

            const isLockedOrFinished = timeStatus.value === 'LOCKED' || timeStatus.value === 'FINISHED';

            return (
              <div
                key={m.id}
                id={`match-card-${m.id}`}
                className={`bg-slate-900 border ${userPred ? 'border-emerald-500/25 shadow-[0_4px_24px_rgba(16,185,129,0.03)]' : 'border-slate-800'} hover:border-slate-700/80 rounded-3xl p-6 shadow-sm transition-all duration-300 hover:translate-y-[-1px] flex flex-col justify-between space-y-5`}
              >
                
                {/* Meta details */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-950 px-2 py-0.5 rounded border border-slate-850">
                      Trận {m.id}
                    </span>
                    {m.visible === false && (
                      <span className="bg-rose-500/15 text-rose-400 text-[8.5px] font-black uppercase px-2 py-0.5 rounded border border-rose-500/25">
                        Đang Ẩn 👁️‍🗨️
                      </span>
                    )}
                    <span className="text-[11px] font-semibold text-emerald-400">
                      {m.stage}
                    </span>
                  </div>
                  
                  {/* Lock badge status */}
                  <div className={`inline-flex items-center text-[10px] font-bold uppercase py-0.5 px-2 rounded-full border ${timeStatus.style}`}>
                    {timeStatus.icon}
                    <span>{timeStatus.label}</span>
                  </div>
                </div>

                {/* Team Vs Grid (Bento style) */}
                <div className="grid grid-cols-3 items-center justify-center py-2.5 relative">
                  
                  {/* Home Team */}
                  <div className="text-center space-y-2 flex flex-col items-center">
                    <div className="w-14 h-14 bg-slate-950 rounded-2xl flex items-center justify-center text-3xl shadow-inner border border-slate-800/80 group-hover:border-slate-700/50 transition duration-305 select-none animate-fade-in">
                      {getTeamFlag(m.homeTeam)}
                    </div>
                    <div className="text-xs font-bold text-slate-100 truncate w-full px-1">{m.homeTeam}</div>
                  </div>

                  {/* Middle Versus / Score */}
                  <div className="text-center flex flex-col items-center justify-center space-y-2">
                    {m.status === 'FINISHED' ? (
                      <div className="bg-slate-950 rounded-xl px-3.5 py-1.5 border border-slate-800 text-center scale-105 shadow-inner">
                        <span className="text-lg font-mono font-black text-emerald-400">{m.homeScore}</span>
                        <span className="text-slate-600 px-1 font-bold">-</span>
                        <span className="text-lg font-mono font-black text-emerald-400">{m.awayScore}</span>
                      </div>
                    ) : (
                      <div className="text-xl font-black text-slate-700 font-display select-none">
                        VS
                      </div>
                    )}
                    
                    <div className="text-[10px] font-mono text-slate-500 font-bold flex items-center space-x-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-850/40">
                      <Calendar className="w-3 h-3 text-slate-500 shrink-0" />
                      <span>{mTime.toLocaleString('vi-VN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>

                  {/* Away Team */}
                  <div className="text-center space-y-2 flex flex-col items-center">
                    <div className="w-14 h-14 bg-slate-950 rounded-2xl flex items-center justify-center text-3xl shadow-inner border border-slate-800/80 group-hover:border-slate-700/50 transition duration-305 select-none animate-fade-in">
                      {getTeamFlag(m.awayTeam)}
                    </div>
                    <div className="text-xs font-bold text-slate-100 truncate w-full px-1">{m.awayTeam}</div>
                  </div>
                  
                </div>

                {/* Voter Buttons Grid (Bento style) */}
                <div className="space-y-3">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {isLockedOrFinished ? 'Kết quả bình chọn' : 'Chọn dự đoán nhận điểm'}
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    
                    {/* Home Team Win Button */}
                    <button
                      type="button"
                      disabled={isLockedOrFinished || !playerPhone}
                      onClick={() => onVote(m.id, 'HOME')}
                      className={`relative text-xs py-3 px-2 rounded-xl border font-bold flex flex-col items-center justify-center transition-all duration-200 ${
                        userPred?.prediction === 'HOME'
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-355 font-extrabold shadow-[0_2px_12px_rgba(16,185,129,0.1)]'
                          : isLockedOrFinished
                          ? 'bg-slate-950/20 border-slate-900/40 text-slate-600 cursor-not-allowed'
                          : 'bg-slate-950 hover:bg-slate-850 border-slate-800 text-slate-355 hover:border-slate-700'
                      }`}
                    >
                      <span className="truncate w-full text-center">{m.homeTeam}</span>
                      <span className="text-[9px] text-slate-500 mt-0.5 font-mono">Odds {matchOdds?.homeOdds ? `${matchOdds.homeOdds}` : '1.80'}</span>
                    </button>

                    {/* Draw Button */}
                    <button
                      type="button"
                      disabled={isLockedOrFinished || !playerPhone}
                      onClick={() => onVote(m.id, 'DRAW')}
                      className={`relative text-xs py-3 px-2 rounded-xl border font-bold flex flex-col items-center justify-center transition-all duration-200 ${
                        userPred?.prediction === 'DRAW'
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-355 font-extrabold shadow-[0_2px_12px_rgba(16,185,129,0.1)]'
                          : isLockedOrFinished
                          ? 'bg-slate-950/20 border-slate-900/40 text-slate-600 cursor-not-allowed'
                          : 'bg-slate-950 hover:bg-slate-850 border-slate-800 text-slate-355 hover:border-slate-700'
                      }`}
                    >
                      <span>Hòa</span>
                      <span className="text-[9px] text-slate-500 mt-0.5 font-mono font-medium">Odds {matchOdds?.drawOdds ? `${matchOdds.drawOdds}` : '3.20'}</span>
                    </button>

                    {/* Away Team Win Button */}
                    <button
                      type="button"
                      disabled={isLockedOrFinished || !playerPhone}
                      onClick={() => onVote(m.id, 'AWAY')}
                      className={`relative text-xs py-3 px-2 rounded-xl border font-bold flex flex-col items-center justify-center transition-all duration-200 ${
                        userPred?.prediction === 'AWAY'
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-355 font-extrabold shadow-[0_2px_12px_rgba(16,185,129,0.1)]'
                          : isLockedOrFinished
                          ? 'bg-slate-950/20 border-slate-900/40 text-slate-600 cursor-not-allowed'
                          : 'bg-slate-950 hover:bg-slate-850 border-slate-800 text-slate-355 hover:border-slate-700'
                      }`}
                    >
                      <span className="truncate w-full text-center">{m.awayTeam}</span>
                      <span className="text-[9px] text-slate-500 mt-0.5 font-mono font-medium">Odds {matchOdds?.awayOdds ? `${matchOdds.awayOdds}` : '2.40'}</span>
                    </button>

                  </div>

                  {/* Auth / Result state callouts */}
                  {!playerPhone ? (
                    <button
                      onClick={onOpenLogin}
                      className="w-full text-center text-[10px] font-bold text-amber-400 bg-amber-500/5 hover:bg-amber-500/10 py-2.5 rounded-xl border border-amber-500/10 hover:border-amber-500/25 transition cursor-pointer uppercase tracking-wider font-display"
                    >
                      🔒 Đăng nhập SĐT để tiến hành bình chọn
                    </button>
                  ) : userPred ? (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] px-3.5 bg-slate-950/70 py-2.5 rounded-xl border border-slate-850/60 gap-2">
                      <span className="text-slate-400 font-medium">
                        Đã chọn:{' '}
                        <span className="text-slate-200 font-bold ml-1 uppercase tracking-wide bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          {userPred.prediction === 'HOME'
                            ? m.homeTeam
                            : userPred.prediction === 'AWAY'
                            ? m.awayTeam
                            : 'Hòa'}
                        </span>
                      </span>
                      {m.status === 'FINISHED' ? (
                        userPred.points > 0 ? (
                          <div className="flex items-center text-emerald-400 font-bold bg-emerald-500/10 px-2 rounded-full border border-emerald-500/15 text-[10px] uppercase tracking-wider">
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            <span>+1 Điểm (Đoán Đúng)</span>
                          </div>
                        ) : (
                          <div className="flex items-center text-red-555 font-bold bg-red-500/5 px-2 rounded-full border border-red-500/15 text-[10px] uppercase tracking-wider">
                            <XCircle className="w-3.5 h-3.5 mr-1 text-red-400" />
                            <span>0 Điểm (Đoán Sai)</span>
                          </div>
                        )
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-wider">
                          Đã lưu tại: {new Date(userPred.votedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  ) : m.status === 'FINISHED' ? (
                    <div className="text-[10.5px] italic text-rose-455 bg-rose-950/10 p-2.5 rounded-xl border border-rose-950/20 text-center font-medium">
                      Bạn không tham gia dự đoán trận đấu này (0 điểm)
                    </div>
                  ) : isLockedOrFinished ? (
                    <div className="text-[10.5px] bg-slate-950/60 border border-slate-900/40 p-2.5 rounded-xl text-center text-rose-455 font-bold uppercase tracking-wider">
                      ❌ Bị bỏ lỡ! Đã khóa và không bình chọn kịp (0 điểm)
                    </div>
                  ) : (
                    <div className="text-center text-[10.5px] text-slate-505 font-medium">
                      ⚡ Bạn chưa chọn dự đoán cho cặp trận này. Đừng để lỡ!
                    </div>
                  )}

                </div>

              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
