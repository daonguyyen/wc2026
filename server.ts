/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { generate104Matches } from './src/data/worldcupMatches.js';
import { Match, Player, Prediction } from './src/types.js';

dotenv.config();

const app = express();
const PORT = 3000;
const DB_PATH = path.join(process.cwd(), 'data', 'db.json');

// Ensure database folder exists
if (!fs.existsSync(path.join(process.cwd(), 'data'))) {
  fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });
}

// Global In-Memory DB state (flushed to disk on modifications)
interface Database {
  players: Record<string, Player>;
  predictions: Record<string, Prediction>;
  matches: Match[];
  simulatedTime: string | null; // Simulated server ISO time
}

let db: Database = {
  players: {},
  predictions: {},
  matches: [],
  simulatedTime: null,
};

// Helper check for admin privileges based on Usr-Bop's pass code
function isAdmin(req: express.Request): boolean {
  const code = req.headers['x-admin-code'] || req.query.adminCode || req.body.adminCode;
  if (!code) return false;
  const player = db.players[String(code).trim()];
  return player && player.name === 'Usr-Bop';
}

// Seed 6 default users with patternless random-looking passcodes
function seedDefaultPlayers() {
  const defaultPlayers = [
    { name: 'Usr-Dần', code: '582914' },
    { name: 'Usr-Bin', code: '719462' },
    { name: 'Usr-Bop', code: '348105' }, // Admin
    { name: 'Usr-Bảy', code: '925183' },
    { name: 'Usr-Bo', code: '260341' },
    { name: 'Usr-Bi', code: '815729' },
  ];

  // Clean up any historical old sequential codes if present
  const legacyCodes = ['666001', '666002', '666003', '666004', '666005', '666006', '666007', '666008', '666009', '666010'];
  for (const lc of legacyCodes) {
    if (db.players[lc]) {
      delete db.players[lc];
    }
  }

  for (const dp of defaultPlayers) {
    if (!db.players[dp.code]) {
      db.players[dp.code] = {
        phoneNumber: dp.code,
        name: dp.name,
        score: 0,
        createdAt: new Date('2026-06-08T00:00:00Z').toISOString(),
      };
    }
  }
}

// Seed / Load database
function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf-8');
      db = JSON.parse(data);
      // Fallback matching
      if (!db.matches || db.matches.length === 0) {
        db.matches = generate104Matches().map(m => ({ ...m, visible: Number(m.id) <= 8 }));
      } else {
        // Ensure visible flag is defined on all loaded matches, default to true for the first 8 matches
        db.matches = db.matches.map(m => ({
          ...m,
          visible: m.visible !== undefined ? m.visible : Number(m.id) <= 8
        }));
      }
      seedDefaultPlayers();
      saveDB();
    } else {
      db = {
        players: {},
        predictions: {},
        matches: generate104Matches().map(m => ({ ...m, visible: Number(m.id) <= 8 })),
        simulatedTime: null,
      };
      seedDefaultPlayers();
      saveDB();
    }
  } catch (error) {
    console.error('Lỗi khi tải cơ sở dữ liệu, khởi tạo lại:', error);
    db = {
      players: {},
      predictions: {},
      matches: generate104Matches().map(m => ({ ...m, visible: Number(m.id) <= 8 })),
      simulatedTime: null,
    };
    seedDefaultPlayers();
    saveDB();
  }
}

function saveDB() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
  } catch (error) {
    console.error('Lỗi khi lưu cơ sở dữ liệu:', error);
  }
}

loadDB();

// Middlewares
app.use(express.json());

// Helper: Get Current Time (supporting simulation)
function getCurrentTime(): Date {
  if (db.simulatedTime) {
    return new Date(db.simulatedTime);
  }
  return new Date();
}

/**
 * REST APIs
 */

// 1. Get current server state & simulated clock
app.get('/api/server-info', (req, res) => {
  res.json({
    currentTime: getCurrentTime().toISOString(),
    isSimulating: db.simulatedTime !== null,
    simulatedTime: db.simulatedTime,
  });
});

// 2. Set simulated server time (Admin / User Test)
app.post('/api/admin/time', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Quyền admin bị từ chối! Chức năng này chỉ dành cho tài khoản Admin.' });
  }
  const { simulatedTime } = req.body; // Can be ISO string or null to reset
  if (simulatedTime === null) {
    db.simulatedTime = null;
  } else {
    const d = new Date(simulatedTime);
    if (isNaN(d.getTime())) {
      return res.status(400).json({ error: 'Định dạng thời gian không hợp lệ' });
    }
    db.simulatedTime = d.toISOString();
  }
  saveDB();
  res.json({
    message: 'Cập nhật thời gian mô phỏng thành công',
    currentTime: getCurrentTime().toISOString(),
    isSimulating: db.simulatedTime !== null,
  });
});

// 3. Get matches list (filters by visible flag for regular players unless they provide admin auth)
app.get('/api/matches', (req, res) => {
  if (isAdmin(req)) {
    return res.json({ matches: db.matches });
  }
  const visibleMatches = db.matches.filter(m => m.visible);
  res.json({ matches: visibleMatches });
});

// 4. Update match scores (Admin Simulation Panel)
app.post('/api/matches/update-score', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Quyền admin bị từ chối! Hoạt động ghi điểm chỉ dành cho tài khoản Admin.' });
  }
  const { matchId, homeScore, awayScore, status } = req.body;
  
  const match = db.matches.find((m) => m.id === String(matchId));
  if (!match) {
    return res.status(404).json({ error: 'Không tìm thấy trận đấu' });
  }

  const hScore = Number(homeScore);
  const aScore = Number(awayScore);

  if (isNaN(hScore) || isNaN(aScore)) {
    return res.status(400).json({ error: 'Tỉ số phải là số hợp lệ' });
  }

  match.homeScore = hScore;
  match.awayScore = aScore;
  match.status = status || 'FINISHED';

  // Calculate winner
  let winner: 'HOME' | 'DRAW' | 'AWAY' = 'DRAW';
  if (hScore > aScore) winner = 'HOME';
  else if (hScore < aScore) winner = 'AWAY';
  match.winner = winner;

  // Recalculate predictions points for this match
  // 1 point for correct, 0 for incorrect
  const predictionsList = Object.values(db.predictions).filter((p) => p.matchId === String(matchId));
  for (const pred of predictionsList) {
    const isCorrect = pred.prediction === winner;
    pred.points = isCorrect ? 1 : 0;
    pred.evaluated = true;
    db.predictions[`${pred.playerPhone}_${pred.matchId}`] = pred;
  }

  // Recalculate all player total scores
  for (const phone of Object.keys(db.players)) {
    let playerTotalPoints = 0;
    const playerPreds = Object.values(db.predictions).filter((p) => p.playerPhone === phone);
    for (const p of playerPreds) {
      if (p.evaluated && p.points > 0) {
        playerTotalPoints += p.points;
      }
    }
    db.players[phone].score = playerTotalPoints;
  }

  saveDB();
  res.json({ message: 'Cập nhật tỉ số và tính điểm người chơi thành công!', match });
});

// 5. Auth: Login/Register with 6-char code & name
app.post('/api/players/login', (req, res) => {
  const { code, name, isRegister } = req.body;
  const loginCode = (code || req.body.phoneNumber || '').trim();

  if (!loginCode || loginCode.length !== 6) {
    return res.status(400).json({ error: 'Mã đăng nhập phải gồm đúng 6 ký số / tự!' });
  }

  // Register Mode
  if (isRegister) {
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'Tên hiển thị không được trống!' });
    }
    const cleanName = name.trim();

    // Check if code taken
    if (db.players[loginCode]) {
      return res.status(400).json({ error: 'Mã số đăng ký này đã tồn tại! Vui lòng chọn mã khác.' });
    }

    // Check if name taken
    const nameExists = Object.values(db.players).some(
      (p) => p.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (nameExists) {
      return res.status(400).json({ error: 'Tên người chơi này đã tồn tại! Vui lòng chọn tên khác.' });
    }

    const newPlayer: Player = {
      phoneNumber: loginCode, // mapped to unique store field
      name: cleanName,
      score: 0,
      createdAt: getCurrentTime().toISOString(),
    };

    db.players[loginCode] = newPlayer;
    saveDB();

    return res.json({
      message: 'Tạo tài khoản & Đăng nhập thành công!',
      player: newPlayer,
    });
  }

  // Normal Login Mode
  const existingPlayer = db.players[loginCode];

  if (!existingPlayer) {
    return res.status(404).json({ error: 'Mã số đăng nhập này không hợp lệ hoặc chưa được đăng ký!' });
  }

  // Check if Name matches the passcode (only if Name is provided)
  if (name && typeof name === 'string' && name.trim() !== '') {
    const cleanName = name.trim();
    if (existingPlayer.name.toLowerCase() !== cleanName.toLowerCase()) {
      return res.status(400).json({ error: 'Mã mật số đăng nhập không khớp với Tài khoản đã chọn!' });
    }
  }

  res.json({
    message: 'Đăng nhập thành công!',
    player: existingPlayer,
  });
});

// 6. Submit or Update a Prediction
app.post('/api/predictions', (req, res) => {
  const { playerPhone, matchId, prediction } = req.body;

  if (!playerPhone || !matchId || !prediction) {
    return res.status(400).json({ error: 'Thiếu dữ liệu bình chọn' });
  }

  const normalizedPhone = playerPhone.trim();
  const player = db.players[normalizedPhone];
  if (!player) {
    return res.status(404).json({ error: 'Không tìm thấy người chơi' });
  }

  const match = db.matches.find((m) => m.id === String(matchId));
  if (!match) {
    return res.status(404).json({ error: 'Không tìm thấy trận đấu' });
  }

  // CRITICAL CONSTRAINT:
  // Khung thời gian dự đoán là 15 phút đầu, sau 15 phút nếu không bình chọn thì sẽ bị khoá.
  // Lock time = Match Time + 15 minutes
  const matchTime = new Date(match.matchTime);
  const now = getCurrentTime();
  const lockTime = new Date(matchTime.getTime() + 15 * 60 * 1000);

  if (now > lockTime) {
    return res.status(400).json({
      error: 'Bình chọn đã khoá! Đã quá 15 phút đầu kể từ khi trận đấu bắt đầu. Bạn không thể bình chọn hay thay đổi.',
    });
  }

  if (prediction !== 'HOME' && prediction !== 'DRAW' && prediction !== 'AWAY') {
    return res.status(400).json({ error: 'Lựa chọn bình chọn không hợp lệ' });
  }

  const predKey = `${normalizedPhone}_${matchId}`;
  const existingPred = db.predictions[predKey];

  if (match.status === 'FINISHED') {
    return res.status(400).json({ error: 'Trận đấu đã kết thúc, không thể bình chọn.' });
  }

  const newPrediction: Prediction = {
    playerPhone: normalizedPhone,
    matchId: String(matchId),
    prediction,
    votedAt: now.toISOString(),
    points: 0,
    evaluated: false,
  };

  db.predictions[predKey] = newPrediction;
  saveDB();

  res.json({
    message: 'Lưu dự đoán thành công!',
    prediction: newPrediction,
  });
});

// 7. Get user's predictions
app.get('/api/predictions/:phone', (req, res) => {
  const phone = req.params.phone.trim();
  const list = Object.values(db.predictions).filter((p) => p.playerPhone === phone);
  res.json({ predictions: list });
});

// 8. Leaderboard + Stats
app.get('/api/leaderboard', (req, res) => {
  const playersList = Object.values(db.players);
  const predsList = Object.values(db.predictions);

  const leaderboard = playersList.map((player) => {
    const playerPreds = predsList.filter((p) => p.playerPhone === player.phoneNumber);
    const predictedCount = playerPreds.length;
    const correctCount = playerPreds.filter((p) => p.evaluated && p.points > 0).length;

    return {
      name: player.name,
      phoneNumber: '******', // Censor secret passcode
      score: player.score,
      createdAt: player.createdAt,
      predictedCount,
      correctCount,
    };
  });

  // Sort by score desc, then name
  leaderboard.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.name.localeCompare(b.name);
  });

  // Add Rank
  const rankedLeaderboard = leaderboard.map((item, index) => ({
    ...item,
    rank: index + 1,
  }));

  res.json({ leaderboard: rankedLeaderboard });
});

// 9. Odds proxy (Simulated implementation of The Odds API)
// If THE_ODDS_API_KEY environment variable is defined, we could query the live FIFA World Cup API url
// Otherwise, we provide super realistic match odds that fluctuate on server time to look perfect
app.get('/api/odds', async (req, res) => {
  const { matchId } = req.query;
  const apiKey = process.env.THE_ODDS_API_KEY;

  if (apiKey && apiKey !== 'MY_GEMINI_API_KEY' && matchId) {
    // Optional integration with real API wrapper if we want to demonstrate it,
    // otherwise we provide our highly resilient built-in odds engine.
  }

  // Output generated odds for requested matches (or all matches)
  const matchesToProcess = matchId 
    ? db.matches.filter(m => m.id === String(matchId))
    : db.matches;

  const oddsList = matchesToProcess.map((m) => {
    // Generate realistic odds based on relative team string lengths or fixed mock
    const homeLen = m.homeTeam.length;
    const awayLen = m.awayTeam.length;
    let homeOdds = 1.8;
    let drawOdds = 3.2;
    let awayOdds = 4.2;

    if (homeLen > awayLen) {
      homeOdds = parseFloat((1.5 + (homeLen % 3) * 0.4).toFixed(2));
      awayOdds = parseFloat((2.5 + (awayLen % 5) * 0.8).toFixed(2));
    } else if (homeLen < awayLen) {
      homeOdds = parseFloat((2.5 + (homeLen % 5) * 0.8).toFixed(2));
      awayOdds = parseFloat((1.5 + (awayLen % 3) * 0.4).toFixed(2));
    } else {
      homeOdds = 2.4;
      awayOdds = 2.4;
    }

    // Add slight fluctuation based on minutes or system clock to make it dynamic
    const minuteFactor = (getCurrentTime().getMinutes() % 10) / 100;
    homeOdds = parseFloat((homeOdds + minuteFactor * (homeLen % 2 === 0 ? 1 : -1)).toFixed(2));
    awayOdds = parseFloat((awayOdds + minuteFactor * (awayLen % 2 === 0 ? -1 : 1)).toFixed(2));
    drawOdds = parseFloat((3.0 + (homeLen % 4) * 0.2 + minuteFactor).toFixed(2));

    return {
      matchId: m.id,
      homeOdds,
      drawOdds,
      awayOdds,
      lastUpdated: getCurrentTime().toISOString(),
    };
  });

  res.json({ odds: oddsList });
});

// 10. Generate mock players and predictions for active demo simulation
app.post('/api/admin/generate-demo', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Quyền admin bị từ chối! Chức năng này chỉ dành cho tài khoản Admin.' });
  }
  const names = ['Usr-Dần', 'Usr-Bin', 'Usr-Bop', 'Usr-Bảy', 'Usr-Bo', 'Usr-Bi', 'Trọng Tài', 'Khách VIP', 'Bình Luận', 'Chuyên Gia'];
  const phones = ['582914', '719462', '348105', '925183', '260341', '815729', '491730', '602854', '137496', '850143'];

  // Add players
  for (let i = 0; i < names.length; i++) {
    db.players[phones[i]] = {
      phoneNumber: phones[i],
      name: names[i],
      score: 0,
      createdAt: new Date('2026-06-08T00:00:00Z').toISOString(),
    };
  }

  // Pre-set some results for matches 1 to 10 and make them visible
  const matchResults = [
    { home: 2, away: 1 },
    { home: 1, away: 1 },
    { home: 0, away: 3 },
    { home: 1, away: 0 },
    { home: 2, away: 2 },
    { home: 4, away: 1 },
    { home: 0, away: 0 },
    { home: 3, away: 2 },
    { home: 1, away: 2 },
    { home: 2, away: 0 },
  ];

  for (let i = 0; i < matchResults.length; i++) {
    const m = db.matches[i];
    m.status = 'FINISHED';
    m.homeScore = matchResults[i].home;
    m.awayScore = matchResults[i].away;
    m.winner = m.homeScore > m.awayScore ? 'HOME' : m.homeScore < m.awayScore ? 'AWAY' : 'DRAW';
    m.visible = true; // Make active matches visible
  }

  // Add random predictions for those matches for all players
  const predictionOptions: ('HOME' | 'DRAW' | 'AWAY')[] = ['HOME', 'DRAW', 'AWAY'];
  
  for (const phone of phones) {
    // Predict matches 1 to 15
    for (let mIdx = 0; mIdx < 15; mIdx++) {
      const match = db.matches[mIdx];
      const randomPred = predictionOptions[Math.floor(Math.random() * 3)];
      const votedTime = new Date('2026-06-11T12:00:00Z');

      const predKey = `${phone}_${match.id}`;
      
      let points = 0;
      let evaluated = false;
      if (match.status === 'FINISHED') {
        evaluated = true;
        points = randomPred === match.winner ? 1 : 0;
      }

      db.predictions[predKey] = {
        playerPhone: phone,
        matchId: match.id,
        prediction: randomPred,
        votedAt: votedTime.toISOString(),
        points,
        evaluated,
      };
    }
  }

  // Calculate scores for players
  for (const phone of Object.keys(db.players)) {
    const playerPreds = Object.values(db.predictions).filter((p) => p.playerPhone === phone);
    let totalPoints = 0;
    for (const p of playerPreds) {
      if (p.evaluated) {
        totalPoints += p.points;
      }
    }
    db.players[phone].score = totalPoints;
  }

  saveDB();
  res.json({ message: 'Đã tạo 10 tài khoản mẫu và các dự đoán thử nghiệm để biểu diễn biểu đồ!', players: db.players });
});

// 11. Reset whole database to clean slate
app.post('/api/admin/reset-db', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Quyền admin bị từ chối! Chức năng này chỉ dành cho tài khoản Admin.' });
  }
  db = {
    players: {},
    predictions: {},
    matches: generate104Matches().map(m => ({ ...m, visible: Number(m.id) <= 8 })),
    simulatedTime: null,
  };
  seedDefaultPlayers();
  saveDB();
  res.json({ message: 'Đặt lại toàn bộ dữ liệu thành công', matchesCount: db.matches.length });
});

// 12. Get full registered player list with pass code details (Admin only)
app.get('/api/admin/players', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Quyền admin bị từ chối! Chức năng này chỉ dành cho tài khoản Admin.' });
  }
  const players = Object.values(db.players).map(p => ({
    name: p.name,
    code: p.phoneNumber, // original secret code is stored as phoneNumber mapped field
    score: p.score,
    createdAt: p.createdAt,
  }));
  res.json({ players });
});

// 13. Toggle match visibility dynamically (Admin only)
app.post('/api/admin/matches/toggle-visibility', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Quyền admin bị từ chối! Chức năng này chỉ dành cho tài khoản Admin.' });
  }
  const { matchId, visible } = req.body;
  const match = db.matches.find(m => m.id === String(matchId));
  if (!match) {
    return res.status(404).json({ error: 'Không tìm thấy trận đấu' });
  }
  match.visible = !!visible;
  saveDB();
  res.json({ message: `Đã ${visible ? 'HIỂN THỊ' : 'ẨN'} trận đấu ${matchId} thành công!`, match });
});

// 14. Bulk visibility action (Admin only toggle)
app.post('/api/admin/matches/bulk-visibility', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Quyền admin bị từ chối! Chức năng này chỉ dành cho tài khoản Admin.' });
  }
  const { visible } = req.body;
  for (const m of db.matches) {
    m.visible = !!visible;
  }
  saveDB();
  res.json({ message: `Đã cập nhật hiển thị (${visible ? 'HIỆN' : 'ẨN'}) toàn bộ 104 trận đấu thành công!` });
});


// Serve Vite or static builds
const isProd = process.env.NODE_ENV === 'production';
if (!isProd) {
  createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  }).then((vite) => {
    app.use(vite.middlewares);
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Development Server running on http://localhost:${PORT}`);
    });
  });
} else {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*all', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Production Server running on http://localhost:${PORT}`);
  });
}
