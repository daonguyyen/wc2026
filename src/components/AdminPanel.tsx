/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Match } from '../types';
import { 
  Sliders, RefreshCw, UserPlus, FileWarning, Calendar, Check, Search, 
  ShieldAlert, Eye, EyeOff, Lock, Unlock, Users, Loader2, Download, Upload, History, Database, Trash2
} from 'lucide-react';

interface AdminPanelProps {
  matches: Match[];
  currentTime: string;
  isSimulating: boolean;
  onRefresh: () => void;
  onNotify: (msg: string, type: 'success' | 'error') => void;
  adminCode?: string;
}

export default function AdminPanel({
  matches,
  currentTime,
  isSimulating,
  onRefresh,
  onNotify,
  adminCode,
}: AdminPanelProps) {
  const [customTime, setCustomTime] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingMatchId, setUpdatingMatchId] = useState<string | null>(null);
  const [homeScoreInput, setHomeScoreInput] = useState('0');
  const [awayScoreInput, setAwayScoreInput] = useState('0');
  const [homeTeamInput, setHomeTeamInput] = useState('');
  const [awayTeamInput, setAwayTeamInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // States for player reading
  const [playersList, setPlayersList] = useState<{ name: string; code: string; score: number; createdAt: string }[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  // Outright configurations
  const [outrightResults, setOutrightResults] = useState({ champion: '', goldenBoot: '', goldenGlove: '', goldenBall: '' });
  const [outrightPredictions, setOutrightPredictions] = useState<Record<string, any>>({});
  const [outrightEvaluations, setOutrightEvaluations] = useState<Record<string, any>>({});
  const [loadingConfig, setLoadingConfig] = useState(false);

  // States for user voting history and backups
  const [historyList, setHistoryList] = useState<{
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
  }[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [backupsList, setBackupsList] = useState<{ filename: string; size: number; mtime: string }[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [historySearch, setHistorySearch] = useState('');

  // Fetch registered players with direct passcode access
  const fetchPlayersList = async () => {
    if (!adminCode) return;
    setLoadingPlayers(true);
    try {
      const res = await fetch('/api/admin/players', {
        headers: { 'x-admin-code': adminCode }
      });
      if (res.ok) {
        const data = await res.json();
        setPlayersList(data.players || []);
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách người chơi:', err);
    } finally {
      setLoadingPlayers(false);
    }
  };

  // Fetch predictions history
  const fetchPredictionsHistory = async () => {
    if (!adminCode) return;
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/admin/predictions-history', {
        headers: { 'x-admin-code': adminCode }
      });
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

  // Fetch backups from server
  const fetchBackupsList = async () => {
    if (!adminCode) return;
    setLoadingBackups(true);
    try {
      const res = await fetch('/api/admin/backups/list', {
        headers: { 'x-admin-code': adminCode }
      });
      if (res.ok) {
        const data = await res.json();
        setBackupsList(data.backups || []);
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách bản sao lưu:', err);
    } finally {
      setLoadingBackups(false);
    }
  };

  // Create manual backup on server
  const handleCreateBackup = async () => {
    if (!adminCode) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/backups/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-code': adminCode
        },
        body: JSON.stringify({ adminCode })
      });
      const data = await res.json();
      if (res.ok) {
        onNotify(data.message || 'Tạo sao lưu thành công!', 'success');
        fetchBackupsList();
      } else {
        onNotify(data.error || 'Lỗi tạo sao lưu', 'error');
      }
    } catch (err) {
      onNotify('Lỗi kết nối máy chủ khi tạo sao lưu', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Restore server backup
  const handleRestoreBackup = async (filename: string) => {
    if (!adminCode || !filename) return;
    if (!window.confirm(`Bạn có chắc muốn khôi phục dữ liệu từ bản sao lưu "${filename}" không? Toàn bộ điểm số hiện tại sẽ bị ghi đè.`)) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/backups/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-code': adminCode
        },
        body: JSON.stringify({ adminCode, filename })
      });
      const data = await res.json();
      if (res.ok) {
        onNotify(data.message || 'Khôi phục sao lưu thành công!', 'success');
        onRefresh();
        fetchPlayersList();
        fetchPredictionsHistory();
        fetchOutrightConfig();
      } else {
        onNotify(data.error || 'Lỗi khôi phục', 'error');
      }
    } catch (err) {
      onNotify('Lỗi kết nối khôi phục', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Delete server backup
  const handleDeleteBackup = async (filename: string) => {
    if (!adminCode || !filename) return;
    if (!window.confirm(`Bạn có chắc muốn xóa bản sao lưu "${filename}" không?`)) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/backups/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-code': adminCode
        },
        body: JSON.stringify({ adminCode, filename })
      });
      const data = await res.json();
      if (res.ok) {
        onNotify(data.message || 'Xóa thành công!', 'success');
        fetchBackupsList();
      } else {
        onNotify(data.error || 'Lỗi khi xóa', 'error');
      }
    } catch (err) {
      onNotify('Lỗi kết nối khi xóa', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Export backup file download
  const handleExportBackupFile = async () => {
    if (!adminCode) return;
    try {
      const res = await fetch('/api/admin/export-all', { headers: { 'x-admin-code': adminCode } });
      if (res.ok) {
        const backupDataObj = await res.json();
        
        const blob = new Blob([JSON.stringify(backupDataObj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `worldcup26_backup_full_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        onNotify('Tải xuống tệp sao lưu JSON thành công!', 'success');
      } else {
        onNotify('Lỗi khi tải dữ liệu sao lưu từ máy chủ', 'error');
      }
    } catch (err) {
      onNotify('Lỗi chuẩn bị tệp tin sao lưu: ' + err, 'error');
    }
  };

  // Import backup file from browser
  const handleImportBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!adminCode) return;
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const raw = event.target?.result as string;
        const backupDataObj = JSON.parse(raw);
        
        if (!backupDataObj.players || !backupDataObj.predictions) {
          onNotify('Tệp sao lưu không đúng cấu trúc (thiếu players hoặc predictions)!', 'error');
          return;
        }
        
        setIsLoading(true);
        const res = await fetch('/api/admin/backups/import-direct', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-code': adminCode
          },
          body: JSON.stringify({ adminCode, backupData: backupDataObj })
        });
        const data = await res.json();
        if (res.ok) {
          onNotify(data.message || 'Import dữ liệu thành công!', 'success');
          onRefresh();
          fetchPlayersList();
          fetchPredictionsHistory();
          fetchOutrightConfig();
          fetchBackupsList();
        } else {
          onNotify(data.error || 'Lỗi khi import', 'error');
        }
      } catch (err) {
        onNotify('Lỗi đọc nội dung file sao lưu!', 'error');
      } finally {
        setIsLoading(false);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const fetchOutrightConfig = async () => {
    if (!adminCode) return;
    setLoadingConfig(true);
    try {
      const res = await fetch('/api/admin/outright-config', {
        headers: { 'x-admin-code': adminCode }
      });
      if (res.ok) {
        const data = await res.json();
        setOutrightResults(data.results || { champion: '', goldenBoot: '', goldenGlove: '', goldenBall: '' });
        setOutrightPredictions(data.predictions || {});
        setOutrightEvaluations(data.evaluations || {});
      }
    } catch (err) {
      console.error('Lỗi khi tải cấu hình outright:', err);
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleSaveOutrightConfig = async (newResults?: typeof outrightResults, newEvals?: typeof outrightEvaluations) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/outright-config', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-code': adminCode || ''
        },
        body: JSON.stringify({
          adminCode,
          results: newResults || outrightResults,
          evaluations: newEvals || outrightEvaluations
        })
      });
      const data = await res.json();
      if (res.ok) {
        onNotify('Tính toán và cập nhật điểm khấu trừ chung cuộc thành công!', 'success');
        onRefresh();
        fetchOutrightConfig();
      } else {
        onNotify(data.error || 'Lỗi lưu cấu hình', 'error');
      }
    } catch (e) {
      onNotify('Lỗi kết nối máy chủ', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayersList();
    fetchOutrightConfig();
    fetchPredictionsHistory();
    fetchBackupsList();
  }, [adminCode, matches]);

  // Call simulated time update
  const handleSetTime = async (timeStr: string | null) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/time', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-code': adminCode || ''
        },
        body: JSON.stringify({ simulatedTime: timeStr, adminCode }),
      });
      const data = await res.json();
      if (res.ok) {
        onNotify(data.message || 'Cập nhật thời gian mô phỏng thành công!', 'success');
        onRefresh();
      } else {
        onNotify(data.error || 'Lỗi cập nhật thời gian', 'error');
      }
    } catch (e) {
      onNotify('Lỗi kết nối máy chủ', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Populate mock demo users & predictions
  const handleGenerateDemo = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/generate-demo', { 
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-code': adminCode || ''
        },
        body: JSON.stringify({ adminCode })
      });
      const data = await res.json();
      if (res.ok) {
        onNotify('Đã tạo thành công 10 người chơi mô phỏng cùng bảng tỷ số và 150+ dự đoán mẫu!', 'success');
        onRefresh();
      } else {
        onNotify(data.error || 'Lỗi tạo dữ liệu mẫu', 'error');
      }
    } catch (e) {
      onNotify('Lỗi kết nối máy chủ', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Full DB Reset
  const handleResetDB = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/reset-db', { 
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-code': adminCode || ''
        },
        body: JSON.stringify({ adminCode })
      });
      const data = await res.json();
      if (res.ok) {
        onNotify('Đã thiết lập lại cơ sở dữ liệu về trạng thái sạch ban đầu!', 'success');
        setShowResetConfirm(false);
        onRefresh();
      } else {
        onNotify(data.error || 'Lỗi đặt lại cơ sở dữ liệu', 'error');
      }
    } catch (e) {
      onNotify('Lỗi kết nối máy chủ', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Synchronize matches with worldcup26.ir API
  const handleSyncAPI = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/matches/sync', { 
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-code': adminCode || ''
        },
        body: JSON.stringify({ adminCode })
      });
      const data = await res.json();
      if (res.ok) {
        onNotify(data.message || 'Đồng bộ kết quả từ API thành công!', 'success');
        onRefresh();
      } else {
        onNotify(data.error || 'Lỗi đồng bộ API', 'error');
      }
    } catch (e) {
      onNotify('Lỗi kết nối máy chủ khi gọi API', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Submit Match Score
  const handleUpdateScore = async (matchId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/matches/update-score', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-code': adminCode || ''
        },
        body: JSON.stringify({
          matchId,
          homeScore: homeScoreInput,
          awayScore: awayScoreInput,
          status: 'FINISHED',
          homeTeam: homeTeamInput,
          awayTeam: awayTeamInput,
          adminCode,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onNotify(`Cập nhật tỉ số trận ${matchId} thành công! Người chơi đã được tự động tính điểm.`, 'success');
        setUpdatingMatchId(null);
        onRefresh();
      } else {
        onNotify(data.error || 'Lỗi cập nhật tỉ số', 'error');
      }
    } catch (e) {
      onNotify('Lỗi kết nối máy chủ', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle match visibility
  const handleToggleVisibility = async (matchId: string, visible: boolean) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/matches/toggle-visibility', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-code': adminCode || ''
        },
        body: JSON.stringify({ matchId, visible, adminCode }),
      });
      const data = await res.json();
      if (res.ok) {
        onNotify(data.message, 'success');
        onRefresh();
      } else {
        onNotify(data.error || 'Lỗi cấu hình hiển thị', 'error');
      }
    } catch (e) {
      onNotify('Lỗi kết nối máy chủ', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Bulk visibility
  const handleBulkVisibility = async (visible: boolean) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/matches/bulk-visibility', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-code': adminCode || ''
        },
        body: JSON.stringify({ visible, adminCode }),
      });
      const data = await res.json();
      if (res.ok) {
        onNotify(data.message, 'success');
        onRefresh();
      } else {
        onNotify(data.error || 'Lỗi cấu hình hiển thị hàng loạt', 'error');
      }
    } catch (e) {
      onNotify('Lỗi kết nối máy chủ', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredMatches = matches.filter((m) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      m.homeTeam.toLowerCase().includes(query) ||
      m.awayTeam.toLowerCase().includes(query) ||
      m.stage.toLowerCase().includes(query) ||
      `trận ${m.id}`.includes(query)
    );
  });
  
  const filteredHistory = historyList.filter(h => {
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

  const startScoring = (match: Match) => {
    setUpdatingMatchId(match.id);
    setHomeScoreInput(String(match.homeScore ?? 0));
    setAwayScoreInput(String(match.awayScore ?? 0));
    setHomeTeamInput(match.homeTeam || '');
    setAwayTeamInput(match.awayTeam || '');
  };

  return (
    <div id="admin-panel-container" className="space-y-6 animate-fade-in">
      
      {/* QUICK TESTING SUITE BENTO CARD */}
      {false && (
      <div className="bg-slate-900 border border-amber-500/35 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-amber-500/10 rounded-2xl text-amber-400">
            <ShieldAlert className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 font-display">Hộp Kiểm Thử Tính Năng (Vận hành & Chạy thử)</h2>
            <div className="text-[11px] text-amber-400 font-bold uppercase tracking-wider mt-0.5">3 Bước Đơn Giản kiểm chứng: Khóa 15p • Bình chọn • Tính điểm</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          {/* Step 1: Lock 15p */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-2.5">
            <div className="flex items-center space-x-2 text-xs font-black uppercase text-amber-400">
              <span className="bg-amber-500/10 text-amber-400 w-5 h-5 flex items-center justify-center rounded-full border border-amber-500/20 font-mono text-[10px]">1</span>
              <span>Test Khóa 15 Phút</span>
            </div>
            <p className="text-[11.5px] text-slate-350 leading-relaxed font-sans">
              Dự đoán của mỗi trận sẽ tự động bị khóa sau <strong>15 phút bóng lăn</strong> (tính từ giờ bắt đầu trận đấu).
            </p>
            <div className="bg-slate-900/60 p-2 rounded-xl text-[10.5px] text-slate-400 space-y-1.5 border border-slate-850">
              <div>• Chọn <strong className="text-emerald-400">"🟢 Phút thứ 10"</strong> ở bên dưới: Trận 1 (đầu tiên) đang mở và có thể bình chọn.</div>
              <div>• Chọn <strong className="text-rose-400">"🔴 Phút thứ 20"</strong>: Trận 1 lập tức bị khóa, trong khi các trận muộn hơn vẫn mở!</div>
            </div>
          </div>

          {/* Step 2: Voting */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-2.5">
            <div className="flex items-center space-x-2 text-xs font-black uppercase text-cyan-400">
              <span className="bg-cyan-500/10 text-cyan-400 w-5 h-5 flex items-center justify-center rounded-full border border-cyan-500/20 font-mono text-[10px]">2</span>
              <span>Test Bình Chọn</span>
            </div>
            <p className="text-[11.5px] text-slate-350 leading-relaxed font-sans">
              Đăng nhập bằng mã của bạn hoặc tạo tài khoản mới ngay trên cột bên trái giao diện.
            </p>
            <div className="bg-slate-900/60 p-2 rounded-xl text-[10.5px] text-slate-400 space-y-1.5 border border-slate-850">
              <div>• Sang tab <strong>"Lịch thi đấu"</strong>, chọn trận bóng đang mở.</div>
              <div>• Click chọn <strong>Thắng</strong>, <strong>Hòa</strong>, hoặc <strong>Thua</strong>. Lựa chọn của bạn sẽ được lưu ngay lên máy chủ.</div>
            </div>
          </div>

          {/* Step 3: Scoring */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-2.5">
            <div className="flex items-center space-x-2 text-xs font-black uppercase text-emerald-400">
              <span className="bg-emerald-500/10 text-emerald-400 w-5 h-5 flex items-center justify-center rounded-full border border-emerald-500/20 font-mono text-[10px]">3</span>
              <span>Test Ghi Điểm</span>
            </div>
            <p className="text-[11.5px] text-slate-350 leading-relaxed font-sans">
              Kiểm tra điểm số tự động cập nhật và nhảy thứ hạng trên Leaderboard ngay sau khi cập nhật kết quả.
            </p>
            <div className="bg-slate-900/60 p-2 rounded-xl text-[10.5px] text-slate-400 space-y-1.5 border border-slate-850">
              <div>• Đi sang mục <strong>"Ghi Nhận Tỉ Số Ban Tổ Chức"</strong> ở bên dưới.</div>
              <div>• Nhập tỉ số của Trận 1, click <strong>"Cập nhật"</strong>. Điểm số của ai đoán đúng sẽ tự động tăng 1 điểm!</div>
            </div>
          </div>
        </div>

        <div className="bg-emerald-500/5 p-3 rounded-2xl border border-emerald-500/10 text-[11px] text-emerald-400 leading-normal font-medium">
          💡 <strong>Mẹo nhỏ:</strong> Bạn có thể nhấn nút <strong className="underline">"Nạp 10 người chơi ảo & 150+ dự đoán mẫu"</strong> ở card điều khiển phía bên dưới để tự động tạo trước 10 người chơi ảo cùng vô số dự đoán thô giúp phần kiểm nghiệm tính điểm sinh động nhất!
        </div>
      </div>
      )}
      
      {/* Simulation Controls Card (Bento Rounded 3xl) */}
      <div className="bg-slate-900 border border-emerald-500/20 rounded-3xl p-6 shadow-xl space-y-4">
        
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-500/10 rounded-2xl text-emerald-400">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 font-display">Bảng Điều Khiển Giả Lập</h2>
            <div className="text-[11px] text-slate-400 mt-0.5">Thời gian thực tế ảo & đổ mẫu hệ thống</div>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
          Chào mừng đến với Trình quản lý Demo World Cup 2026. Để giúp bạn dễ dàng theo dõi trực quan và kiểm chứng quy luật khóa cổng dự đoán sau <strong>15 phút bóng lăn</strong>, bạn có thể chỉnh tương lai/quá khứ thời thế máy chủ ảo hoặc nạp sẵn nhóm người chơi cùng lịch sử đoán ảo để các bảng biểu, biểu đồ tranh tài được tô điểm lộng lẫy nhất.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-3">
          
          {/* Calendar Dials */}
          <div className="space-y-3 bg-slate-950 p-5 rounded-2xl border border-slate-800">
            <span className="block text-xs font-bold text-slate-300 uppercase tracking-wider">Cài Đặt Ngày Giờ Máy Chủ</span>
            
            <div className="flex items-center justify-between text-xs py-1.5 border-b border-slate-900">
              <span className="text-slate-400 font-medium">Chế độ hiện tại:</span>
              <span className={`px-2 py-0.5 text-[10px] font-black uppercase rounded ${isSimulating ? 'bg-amber-500/10 text-amber-400 border border-amber-500/25' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>
                {isSimulating ? 'Thời Gian Giả Lập' : 'Giờ Hệ Thống Thật'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs py-1 pr-1">
              <span className="text-slate-400 font-medium">Mốc thời gian máy chủ:</span>
              <span className="text-slate-100 font-mono font-bold bg-slate-900/60 px-2 py-0.5 rounded border border-slate-850">
                {new Date(currentTime).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'medium' })}
              </span>
            </div>

            <div className="flex gap-2 pt-2">
              <input
                type="datetime-local"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                className="bg-slate-900 text-xs text-slate-200 border border-slate-800 rounded-xl px-3.5 py-2.5 flex-grow focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all font-mono"
              />
              <button
                type="button"
                onClick={() => customTime && handleSetTime(new Date(customTime).toISOString())}
                disabled={isLoading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center space-x-1 hover:shadow-lg hover:shadow-emerald-950/20 active:scale-95 shrink-0"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Áp dụng</span>
              </button>
            </div>

            <div className="pt-3 border-t border-slate-900 space-y-2">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dịch chuyển nhanh (Đường tắt):</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => handleSetTime(null)}
                  className="bg-slate-900 hover:bg-slate-850 text-slate-300 text-[10px] py-1.5 px-2.5 rounded-lg font-bold border border-slate-800 hover:border-slate-700 transition"
                >
                  ⏱️ Hủy giả lập (Giờ thật)
                </button>
                <button
                  onClick={() => handleSetTime('2026-06-08T12:00:00Z')}
                  className="bg-slate-900 hover:bg-slate-850 text-slate-300 text-[10px] py-1.5 px-2.5 rounded-lg font-bold border border-slate-800 hover:border-slate-700 transition"
                >
                  📅 Trước khai mạc (08/06)
                </button>
                <button
                  onClick={() => handleSetTime('2026-06-11T18:50:00Z')}
                  className="bg-slate-900 hover:bg-slate-850 text-slate-300 text-[10px] py-1.5 px-2.5 rounded-lg font-bold border border-slate-800 hover:border-slate-700 transition"
                >
                  ⚽ Trận 1 khởi tranh (11/06)
                </button>
                <button
                  onClick={() => handleSetTime('2026-06-11T19:10:00Z')}
                  className="bg-slate-900 hover:bg-slate-850 text-amber-400 text-[10px] py-1.5 px-2.5 rounded-lg font-bold border border-amber-500/15 hover:border-amber-500/30 transition"
                >
                  🟢 Phút thứ 10 (Vẫn mở cổng đoán)
                </button>
                <button
                  onClick={() => handleSetTime('2026-06-11T19:20:00Z')}
                  className="bg-slate-900 hover:bg-slate-850 text-rose-455 text-[10px] py-1.5 px-2.5 rounded-lg font-bold border border-rose-500/15 hover:border-rose-500/30 transition"
                >
                  🔴 Phút thứ 20 (Khóa đoán vĩnh viễn!)
                </button>
                <button
                  onClick={() => handleSetTime('2026-06-25T18:00:00Z')}
                  className="bg-slate-900 hover:bg-slate-850 text-slate-300 text-[10px] py-1.5 px-2.5 rounded-lg font-bold border border-slate-800 hover:border-slate-700 transition"
                >
                  🗓️ Cao điểm vòng bảng (25/06)
                </button>
              </div>
            </div>
          </div>

          {/* Quick Demo Utilities */}
          <div className="space-y-3 bg-slate-950 p-5 rounded-2xl border border-slate-800 flex flex-col justify-between">
            <div>
              <span className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Thao Tác Cột Dữ Liệu Demo</span>
              <p className="text-[11px] text-slate-400 leading-normal mb-4">
                Dữ liệu rỗng khó theo dõi biểu đồ? Với một chạm duy nhất, hệ thống nạp tự động hàng chục người chơi kì cựu ảo, 150+ tổ hợp đoán kết quả tự nhiên dọc 104 trận đấu để bạn chiêm ngưỡng thuật toán tính toán độ thăng tiến hiệu quả tức thì.
              </p>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleGenerateDemo}
                disabled={isLoading}
                className="w-full bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/45 text-xs font-bold py-3 px-4 rounded-xl transition flex items-center justify-center space-x-2 shadow-sm cursor-pointer active:scale-98"
              >
                <UserPlus className="w-4 h-4 shrink-0" />
                <span>Nạp 10 người chơi ảo & 150+ dự đoán mẫu</span>
              </button>

              <button
                type="button"
                onClick={handleSyncAPI}
                disabled={isLoading}
                className="w-full bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/25 hover:border-blue-500/45 text-xs font-bold py-3 px-4 rounded-xl transition flex items-center justify-center space-x-2 shadow-sm cursor-pointer active:scale-98"
              >
                <RefreshCw className={`w-4 h-4 shrink-0 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Đồng bộ tỉ số & kết quả live từ API (worldcup26.ir)</span>
              </button>

              {!showResetConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                  disabled={isLoading}
                  className="w-full bg-rose-500/5 hover:bg-rose-500/10 text-rose-455 border border-rose-500/10 hover:border-rose-500/25 text-xs font-bold py-3 px-4 rounded-xl transition flex items-center justify-center space-x-2 cursor-pointer active:scale-98"
                >
                  <FileWarning className="w-4 h-4 shrink-0" />
                  <span>Xóa toàn bộ CSDL (Reset sạch)</span>
                </button>
              ) : (
                <div className="bg-rose-950/20 border border-rose-500/20 rounded-xl p-3.5 space-y-3.5 animate-fade-in text-center">
                  <p className="text-[11px] text-rose-400 font-bold leading-relaxed">
                    ⚠️ CHÚ Ý: Hành động này sẽ XÓA SẠCH toàn bộ người chơi, dự đoán và tỉ số về trạng thái sạch ban đầu!
                  </p>
                  <div className="flex gap-2 justify-center">
                    <button
                      type="button"
                      onClick={() => setShowResetConfirm(false)}
                      disabled={isLoading}
                      className="bg-slate-900 hover:bg-slate-800 text-slate-300 text-[11px] px-3.5 py-2 rounded-xl border border-slate-800 hover:border-slate-750 font-bold transition active:scale-95 cursor-pointer"
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="button"
                      onClick={handleResetDB}
                      disabled={isLoading}
                      className="bg-rose-600 hover:bg-rose-500 text-white text-[11px] px-3.5 py-2 rounded-xl font-bold transition active:scale-95 cursor-pointer flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>Xác nhận xóa</span>
                    </button>
                  </div>

                  <div className="text-[9.5px] text-slate-500 font-mono text-center leading-normal pt-1 bg-slate-950 select-none rounded p-1.5 border border-slate-900">
                    * CHÚ Ý: Reset CSDL sẽ khôi phục tỉ lệ sạch tinh để bắt đầu giải đấu thật.
                  </div>
                </div>
              )}

            </div>
          </div>

        </div>
      </div>

      {/* Registered Players and Passcodes Card */}
      <div id="admin-members-card" className="bg-slate-900 border border-slate-800/80 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex items-center space-x-3 pb-2 border-b border-slate-800/60 justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-500/10 rounded-2xl text-indigo-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 font-display">Danh Sách Thành Viên & Mật Mã Hệ Thống</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Quản lý tài khoản và xem mã bí mật 6 số của từng người (Admin Only)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchPlayersList}
            disabled={loadingPlayers}
            className="text-[10px] text-slate-400 hover:text-slate-200 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-850 transition flex items-center gap-1 cursor-pointer active:scale-95"
          >
            {loadingPlayers ? <Loader2 className="w-3 h-3 animate-spin text-indigo-400" /> : <RefreshCw className="w-3 h-3" />}
            <span>Tải lại</span>
          </button>
        </div>

        <p className="text-xs text-slate-350 leading-relaxed">
          Sổ danh bạ chính thức tổng hợp các thành viên đã đăng ký tham gia đoán trận. Mật mật mã 6 số được hiển thị trực tiếp ở đây để Admin hỗ trợ người chơi quên hoặc mất mật danh đăng nhập.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {loadingPlayers && playersList.length === 0 ? (
            <div className="col-span-full py-6 text-center text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
              <span className="text-xs font-bold font-mono">Đang đồng bộ sổ danh bạ...</span>
            </div>
          ) : playersList.length === 0 ? (
            <div className="col-span-full py-6 text-center text-slate-550 text-xs italic">
              Chưa có thành viên nào đăng ký tài khoản.
            </div>
          ) : (
            playersList.map((usr) => {
              const isAdminUser = usr.name === 'Usr-Bop';
              return (
                <div key={usr.name} className={`bg-slate-950 p-4 rounded-2xl border transition hover:border-slate-800 ${isAdminUser ? 'border-amber-500/20 bg-amber-500/5' : 'border-slate-850'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      {usr.name}
                      {isAdminUser && <span className="bg-amber-500/10 text-amber-400 text-[8px] font-black uppercase px-2 py-0.5 rounded border border-amber-500/20">Admin 👑</span>}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">Điểm: {usr.score}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between bg-slate-900/60 p-2.5 rounded-xl border border-slate-850">
                    <span className="text-[10px] text-slate-400 uppercase font-black font-sans tracking-tight">Mã đăng nhập:</span>
                    <span className="text-xs font-black font-mono text-emerald-440 tracking-widest">{usr.code}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Match Scores Input Section (Bento Rounded 3xl) */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-3xl p-6 shadow-xl space-y-4">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/60">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500/10 rounded-2xl text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 font-display">Ghi Nhận Tỉ Số Ban Tổ Chức</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Đặt điểm thật cho 104 trận đấu World Cup 2026</p>
            </div>
          </div>

          {/* Table Search */}
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-550" />
            <input
              type="text"
              placeholder="Tìm kiếm quốc gia, vòng đấu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 text-xs text-slate-200 pl-10 pr-4 py-2.5 border border-slate-800 rounded-xl focus:outline-none focus:border-emerald-500 transition font-medium"
            />
          </div>
        </div>

        <p className="text-xs text-slate-350 leading-relaxed">
          Tìm kiếm cặp đấu và click <strong>"Cập nhật tỉ số"</strong> để thiết lập kết quả chung cuộc. Hệ thống sẽ ngay tức khắc quét tìm toàn bộ người chơi tham gia bình chọn trận đó và phân định điểm số hoàn toàn tự động (+1 điểm cho dự đoán khớp kết quả, 0 điểm nếu dự đoán sai lệch hoặc lỡ nhịp giờ khóa).
        </p>

        {/* Bulk toggle bar */}
        <div className="flex flex-col sm:flex-row gap-2.5 items-center justify-between bg-slate-950/40 p-4 rounded-2xl border border-slate-850">
          <div className="text-[11px] text-slate-450 font-sans leading-normal">
            💡 <strong>Cài đặt hiển thị nhanh:</strong> Bật cho phép hiển thị ra hoặc ẩn toàn bộ lạt trận theo dõi của người chơi.
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleBulkVisibility(true)}
              className="bg-emerald-900/20 hover:bg-emerald-800/25 text-emerald-400 border border-emerald-500/10 px-3.5 py-2 rounded-xl text-[10px] font-black transition cursor-pointer active:scale-95 shrink-0"
            >
              👁️ HIỆN TOÀN BỘ TRẬN ĐẤU (104)
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleBulkVisibility(false)}
              className="bg-slate-900 hover:bg-slate-850 text-slate-400 border border-slate-800 px-3.5 py-2 rounded-xl text-[10px] font-black transition cursor-pointer active:scale-95 shrink-0"
            >
              👁️‍CẮT ẨN TOÀN BỘ TRẬN ĐẤU
            </button>
          </div>
        </div>

        {/* Dense Bento Table list */}
        <div className="overflow-x-auto max-h-[460px] border border-slate-850 rounded-2xl bg-slate-950 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          <table className="w-full text-left text-xs border-collapse relative">
            <thead className="bg-slate-900/90 text-slate-400 uppercase text-[9.5px] font-bold tracking-widest sticky top-0 border-b border-slate-850 z-10 backdrop-blur-md">
              <tr>
                <th className="py-3.5 px-4">Mã số</th>
                <th className="py-3.5 px-4">Vòng đấu</th>
                <th className="py-3.5 px-4 text-center">Trận đấu kỳ tài</th>
                <th className="py-3.5 px-4 text-center">Tỉ số thực tế</th>
                <th className="py-3.5 px-4 text-center">Trạng thái hiện</th>
                <th className="py-3.5 px-4 text-right pr-4">Lựa chọn cập nhật</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850/60 text-slate-300">
              {filteredMatches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 font-bold uppercase tracking-widest">
                    Chưa tìm thấy cặp trận đấu nào khớp bộ lọc tìm kiếm.
                  </td>
                </tr>
              ) : (
                filteredMatches.map((m) => {
                  const isBeingUpdated = updatingMatchId === m.id;
                  const isFinished = m.status === 'FINISHED';

                  return (
                    <tr key={m.id} className="hover:bg-slate-900/40 transition duration-150">
                      
                      {/* Match id info */}
                      <td className="py-4 px-4 font-mono font-black text-slate-400">Trận {m.id}</td>
                      
                      {/* Match stage info */}
                      <td className="py-4 px-4 font-bold text-[11px] text-slate-400">
                        <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-850 whitespace-nowrap">
                          {m.stage}
                        </span>
                      </td>
                      
                      {/* Versus info */}
                      <td className="py-4 px-4 text-center">
                        {isBeingUpdated ? (
                          <div className="flex flex-col space-y-1.5 items-center justify-center max-w-[160px] mx-auto">
                            <input
                              type="text"
                              value={homeTeamInput}
                              onChange={(e) => setHomeTeamInput(e.target.value)}
                              className="w-full bg-slate-905 text-center text-[11px] font-bold border border-slate-700 rounded-lg py-1 px-1.5 text-slate-100 focus:outline-none focus:border-emerald-500"
                              placeholder="Đội nhà"
                            />
                            <span className="text-[10px] text-slate-550 lowercase font-medium">vs</span>
                            <input
                              type="text"
                              value={awayTeamInput}
                              onChange={(e) => setAwayTeamInput(e.target.value)}
                              className="w-full bg-slate-905 text-center text-[11px] font-bold border border-slate-700 rounded-lg py-1 px-1.5 text-slate-100 focus:outline-none focus:border-emerald-500"
                              placeholder="Đội khách"
                            />
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-center space-x-2 font-bold text-slate-200">
                              <span>{m.homeTeam}</span>
                              <span className="text-[10px] text-slate-550 lowercase font-medium">vs</span>
                              <span>{m.awayTeam}</span>
                            </div>
                            <div className="text-[9.5px] text-slate-500 font-mono mt-0.5">
                              {new Date(m.matchTime).toLocaleString('vi-VN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </>
                        )}
                      </td>
                      
                      {/* Score dials */}
                      <td className="py-4 px-4 text-center">
                        {isBeingUpdated ? (
                          <div className="flex items-center justify-center space-x-1">
                            <input
                              type="number"
                              min="0"
                              value={homeScoreInput}
                              onChange={(e) => setHomeScoreInput(e.target.value)}
                              className="w-12 bg-slate-900 text-center text-xs font-black border border-slate-700 rounded-lg py-1 text-emerald-400 focus:outline-none focus:border-emerald-500 font-mono"
                            />
                            <span className="text-slate-600 font-mono">-</span>
                            <input
                              type="number"
                              min="0"
                              value={awayScoreInput}
                              onChange={(e) => setAwayScoreInput(e.target.value)}
                              className="w-12 bg-slate-900 text-center text-xs font-black border border-slate-700 rounded-lg py-1 text-emerald-400 focus:outline-none focus:border-emerald-500 font-mono"
                            />
                          </div>
                        ) : isFinished ? (
                          <div className="inline-flex items-center space-x-2 bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-xl border border-emerald-500/15">
                            <span className="font-mono font-black">{m.homeScore} - {m.awayScore}</span>
                            <span className="text-[8px] uppercase font-black tracking-wider bg-emerald-500/20 px-1 rounded">FT</span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic text-[11px] font-medium">Chưa cập nhật</span>
                        )}
                      </td>

                      {/* Live Visibility Toggle Control */}
                      <td className="py-4 px-4 text-center">
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() => handleToggleVisibility(m.id, !m.visible)}
                          className={`inline-flex items-center space-x-1 px-3 py-1.5 rounded-full text-[10px] font-bold border transition cursor-pointer active:scale-95 duration-200 select-none ${
                            m.visible
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                              : 'bg-slate-950 text-slate-550 border-slate-850'
                          }`}
                        >
                          {m.visible ? (
                            <>
                              <Eye className="w-3.5 h-3.5 text-emerald-450 shrink-0" />
                              <span>MỞ HIỂN THỊ</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              <span>ĐANG ẨN</span>
                            </>
                          )}
                        </button>
                      </td>
                      
                      {/* Action buttons */}
                      <td className="py-4 px-4 text-right">
                        {isBeingUpdated ? (
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              onClick={() => handleUpdateScore(m.id)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg p-1.5 shadow-md hover:scale-105 transition active:scale-95 cursor-pointer"
                              title="Xác nhận lưu điểm số"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setUpdatingMatchId(null)}
                              className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg px-2.5 py-1 text-[11px] transition font-bold"
                            >
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startScoring(m)}
                            className="bg-slate-900 hover:bg-slate-800 hover:text-slate-100 border border-slate-800 hover:border-slate-700/80 text-slate-400 text-[11px] font-bold px-3 py-1.5 rounded-xl transition-all duration-200 active:scale-95"
                          >
                            Cập nhật tỉ số
                          </button>
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

      {/* SECTION: OUTRIGHT PREDICTIONS ADMINISTRATIVE REGION */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
        <div className="flex justify-between items-center pb-4 border-b border-slate-800/80">
          <div>
            <h2 className="text-base font-black text-slate-100 font-display flex items-center gap-2 uppercase">
              🏆 Đánh giá kết quả chung cuộc (Outrights)
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Admin điền kết quả chính thức hoặc tích chọn trực tiếp những người đoán trúng để khấu trừ điểm tổng.
            </p>
          </div>
          <button 
            type="button"
            onClick={fetchOutrightConfig} 
            className="text-xs font-bold leading-normal bg-slate-800 hover:bg-slate-700 py-2 px-3.5 rounded-xl text-slate-350 transition shrink-0 cursor-pointer"
          >
            Nạp lại 🔃
          </button>
        </div>

        {/* Inputs for Official Winners */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850/80 space-y-1.5">
            <span className="block text-[10px] font-black uppercase tracking-wider text-slate-450">Đội Vô Địch (Champion)</span>
            <input 
              type="text" 
              placeholder="Ví dụ: Pháp..." 
              value={outrightResults.champion} 
              onChange={e => setOutrightResults({ ...outrightResults, champion: e.target.value })}
              className="w-full bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-100 rounded-xl py-2.5 px-3 focus:outline-none"
            />
          </div>
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850/80 space-y-1.5">
            <span className="block text-[10px] font-black uppercase tracking-wider text-slate-450">Vua Phá Lưới (Golden Boot)</span>
            <input 
              type="text" 
              placeholder="Tên cầu thủ..." 
              value={outrightResults.goldenBoot} 
              onChange={e => setOutrightResults({ ...outrightResults, goldenBoot: e.target.value })}
              className="w-full bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-100 rounded-xl py-2.5 px-3 focus:outline-none"
            />
          </div>
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850/80 space-y-1.5">
            <span className="block text-[10px] font-black uppercase tracking-wider text-slate-450">Thủ Môn xuất sắc</span>
            <input 
              type="text" 
              placeholder="Tên thủ môn..." 
              value={outrightResults.goldenGlove} 
              onChange={e => setOutrightResults({ ...outrightResults, goldenGlove: e.target.value })}
              className="w-full bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-100 rounded-xl py-2.5 px-3 focus:outline-none"
            />
          </div>
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850/80 space-y-1.5">
            <span className="block text-[10px] font-black uppercase tracking-wider text-slate-450">Cầu Thủ xuất sắc</span>
            <input 
              type="text" 
              placeholder="Tên cầu thủ..." 
              value={outrightResults.goldenBall} 
              onChange={e => setOutrightResults({ ...outrightResults, goldenBall: e.target.value })}
              className="w-full bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-100 rounded-xl py-2.5 px-3 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button 
            type="button" 
            onClick={() => handleSaveOutrightConfig()}
            className="bg-emerald-600 hover:bg-emerald-500 font-extrabold text-xs text-white px-5 py-3 rounded-xl transition cursor-pointer hover:shadow-lg hover:shadow-emerald-500/10 shadow"
          >
            Lưu Kết Quả Official & Đồng Bộ Điểm Toàn Bộ
          </button>
        </div>

        {/* Player Outright Predictions Matrix */}
        <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/60 shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[9px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Thành viên</th>
                  <th className="py-3 px-4">Đội Vô Địch (-10đ)</th>
                  <th className="py-3 px-4">Top Scorer (-5đ)</th>
                  <th className="py-3 px-4">Thủ Môn xuất sắc (-5đ)</th>
                  <th className="py-3 px-4">Cầu Thủ xuất sắc (-5đ)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-slate-300">
                {playersList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 italic">Chưa có người chơi nào đăng ký.</td>
                  </tr>
                ) : (
                  playersList.map(item => {
                    const pred = outrightPredictions[item.code] || {};
                    const ev = outrightEvaluations[item.code] || {};

                    const toggleEval = (field: 'championCorrect' | 'goldenBootCorrect' | 'goldenGloveCorrect' | 'goldenBallCorrect') => {
                      const updatedEv = {
                        ...outrightEvaluations,
                        [item.code]: {
                          ...ev,
                          [field]: !ev[field]
                        }
                      };
                      setOutrightEvaluations(updatedEv);
                      handleSaveOutrightConfig(outrightResults, updatedEv);
                    };

                    return (
                      <tr key={item.code} className="hover:bg-slate-900/40 transition">
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-slate-250 block">{item.name}</span>
                          <span className="block font-mono text-[9px] text-slate-555 mt-0.5">{item.code}</span>
                        </td>
                        
                        {/* Champion */}
                        <td className="py-3.5 px-4 space-y-1">
                          <div className="font-bold text-slate-100 truncate max-w-40">{pred.champion || <span className="text-slate-650 italic font-medium">(trống)</span>}</div>
                          {pred.champion && (
                            <button 
                              type="button"
                              onClick={() => toggleEval('championCorrect')}
                              className={`px-2 py-0.5 rounded text-[9px] font-black border transition cursor-pointer ${
                                ev.championCorrect 
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                                  : 'bg-rose-950/20 text-rose-455 border-rose-500/20 hover:border-rose-400/35'
                              }`}
                            >
                              {ev.championCorrect ? 'ĐÚNG (Đã trừ 10đ) • ✅' : 'Kích hoạt trừ 10đ'}
                            </button>
                          )}
                        </td>

                        {/* Top Scorer */}
                        <td className="py-3.5 px-4 space-y-1">
                          <div className="font-bold text-slate-100 truncate max-w-40">{pred.goldenBoot || <span className="text-slate-655 italic font-medium">(trống)</span>}</div>
                          {pred.goldenBoot && (
                            <button 
                              type="button"
                              onClick={() => toggleEval('goldenBootCorrect')}
                              className={`px-2 py-0.5 rounded text-[9px] font-black border transition cursor-pointer ${
                                ev.goldenBootCorrect 
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                                  : 'bg-rose-955/20 text-rose-455 border-rose-500/25 hover:border-rose-400/35'
                              }`}
                            >
                              {ev.goldenBootCorrect ? 'ĐÚNG (Đã trừ 5đ) • ✅' : 'Kích hoạt trừ 5đ'}
                            </button>
                          )}
                        </td>

                        {/* Golden Glove */}
                        <td className="py-3.5 px-4 space-y-1">
                          <div className="font-bold text-slate-100 truncate max-w-40">{pred.goldenGlove || <span className="text-slate-655 italic font-medium">(trống)</span>}</div>
                          {pred.goldenGlove && (
                            <button 
                              type="button"
                              onClick={() => toggleEval('goldenGloveCorrect')}
                              className={`px-2 py-0.5 rounded text-[9px] font-black border transition cursor-pointer ${
                                ev.goldenGloveCorrect 
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                                  : 'bg-rose-950/20 text-rose-455 border-rose-500/25 hover:border-rose-400/35'
                              }`}
                            >
                              {ev.goldenGloveCorrect ? 'ĐÚNG (Đã trừ 5đ) • ✅' : 'Kích hoạt trừ 5đ'}
                            </button>
                          )}
                        </td>

                        {/* Golden Ball */}
                        <td className="py-3.5 px-4 space-y-1">
                          <div className="font-bold text-slate-100 truncate max-w-40">{pred.goldenBall || <span className="text-slate-655 italic font-medium">(trống)</span>}</div>
                          {pred.goldenBall && (
                            <button 
                              type="button"
                              onClick={() => toggleEval('goldenBallCorrect')}
                              className={`px-2 py-0.5 rounded text-[9px] font-black border transition cursor-pointer ${
                                ev.goldenBallCorrect 
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                                  : 'bg-rose-950/20 text-rose-455 border-rose-500/25 hover:border-rose-400/35'
                              }`}
                            >
                              {ev.goldenBallCorrect ? 'ĐÚNG (Đã trừ 5đ) • ✅' : 'Kích hoạt trừ 5đ'}
                            </button>
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
      </div>

      {/* SECTION: BACKUP & DATA RETRIEVAL REGION */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center pb-4 border-b border-slate-800/85 gap-3">
          <div>
            <h2 className="text-base font-black text-slate-100 font-display flex items-center gap-2 uppercase">
              <Database className="w-5 h-5 text-emerald-400 animate-pulse" /> Trung tâm sao lưu & Khôi phục (Anti-Loss Engine)
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Sao lưu tự động mỗi ngày/trước reset và giải pháp tải xuống/tải lên tệp cấu bối dự phòng an toàn tuyệt đối.
            </p>
          </div>
          <button 
            type="button"
            onClick={fetchBackupsList} 
            className="text-xs font-bold bg-slate-850 hover:bg-slate-800 py-2 px-3.5 rounded-xl text-slate-350 transition shrink-0 cursor-pointer"
          >
            Nạp danh sách sao lưu 🔃
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Column 1: Action Suite */}
          <div className="bg-slate-950 p-5 rounded-2xl border border-slate-850 space-y-4">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">Hành động sao lưu trực tiếp</h3>
            
            <div className="space-y-3">
              <button 
                type="button"
                onClick={handleCreateBackup}
                className="w-full bg-emerald-700/20 hover:bg-emerald-700/35 border border-emerald-500/25 py-3 px-4 rounded-xl text-xs font-bold text-emerald-400 transition cursor-pointer text-left flex items-center justify-between"
              >
                <span>Tạo sao lưu cục bộ máy chủ</span>
                <Database className="w-4 h-4 ml-1.5" />
              </button>

              <button 
                type="button"
                onClick={handleExportBackupFile}
                className="w-full bg-indigo-700/20 hover:bg-indigo-700/35 border border-indigo-500/25 py-3 px-4 rounded-xl text-xs font-bold text-indigo-400 transition cursor-pointer text-left flex items-center justify-between"
              >
                <span>Xuất tệp sao lưu (.json) về máy</span>
                <Download className="w-4 h-4 ml-1.5" />
              </button>

              <div className="relative">
                <input 
                  type="file" 
                  accept=".json" 
                  id="backup-file-upload-input" 
                  onChange={handleImportBackupFile}
                  className="hidden" 
                />
                <label 
                  htmlFor="backup-file-upload-input"
                  className="w-full bg-amber-700/10 hover:bg-amber-700/20 border border-amber-500/25 py-3 px-4 rounded-xl text-xs font-bold text-amber-400 transition cursor-pointer flex items-center justify-between"
                >
                  <span>Nhập tệp (.json) để khôi phục</span>
                  <Upload className="w-4 h-4 ml-1.5" />
                </label>
              </div>
            </div>

            <div className="text-[10px] text-slate-500 leading-normal font-medium bg-slate-900/60 p-3 rounded-xl border border-slate-850/60 font-sans font-medium">
              ℹ️ <strong>Tự động lưu trữ an toàn:</strong> Toàn bộ điểm số gốc, lựa chọn outrights và các nhánh dự đoán của người dùng được tự động sao lưu định kỳ khi khởi động và trước bất kỳ thao tác reset database nào để tránh mất mát.
            </div>
          </div>

          {/* Column 2 & 3: File back up logs on Server */}
          <div className="md:col-span-2 bg-slate-950 p-5 rounded-2xl border border-slate-850 space-y-3">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">Danh sách bản sao lưu đã lưu trên Máy chủ</h3>
            
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40 font-mono text-[11px]">
              <div className="overflow-y-auto max-h-[220px] scrollbar-thin">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-950 text-slate-450 uppercase text-[9px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Tên file sao lưu</th>
                      <th className="py-2.5 px-3 text-right">Kích cỡ</th>
                      <th className="py-2.5 px-3 text-right">Hành động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850 text-slate-350">
                    {loadingBackups ? (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-slate-550 italic">Đang tải danh sách bản sao lưu...</td>
                      </tr>
                    ) : backupsList.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-slate-550 italic animate-pulse">Chưa có tệp sao lưu nào được lưu trữ.</td>
                      </tr>
                    ) : (
                      backupsList.map(b => (
                        <tr key={b.filename} className="hover:bg-slate-900/60 transition">
                          <td className="py-2.5 px-3 text-slate-250 truncate max-w-xs font-sans-mono" title={b.filename}>
                            <span className="font-bold flex items-center gap-1.5 text-slate-100 font-medium">
                              <Database className="w-3.5 h-3.5 text-slate-500" /> {b.filename}
                            </span>
                            <span className="block font-sans text-[9.5px] text-slate-500 mt-0.5">Khởi tạo: {new Date(b.mtime).toLocaleString('vi-VN')}</span>
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-400">
                            {(b.size / 1024).toFixed(1)} KB
                          </td>
                          <td className="py-2.5 px-3 text-right space-x-1 font-sans">
                            <button 
                              type="button"
                              onClick={() => handleRestoreBackup(b.filename)}
                              className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-[10.5px] font-black py-1 px-2.5 rounded hover:text-emerald-300 transition cursor-pointer border border-emerald-500/10"
                            >
                              Khôi phục
                            </button>
                            <button 
                              type="button"
                              onClick={() => handleDeleteBackup(b.filename)}
                              className="bg-rose-600/15 hover:bg-rose-600/25 text-rose-455 text-[10.5px] font-black py-1 px-2 rounded hover:text-rose-400 transition cursor-pointer"
                              title="Xóa bản ghi này"
                            >
                              Xóa
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
