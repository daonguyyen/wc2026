/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { Firestore } from "@google-cloud/firestore";
import { generate104Matches } from "./src/data/worldcupMatches.js";
import { Match, Player, Prediction } from "./src/types.js";

dotenv.config();

// Initialize Firestore client with custom database ID from config
let firestore: any = null;
try {
  const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(firebaseConfigPath)) {
    const config = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));

    // Check if we have credentials to load Firestore safely
    const hasServiceAccountEnv = !!process.env.FIREBASE_SERVICE_ACCOUNT;
    const hasGoogleCredsEnv = !!process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    const isCloudEnvironment = !!process.env.K_SERVICE; // Cloud Run or App Engine environment

    if (hasServiceAccountEnv || hasGoogleCredsEnv || isCloudEnvironment) {
      const firestoreOptions: any = {
        projectId: config.projectId,
      };

      if (config.firestoreDatabaseId) {
        firestoreOptions.databaseId = config.firestoreDatabaseId;
      }

      // Handle raw JSON string credentials from environment variable for platforms like Render.com
      if (hasServiceAccountEnv) {
        try {
          firestoreOptions.credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);
          console.log("[Firestore] Configured credentials from FIREBASE_SERVICE_ACCOUNT environment variable.");
        } catch (parseErr: any) {
          console.error("[Firestore] Failed to parse FIREBASE_SERVICE_ACCOUNT environment variable:", parseErr.message);
        }
      }

      firestore = new Firestore(firestoreOptions);
      console.log(`[Firestore] Initialized Firestore client. Project ID: ${config.projectId}. Database: ${config.firestoreDatabaseId || "(default)"}`);
    } else {
      console.log("[Firestore] Running in offline Local File mode (No valid credentials or K_SERVICE detected).");
    }
  } else {
    console.log("[Firestore] Running in offline Local File mode (firebase-applet-config.json not found).");
  }
} catch (err) {
  console.error("[Firestore] Failed to initialize Google Cloud Firestore client:", err);
}

// Helper to convert Date to GMT+7 ISO string format for persistent JSON storage
function toGMT7String(date: Date): string {
  const tzOffset = 7 * 60 * 60 * 1000; // 7 hours in milliseconds
  const localTime = date.getTime() + tzOffset;
  const localDate = new Date(localTime);
  return localDate.toISOString().replace("Z", "+07:00");
}

const app = express();
// Support dynamic port allocation on hosting platforms like Render (using process.env.PORT).
// In Google AI Studio, we bind strictly to port 3000 using process.env.K_SERVICE indicator.
const PORT = process.env.PORT && !process.env.K_SERVICE ? parseInt(process.env.PORT, 10) : 3000;
const DB_PATH = path.join(process.cwd(), "data", "db.json");

// Ensure database folder exists
if (!fs.existsSync(path.join(process.cwd(), "data"))) {
  fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
}

const BACKUPS_DIR = path.join(process.cwd(), "data", "backups");
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// Global In-Memory DB state (flushed to disk on modifications)
interface Database {
  players: Record<string, Player>;
  predictions: Record<string, Prediction>;
  matches: Match[];
  simulatedTime: string | null; // Simulated server ISO time
  outrightPredictions?: Record<
    string,
    {
      playerPhone: string;
      champion: string;
      goldenBoot: string;
      goldenGlove: string;
      goldenBall: string;
      updatedAt: string;
    }
  >;
  outrightResults?: {
    champion: string;
    goldenBoot: string;
    goldenGlove: string;
    goldenBall: string;
  };
  outrightEvaluations?: Record<
    string,
    {
      championCorrect?: boolean;
      goldenBootCorrect?: boolean;
      goldenGloveCorrect?: boolean;
      goldenBallCorrect?: boolean;
    }
  >;
  adminCustomizedVisibility?: Record<string, boolean>;
}

let db: Database = {
  players: {},
  predictions: {},
  matches: [],
  simulatedTime: null,
  outrightPredictions: {},
  outrightResults: { champion: "", goldenBoot: "", goldenGlove: "", goldenBall: "" },
  outrightEvaluations: {},
  adminCustomizedVisibility: {},
};

// Helper check for admin privileges based on Usr-Bop's pass code
function isAdmin(req: express.Request): boolean {
  const code = req.headers["x-admin-code"] || req.query.adminCode || req.body.adminCode;
  if (!code) return false;
  const player = db.players[String(code).trim()];
  return player && player.name === "Usr-Bop";
}

const TEAM_RATINGS: Record<string, number> = {
  Brazil: 10,
  Pháp: 10,
  Anh: 10,
  Argentina: 10,
  "Bồ Đào Nha": 10,
  "Tây Ban Nha": 10,
  Đức: 10,
  Bỉ: 10,
  "Hà Lan": 10,
  Croatia: 8,
  "Thụy Sĩ": 8,
  "Ma-rốc": 8,
  Uruguay: 8,
  "Hàn Quốc": 8,
  "Nhật Bản": 8,
  Mỹ: 8,
  "Na Uy": 8,
  Colombia: 8,
  Ecuador: 8,
  "Thổ Nhĩ Kỳ": 8,
  Mexico: 6,
  Úc: 6,
  Scotland: 6,
  "CH Séc": 6,
  Áo: 6,
  Ghana: 6,
  Senegal: 6,
  "Thụy Điển": 6,
  "Bờ Biển Ngà": 6,
  Tunisia: 6,
  Iran: 6,
  Algeria: 6,
  Uzbekistan: 6,
  Qatar: 4,
  "Nam Phi": 4,
  "Bosnia & Herzegovina": 4,
  Paraguay: 4,
  Haiti: 2,
  "New Zealand": 4,
  "Cape Verde": 4,
  "Ả Rập Xê-út": 4,
  Iraq: 4,
  Jordan: 4,
  Curaçao: 4,
  "CHDC Congo": 4,
  Panama: 4,
};

function getMatchHandicap(matchOrHomeTeam: any, awayTeamStr?: string): { favored: "HOME" | "AWAY" | "NONE"; value: number } {
  if (!matchOrHomeTeam) {
    return { favored: "NONE", value: 0 };
  }

  // If passing string arguments
  if (typeof matchOrHomeTeam === "string") {
    const homeTeam = matchOrHomeTeam;
    const awayTeam = awayTeamStr || "";
    if (homeTeam === "Chưa xác định" || awayTeam === "Chưa xác định" || !homeTeam || !awayTeam) {
      return { favored: "NONE", value: 0 };
    }
    const homeRating = TEAM_RATINGS[homeTeam] !== undefined ? TEAM_RATINGS[homeTeam] : 6;
    const awayRating = TEAM_RATINGS[awayTeam] !== undefined ? TEAM_RATINGS[awayTeam] : 6;

    const diff = homeRating - awayRating;
    if (diff === 0) {
      return { favored: "NONE", value: 0 };
    }

    const favored = diff > 0 ? "HOME" : "AWAY";
    const absDiff = Math.abs(diff);

    let value = 0;
    if (absDiff === 1 || absDiff === 2) {
      value = 0.5;
    } else if (absDiff === 3 || absDiff === 4) {
      value = 1.0;
    } else if (absDiff === 5 || absDiff === 6) {
      value = 1.5;
    } else if (absDiff >= 7) {
      value = 2.0;
    }

    return { favored, value };
  }

  // If passing a Match object
  const m = matchOrHomeTeam;
  if (m.handicapFavored && m.handicapFavored !== undefined) {
    return {
      favored: m.handicapFavored as "HOME" | "AWAY" | "NONE",
      value: m.handicapValue !== undefined ? m.handicapValue : 0,
    };
  }

  const homeTeam = m.homeTeam || "";
  const awayTeam = m.awayTeam || "";
  if (homeTeam === "Chưa xác định" || awayTeam === "Chưa xác định" || !homeTeam || !awayTeam) {
    return { favored: "NONE", value: 0 };
  }
  const homeRating = TEAM_RATINGS[homeTeam] !== undefined ? TEAM_RATINGS[homeTeam] : 6;
  const awayRating = TEAM_RATINGS[awayTeam] !== undefined ? TEAM_RATINGS[awayTeam] : 6;

  const diff = homeRating - awayRating;
  if (diff === 0) {
    return { favored: "NONE", value: 0 };
  }

  const favored = diff > 0 ? "HOME" : "AWAY";
  const absDiff = Math.abs(diff);

  let value = 0;
  if (absDiff === 1 || absDiff === 2) {
    value = 0.5;
  } else if (absDiff === 3 || absDiff === 4) {
    value = 1.0;
  } else if (absDiff === 5 || absDiff === 6) {
    value = 1.5;
  } else if (absDiff >= 7) {
    value = 2.0;
  }

  return { favored, value };
}

function getHandicapWinner(matchOrHomeTeam: any, homeScore: number, awayScore: number, homeTeamStr?: string, awayTeamStr?: string): "HOME" | "DRAW" | "AWAY" {
  const { favored, value } = getMatchHandicap(matchOrHomeTeam, typeof matchOrHomeTeam === "string" ? homeTeamStr : undefined);
  if (favored === "NONE" || value === 0) {
    if (homeScore > awayScore) return "HOME";
    if (homeScore < awayScore) return "AWAY";
    return "DRAW";
  }

  if (favored === "HOME") {
    const adjustedHomeScore = homeScore - value;
    if (adjustedHomeScore > awayScore) return "HOME";
    if (adjustedHomeScore < awayScore) return "AWAY";
    return "DRAW";
  } else {
    const adjustedAwayScore = awayScore - value;
    if (homeScore > adjustedAwayScore) return "HOME";
    if (homeScore < adjustedAwayScore) return "AWAY";
    return "DRAW";
  }
}

// Seed default users with patternless random-looking passcodes
function seedDefaultPlayers() {
  const defaultPlayers = [
    { name: "Usr-Dần", code: "582914" },
    { name: "Usr-Bin", code: "719462" },
    { name: "Usr-Bop", code: "348105" }, // Admin
    { name: "Usr-Bảy", code: "925183" },
    { name: "Usr-Bo", code: "260341" },
    { name: "Usr-Bi", code: "815729" },
    { name: "Usr-Sáu", code: "492815" },
    { name: "Usr-Ninh", code: "318529" },
    { name: "Usr-Hòa", code: "674913" },
  ];

  // Clean up any historical old sequential codes if present
  const legacyCodes = ["666001", "666002", "666003", "666004", "666005", "666006", "666007", "666008", "666009", "666010"];
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
        createdAt: toGMT7String(new Date("2026-06-08T00:00:00Z")),
      };
    }
  }
}

function createAutomaticBackup(type: string = "auto") {
  try {
    const timestamp = toGMT7String(new Date()).replace(/[:.]/g, "-");
    const filename = `${type}_backup_${timestamp}.json`;
    const backupFilePath = path.join(BACKUPS_DIR, filename);

    const backupData = {
      players: db.players,
      predictions: db.predictions,
      outrightPredictions: db.outrightPredictions || {},
      outrightResults: db.outrightResults || { champion: "", goldenBoot: "", goldenGlove: "", goldenBall: "" },
      outrightEvaluations: db.outrightEvaluations || {},
      adminCustomizedVisibility: db.adminCustomizedVisibility || {},
      timestamp: toGMT7String(new Date()),
    };

    fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), "utf-8");
    console.log(`[Backup] Automatic snapshot saved: ${filename}`);
  } catch (error) {
    console.error("[Backup] Failed to create automatic snapshot:", error);
  }
}

// Seed / Load database
async function loadDB() {
  try {
    let loadedFromFirestore = false;

    if (firestore) {
      try {
        console.log("[Firestore] Loading database from Firestore app_state collections...");
        const colRef = firestore.collection("app_state");

        const docPlayers = await colRef.doc("players").get();
        const docPredictions = await colRef.doc("predictions").get();
        const docMatches = await colRef.doc("matches").get();
        const docOutrights = await colRef.doc("outrights").get();
        const docSettings = await colRef.doc("settings").get();

        if (docPlayers.exists || docPredictions.exists || docMatches.exists) {
          db.players = docPlayers.exists ? docPlayers.data()?.data || {} : {};
          db.predictions = docPredictions.exists ? docPredictions.data()?.data || {} : {};
          db.matches = docMatches.exists ? docMatches.data()?.data || [] : [];

          const outrightsData = docOutrights.exists ? docOutrights.data() : null;
          db.outrightPredictions = outrightsData?.outrightPredictions || {};
          db.outrightResults = outrightsData?.outrightResults || { champion: "", goldenBoot: "", goldenGlove: "", goldenBall: "" };
          db.outrightEvaluations = outrightsData?.outrightEvaluations || {};

          const settingsData = docSettings.exists ? docSettings.data() : null;
          db.adminCustomizedVisibility = settingsData?.adminCustomizedVisibility || {};
          db.simulatedTime = settingsData?.simulatedTime || null;

          loadedFromFirestore = true;
          console.log("[Firestore] Successfully loaded database state from Google Cloud Firestore!");
        } else {
          console.log("[Firestore] Database app_state collection is empty. Will seed and initialize.");
        }
      } catch (firestoreErr: any) {
        console.warn("\n[Firestore Warning] Không thể kết nối hoặc tải dữ liệu từ Google Cloud Firestore:", firestoreErr.message || firestoreErr);
        console.warn("[Firestore Warning] Hệ thống sẽ chuyển sang chế độ lưu trữ Local File (data/db.json) làm dự phòng.");
        firestore = null; // Disable Firestore to use local fallback
      }
    }

    if (!loadedFromFirestore) {
      console.log("[Firestore] Falling back to local file-based storage path:", DB_PATH);
      if (fs.existsSync(DB_PATH)) {
        const data = fs.readFileSync(DB_PATH, "utf-8");
        db = JSON.parse(data);
      }
    }

    if (!db.adminCustomizedVisibility) {
      db.adminCustomizedVisibility = {};
    }
    const adminCustoms = db.adminCustomizedVisibility;

    // Fallback matching
    if (!db.matches || db.matches.length === 0) {
      db.matches = generate104Matches().map((m) => {
        const isFinished = m.status === "FINISHED";
        const customized = adminCustoms[m.id];
        return { ...m, visible: customized !== undefined ? customized : isFinished };
      });
    } else {
      // Migration: Detect old matches data (awayTeam is not Nam Phi for match 1)
      const firstMatch = db.matches.find((m) => m.id === "1");
      if (firstMatch && firstMatch.awayTeam !== "Nam Phi") {
        console.log("Phát hiện dữ liệu trận đấu cũ, tự động di cư sang World Cup 2026 chuẩn...");
        db.matches = generate104Matches().map((m) => {
          const isFinished = m.status === "FINISHED";
          const customized = adminCustoms[m.id];
          return { ...m, visible: customized !== undefined ? customized : isFinished };
        });
        db.predictions = {}; // Clean old predictions since teams have changed
      } else {
        // Reconcile/align database match times, team names & stages with generate104Matches() to apply accurate translations and scheduling
        const sourceMatches = generate104Matches();
        db.matches = (db.matches || []).filter((m) => m && typeof m === "object" && m.id);

        db.matches = db.matches.map((m) => {
          const src = sourceMatches.find((s) => s.id === m.id);
          if (!src) return m;
          const isFinished = m.status === "FINISHED" || src.status === "FINISHED";
          const customized = adminCustoms[m.id];

          // Check if match is customized or if it's a playoff match that has been edited (not equal to TBD)
          // Compare with src to see if admin has edited homeTeam, awayTeam, stage, matchTime, or handicaps
          const hasDifferentHomeTeam = m.homeTeam !== undefined && m.homeTeam !== src.homeTeam;
          const hasDifferentAwayTeam = m.awayTeam !== undefined && m.awayTeam !== src.awayTeam;
          const hasDifferentTime = m.matchTime !== undefined && m.matchTime !== src.matchTime;
          const hasDifferentStage = m.stage !== undefined && m.stage !== src.stage;
          const hasDifferentHandicapVal = m.handicapValue !== undefined && m.handicapValue !== src.handicapValue;
          const hasDifferentHandicapFav = m.handicapFavored !== undefined && m.handicapFavored !== src.handicapFavored;

          const isPlayoff = m.stage && typeof m.stage === "string" && !m.stage.startsWith("Vòng bảng");
          const isEditedPlayoff = isPlayoff && (m.homeTeam !== "Chưa xác định" || m.awayTeam !== "Chưa xác định");
          const shouldPreserve =
            m.isCustomized || hasDifferentHomeTeam || hasDifferentAwayTeam || hasDifferentTime || hasDifferentStage || hasDifferentHandicapVal || hasDifferentHandicapFav || isEditedPlayoff;

          if (shouldPreserve) {
            return {
              ...src,
              ...m,
              isCustomized: true,
              visible: customized !== undefined ? customized : m.visible !== undefined ? m.visible : isFinished,
            };
          }

          return {
            ...src,
            ...m,
            homeTeam: src.homeTeam,
            awayTeam: src.awayTeam,
            matchTime: src.matchTime,
            stage: src.stage,
            visible: customized !== undefined ? customized : isFinished,
          };
        });
      }
    }

    if (!db.outrightPredictions) db.outrightPredictions = {};
    if (!db.outrightResults) db.outrightResults = { champion: "", goldenBoot: "", goldenGlove: "", goldenBall: "" };
    if (!db.outrightEvaluations) db.outrightEvaluations = {};

    seedDefaultPlayers();
    recalculateAllScores();
    await saveDB();

    // Perform automated pre-startup backup
    createAutomaticBackup("startup");
  } catch (error) {
    console.error("Lỗi khi tải cơ sở dữ liệu, khởi tạo lại:", error);
    db = {
      players: {},
      predictions: {},
      matches: generate104Matches().map((m) => ({ ...m, visible: m.status === "FINISHED" })),
      simulatedTime: null,
      outrightPredictions: {},
      outrightResults: { champion: "", goldenBoot: "", goldenGlove: "", goldenBall: "" },
      outrightEvaluations: {},
      adminCustomizedVisibility: {},
    };
    seedDefaultPlayers();
    recalculateAllScores();
    // CRITICAL: DO NOT call saveDB() here, to prevent overwriting/erasing the existing Firestore data on load error!
  }
}

async function saveDB() {
  try {
    if (firestore) {
      const colRef = firestore.collection("app_state");
      await Promise.all([
        colRef.doc("players").set({ data: db.players }, { merge: false }),
        colRef.doc("predictions").set({ data: db.predictions }, { merge: false }),
        colRef.doc("matches").set({ data: db.matches }, { merge: false }),
        colRef.doc("outrights").set(
          {
            outrightPredictions: db.outrightPredictions || {},
            outrightResults: db.outrightResults || { champion: "", goldenBoot: "", goldenGlove: "", goldenBall: "" },
            outrightEvaluations: db.outrightEvaluations || {},
          },
          { merge: false },
        ),
        colRef.doc("settings").set(
          {
            adminCustomizedVisibility: db.adminCustomizedVisibility || {},
            simulatedTime: db.simulatedTime,
          },
          { merge: false },
        ),
      ]);
    }
  } catch (error) {
    console.error("Lỗi khi lưu Firestore:", error);
  }

  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
  } catch (error) {
    console.error("Lỗi khi lưu cơ sở dữ liệu tệp tin:", error);
  }
}

function recalculateAllScores() {
  if (!db.outrightPredictions) db.outrightPredictions = {};
  if (!db.outrightResults) db.outrightResults = { champion: "", goldenBoot: "", goldenGlove: "", goldenBall: "" };
  if (!db.outrightEvaluations) db.outrightEvaluations = {};

  // For each prediction that was finished, update points: correct => 0, incorrect => 1
  for (const pred of Object.values(db.predictions)) {
    const match = db.matches.find((m) => m.id === pred.matchId);
    if (match && match.status === "FINISHED") {
      const isCorrect = pred.prediction === match.winner;
      pred.points = isCorrect ? 0 : 1;
      pred.evaluated = true;
    }
  }

  // Calculate scores for players based on incorrect predictions + forgotten locked predictions + outright deductions
  const now = getCurrentTime();
  for (const phone of Object.keys(db.players)) {
    let incorrectCount = 0;
    let deductions = 0;

    for (const match of db.matches) {
      const matchTime = new Date(match.matchTime);
      const isExhibition = match.isExhibition || (match.stage && typeof match.stage === "string" && match.stage.startsWith("Trận ngoài lề")) || match.id.startsWith("ex_");
      const limitMinutes = match.stage && typeof match.stage === "string" && match.stage.startsWith("Vòng bảng") ? 15 : 7;
      const lockTime = new Date(matchTime.getTime() + limitMinutes * 60 * 1000);
      const isLocked = now > lockTime || match.status === "FINISHED";

      if (isLocked) {
        const predKey = `${phone}_${match.id}`;
        const pred = db.predictions[predKey];
        if (pred) {
          if (match.status === "FINISHED") {
            if (pred.points > 0) {
              incorrectCount++;
            }
          }
        } else {
          incorrectCount++;
        }
      }
    }

    const outright = db.outrightPredictions[phone];
    const evalResult = db.outrightEvaluations[phone];
    const results = db.outrightResults;

    if (outright && results) {
      // 1. Champion (-10 points)
      const isChampCorrect = evalResult?.championCorrect ?? (!!results.champion && !!outright.champion && outright.champion.toLowerCase().trim() === results.champion.toLowerCase().trim());
      if (isChampCorrect) deductions += 10;

      // 2. Golden Boot (-5 points)
      const isGoldenBootCorrect =
        evalResult?.goldenBootCorrect ?? (!!results.goldenBoot && !!outright.goldenBoot && outright.goldenBoot.toLowerCase().trim() === results.goldenBoot.toLowerCase().trim());
      if (isGoldenBootCorrect) deductions += 5;

      // 3. Golden Glove (-5 points)
      const isGoldenGloveCorrect =
        evalResult?.goldenGloveCorrect ?? (!!results.goldenGlove && !!outright.goldenGlove && outright.goldenGlove.toLowerCase().trim() === results.goldenGlove.toLowerCase().trim());
      if (isGoldenGloveCorrect) deductions += 5;

      // 4. Golden Ball (-5 points)
      const isGoldenBallCorrect =
        evalResult?.goldenBallCorrect ?? (!!results.goldenBall && !!outright.goldenBall && outright.goldenBall.toLowerCase().trim() === results.goldenBall.toLowerCase().trim());
      if (isGoldenBallCorrect) deductions += 5;
    }

    // New total score: lower is better!
    db.players[phone].score = incorrectCount - deductions;
  }

  saveDB();
}

// Middlewares
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

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
app.get("/api/server-info", (req, res) => {
  res.json({
    currentTime: toGMT7String(getCurrentTime()),
    isSimulating: db.simulatedTime !== null,
    simulatedTime: db.simulatedTime,
  });
});

// 2. Set simulated server time (Admin / User Test)
app.post("/api/admin/time", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Quyền admin bị từ chối! Chức năng này chỉ dành cho tài khoản Admin." });
  }
  const { simulatedTime } = req.body; // Can be ISO string or null to reset
  if (simulatedTime === null) {
    db.simulatedTime = null;
  } else {
    const d = new Date(simulatedTime);
    if (isNaN(d.getTime())) {
      return res.status(400).json({ error: "Định dạng thời gian không hợp lệ" });
    }
    db.simulatedTime = toGMT7String(d);
  }
  saveDB();
  res.json({
    message: "Cập nhật thời gian mô phỏng thành công",
    currentTime: toGMT7String(getCurrentTime()),
    isSimulating: db.simulatedTime !== null,
  });
});

// 3. Get matches list (filters by visible flag for regular players unless they provide admin auth)
app.get("/api/matches", (req, res) => {
  if (isAdmin(req)) {
    return res.json({ matches: db.matches });
  }
  const visibleMatches = db.matches.filter((m) => m.visible);
  res.json({ matches: visibleMatches });
});

// Added: Get all unique 48 teams from the entire match schedule (ignores visibility for predicting)
app.get("/api/teams", (req, res) => {
  const allNames = db.matches.flatMap((m: any) => [m.homeTeam, m.awayTeam]);
  const filtered = allNames.filter((name: string) => {
    if (!name) return false;
    const placeholderKeyWords = ["Nhất Bảng", "Nhì Bảng", "ThắngTrận", "ThuaTrận", "Chưa xác định", "Thắng Trận", "Thua Trận", "Tử kết", "Bán kết", "Chung kết", "Thua", "Thắng"];
    return !placeholderKeyWords.some((kw) => name.includes(kw));
  });
  const uniqueTeams = Array.from(new Set(filtered)).sort();
  res.json({ teams: uniqueTeams });
});

// 4. Update match scores (Admin Simulation Panel)
app.post("/api/matches/update-score", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Quyền admin bị từ chối! Hoạt động ghi điểm chỉ dành cho tài khoản Admin." });
  }
  const { matchId, homeScore, awayScore, status } = req.body;

  const match = db.matches.find((m) => m.id === String(matchId));
  if (!match) {
    return res.status(404).json({ error: "Không tìm thấy trận đấu" });
  }

  const hScore = Number(homeScore);
  const aScore = Number(awayScore);

  if (isNaN(hScore) || isNaN(aScore)) {
    return res.status(400).json({ error: "Tỉ số phải là số hợp lệ" });
  }

  match.homeScore = hScore;
  match.awayScore = aScore;
  match.status = status || "FINISHED";
  match.visible = true; // Auto-set visible for updated matches!
  if (!db.adminCustomizedVisibility) {
    db.adminCustomizedVisibility = {};
  }
  db.adminCustomizedVisibility[match.id] = true;

  // Calculate winner based on handicap rules
  const handicapWinner = getHandicapWinner(match, hScore, aScore);
  match.winner = handicapWinner;

  recalculateAllScores();
  saveDB();
  res.json({ message: "Cập nhật tỉ số và tính điểm người chơi thành công!", match });
});

const ENGLISH_TO_VIETNAMESE_TEAMS: Record<string, string> = {
  Mexico: "Mexico",
  "South Africa": "Nam Phi",
  "South Korea": "Hàn Quốc",
  "Czech Republic": "CH Séc",
  Canada: "Canada",
  "Bosnia and Herzegovina": "Bosnia & Herzegovina",
  Bosnia: "Bosnia & Herzegovina",
  USA: "Mỹ",
  "United States": "Mỹ",
  Paraguay: "Paraguay",
  Haiti: "Haiti",
  Scotland: "Scotland",
  France: "Pháp",
  Germany: "Đức",
  Spain: "Tây Ban Nha",
  England: "Anh",
  Italy: "Ý",
  Portugal: "Bồ Đào Nha",
  Argentina: "Argentina",
  Brazil: "Brazil",
  Uruguay: "Uruguay",
  Colombia: "Colombia",
  Netherlands: "Hà Lan",
  Belgium: "Bỉ",
  Croatia: "Croatia",
  Switzerland: "Thụy Sĩ",
  Morocco: "Ma-rốc",
  Japan: "Nhật Bản",
  Norway: "Na Uy",
  Ecuador: "Ecuador",
  Turkey: "Thổ Nhĩ Kỳ",
  Czechia: "CH Séc",
  Austria: "Áo",
  Ghana: "Ghana",
  Senegal: "Senegal",
  Sweden: "Thụy Điển",
  "Ivory Coast": "Bờ Biển Ngà",
  Tunisia: "Tunisia",
  Iran: "Iran",
  Algeria: "Algeria",
  Uzbekistan: "Uzbekistan",
  Qatar: "Qatar",
  Honduras: "Honduras",
  Panama: "Panama",
  Australia: "Úc",
  "Saudi Arabia": "Ả Rập Xê-út",
  Iraq: "Iraq",
  Jordan: "Jordan",
  "New Zealand": "New Zealand",
  "Cape Verde": "Cape Verde",
  Curaçao: "Curaçao",
  "DR Congo": "CHDC Congo",
};

function translateTeamName(name: string): string {
  if (!name) return "Chưa xác định";
  const cleanName = name.trim();
  if (ENGLISH_TO_VIETNAMESE_TEAMS[cleanName]) {
    return ENGLISH_TO_VIETNAMESE_TEAMS[cleanName];
  }
  // Try case-insensitive lookup
  for (const [en, vi] of Object.entries(ENGLISH_TO_VIETNAMESE_TEAMS)) {
    if (en.toLowerCase() === cleanName.toLowerCase()) {
      return vi;
    }
  }
  return cleanName;
}

// Endpoint to synchronize match results from worldcup26.ir API (can be automated or manually triggered)
app.post("/api/matches/sync", async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Quyền admin bị từ chối! Hoạt động đồng bộ chỉ dành cho tài khoản Admin." });
  }

  try {
    const response = await fetch("https://worldcup26.ir/get/games");
    if (!response.ok) {
      return res.status(response.status).json({ error: "Lỗi khi gọi API worldcup26.ir để đồng bộ" });
    }
    const data = (await response.json()) as any;
    if (!data.games || !Array.isArray(data.games)) {
      return res.status(400).json({ error: "Dữ liệu API không đúng định dạng" });
    }

    let updatedCount = 0;
    let finishedNewCount = 0;

    for (const g of data.games) {
      const match = db.matches.find((m) => m.id === g.id);
      if (match) {
        let changed = false;

        // Sync teams first (especially useful for knockout matchups as they are decided)
        const apiHome = g.home_team || g.homeTeam || g.home_team_name;
        const apiAway = g.away_team || g.awayTeam || g.away_team_name;

        if (apiHome && typeof apiHome === "string") {
          const homeClean = translateTeamName(apiHome);
          if (homeClean && homeClean !== "Chưa xác định" && match.homeTeam !== homeClean) {
            match.homeTeam = homeClean;
            changed = true;
          }
        }
        if (apiAway && typeof apiAway === "string") {
          const awayClean = translateTeamName(apiAway);
          if (awayClean && awayClean !== "Chưa xác định" && match.awayTeam !== awayClean) {
            match.awayTeam = awayClean;
            changed = true;
          }
        }

        // Check scores
        const homeScore = g.home_score !== "null" && g.home_score !== null ? parseInt(g.home_score, 10) : undefined;
        const awayScore = g.away_score !== "null" && g.away_score !== null ? parseInt(g.away_score, 10) : undefined;

        let status: "SCHEDULED" | "LIVE" | "FINISHED" = "SCHEDULED";
        if (g.finished === "TRUE") {
          status = "FINISHED";
        } else if (g.time_elapsed !== "notstarted" && g.time_elapsed !== "null" && g.time_elapsed !== null) {
          status = "LIVE";
        }

        // Check if anything is updated
        if (match.status !== status || match.homeScore !== homeScore || match.awayScore !== awayScore) {
          match.status = status;
          match.homeScore = homeScore;
          match.awayScore = awayScore;

          if (status === "FINISHED" && homeScore !== undefined && awayScore !== undefined) {
            const handicapWinner = getHandicapWinner(match, homeScore, awayScore);
            match.winner = handicapWinner;
            match.visible = true; // Auto-set visible for synchronized finished matches!
            if (!db.adminCustomizedVisibility) {
              db.adminCustomizedVisibility = {};
            }
            db.adminCustomizedVisibility[match.id] = true;
            finishedNewCount++;
          }

          changed = true;
        }

        if (changed) {
          updatedCount++;
        }
      }
    }

    if (updatedCount > 0) {
      recalculateAllScores();
      saveDB();
    }

    res.json({
      message: `Đồng bộ hoàn tất! Cập nhật/Đồng bộ ${updatedCount} trận đấu mới, trong đó có ${finishedNewCount} trận vừa hoàn thành.`,
      updatedCount,
      finishedNewCount,
    });
  } catch (err: any) {
    console.error("API Sync Error:", err);
    res.status(500).json({ error: `Lỗi bất ngờ xảy ra khi đồng bộ: ${err.message}` });
  }
});

// 5. Auth: Login/Register with 6-char code & name
app.post("/api/players/login", (req, res) => {
  const { code, name, isRegister } = req.body;
  const loginCode = (code || req.body.phoneNumber || "").trim();

  if (!loginCode || loginCode.length !== 6) {
    return res.status(400).json({ error: "Mã đăng nhập phải gồm đúng 6 ký số / tự!" });
  }

  // Register Mode
  if (isRegister) {
    if (!name || typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({ error: "Tên hiển thị không được trống!" });
    }
    const cleanName = name.trim();

    // Check if code taken
    if (db.players[loginCode]) {
      return res.status(400).json({ error: "Mã số đăng ký này đã tồn tại! Vui lòng chọn mã khác." });
    }

    // Check if name taken
    const nameExists = Object.values(db.players).some((p) => p.name.toLowerCase() === cleanName.toLowerCase());
    if (nameExists) {
      return res.status(400).json({ error: "Tên người chơi này đã tồn tại! Vui lòng chọn tên khác." });
    }

    const newPlayer: Player = {
      phoneNumber: loginCode, // mapped to unique store field
      name: cleanName,
      score: 0,
      createdAt: toGMT7String(getCurrentTime()),
    };

    db.players[loginCode] = newPlayer;
    saveDB();

    return res.json({
      message: "Tạo tài khoản & Đăng nhập thành công!",
      player: newPlayer,
    });
  }

  // Normal Login Mode
  const existingPlayer = db.players[loginCode];

  if (!existingPlayer) {
    return res.status(404).json({ error: "Mã số đăng nhập này không hợp lệ hoặc chưa được đăng ký!" });
  }

  // Check if Name matches the passcode (only if Name is provided)
  if (name && typeof name === "string" && name.trim() !== "") {
    const cleanName = name.trim();
    if (existingPlayer.name.toLowerCase() !== cleanName.toLowerCase()) {
      return res.status(400).json({ error: "Mã mật số đăng nhập không khớp với Tài khoản đã chọn!" });
    }
  }

  res.json({
    message: "Đăng nhập thành công!",
    player: existingPlayer,
  });
});

// 6. Submit or Update a Prediction
app.post("/api/predictions", (req, res) => {
  const { playerPhone, matchId, prediction } = req.body;

  if (!playerPhone || !matchId || !prediction) {
    return res.status(400).json({ error: "Thiếu dữ liệu bình chọn" });
  }

  const normalizedPhone = playerPhone.trim();
  const player = db.players[normalizedPhone];
  if (!player) {
    return res.status(404).json({ error: "Không tìm thấy người chơi" });
  }

  const match = db.matches.find((m) => m.id === String(matchId));
  if (!match) {
    return res.status(404).json({ error: "Không tìm thấy trận đấu" });
  }

  // CRITICAL CONSTRAINT:
  // Khung thời gian dự đoán là 15 phút đầu (Vòng bảng) hoặc 7 phút (Vòng 32 trở đi), sau đó sẽ bị khoá.
  const matchTime = new Date(match.matchTime);
  const now = getCurrentTime();
  const limitMinutes = match.stage && typeof match.stage === "string" && match.stage.startsWith("Vòng bảng") ? 15 : 7;
  const lockTime = new Date(matchTime.getTime() + limitMinutes * 60 * 1000);

  if (now > lockTime) {
    return res.status(400).json({
      error: `Bình chọn đã khoá! Đã quá ${limitMinutes} phút đầu kể từ khi trận đấu bắt đầu. Bạn không thể bình chọn hay thay đổi.`,
    });
  }

  if (prediction !== "HOME" && prediction !== "DRAW" && prediction !== "AWAY") {
    return res.status(400).json({ error: "Lựa chọn bình chọn không hợp lệ" });
  }

  const predKey = `${normalizedPhone}_${matchId}`;
  const existingPred = db.predictions[predKey];

  if (match.status === "FINISHED") {
    return res.status(400).json({ error: "Trận đấu đã kết thúc, không thể bình chọn." });
  }

  const newPrediction: Prediction = {
    playerPhone: normalizedPhone,
    matchId: String(matchId),
    prediction,
    votedAt: toGMT7String(now),
    points: 0,
    evaluated: false,
  };

  db.predictions[predKey] = newPrediction;
  saveDB();

  res.json({
    message: "Lưu dự đoán thành công!",
    prediction: newPrediction,
  });
});

// 7. Get user's predictions
app.get("/api/predictions/:phone", (req, res) => {
  const phone = req.params.phone.trim();
  const list = Object.values(db.predictions).filter((p) => p.playerPhone === phone);
  res.json({ predictions: list });
});

// 7a. Get user's outright predictions
app.get("/api/outright-predictions/:phone", (req, res) => {
  const phone = req.params.phone.trim();
  const prediction = db.outrightPredictions?.[phone] || null;
  res.json({ outright: prediction });
});

// 7b. Submit/Update user's outright predictions
app.post("/api/outright-predictions", (req, res) => {
  const { playerPhone, champion, goldenBoot, goldenGlove, goldenBall } = req.body;
  if (!playerPhone) {
    return res.status(400).json({ error: "Thiếu mã người chơi" });
  }

  const phone = String(playerPhone).trim();
  const player = db.players[phone];
  if (!player) {
    return res.status(404).json({ error: "Không tìm thấy người chơi" });
  }

  const now = getCurrentTime();
  // Khóa vào 00h ngày 19/06/2026 (UTC+7, which is 2026-06-18T17:00:00.000Z)
  const OUTRIGHT_LOCK_TIME = new Date("2026-06-18T17:00:00.000Z");

  if (now > OUTRIGHT_LOCK_TIME) {
    return res.status(400).json({ error: "Đã quá thời hạn dự đoán chung cuộc (00h ngày 19/06/2026)!" });
  }

  if (!db.outrightPredictions) db.outrightPredictions = {};
  db.outrightPredictions[phone] = {
    playerPhone: phone,
    champion: String(champion || "").trim(),
    goldenBoot: String(goldenBoot || "").trim(),
    goldenGlove: String(goldenGlove || "").trim(),
    goldenBall: String(goldenBall || "").trim(),
    updatedAt: toGMT7String(now),
  };

  recalculateAllScores();
  res.json({ message: "Lưu dự đoán dài hạn World Cup thành công!", outright: db.outrightPredictions[phone] });
});

// 7c. Get admin configurations for outright predictions
app.get("/api/admin/outright-config", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Quyền admin bị từ chối!" });
  }
  res.json({
    results: db.outrightResults || { champion: "", goldenBoot: "", goldenGlove: "", goldenBall: "" },
    evaluations: db.outrightEvaluations || {},
    predictions: db.outrightPredictions || {},
    lockTime: "2026-06-18T17:00:00.000Z",
  });
});

// 7d. Save admin configurations for outright predictions & recalculate
app.post("/api/admin/outright-config", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Quyền admin bị từ chối!" });
  }
  const { results, evaluations } = req.body;

  if (results) {
    db.outrightResults = {
      champion: String(results.champion || "").trim(),
      goldenBoot: String(results.goldenBoot || "").trim(),
      goldenGlove: String(results.goldenGlove || "").trim(),
      goldenBall: String(results.goldenBall || "").trim(),
    };
  }

  if (evaluations) {
    db.outrightEvaluations = evaluations;
  }

  recalculateAllScores();
  res.json({
    message: "Cập nhật và tính điểm chung cuộc thành công!",
    results: db.outrightResults,
    evaluations: db.outrightEvaluations,
  });
});

// 8. Leaderboard + Stats
app.get("/api/leaderboard", (req, res) => {
  const playersList = Object.values(db.players);
  const predsList = Object.values(db.predictions);

  const leaderboard = playersList.map((player) => {
    const playerPreds = predsList.filter((p) => p.playerPhone === player.phoneNumber);
    const predictedCount = playerPreds.length;
    const correctCount = playerPreds.filter((p) => p.evaluated && p.points === 0).length;

    // Retrieve outright info for frontend use if desired
    const outright = db.outrightPredictions?.[player.phoneNumber] || null;

    return {
      name: player.name,
      phoneNumber: "******", // Censor secret passcode
      score: player.score,
      createdAt: player.createdAt,
      predictedCount,
      correctCount,
      outright,
    };
  });

  // Sort by score ASCENDING (lower is better), then correctCount desc
  leaderboard.sort((a, b) => {
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    if (b.correctCount !== a.correctCount) {
      return b.correctCount - a.correctCount;
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
app.get("/api/odds", async (req, res) => {
  const { matchId } = req.query;
  const apiKey = process.env.THE_ODDS_API_KEY;

  if (apiKey && apiKey !== "MY_GEMINI_API_KEY" && matchId) {
    // Optional integration with real API wrapper if we want to demonstrate it,
    // otherwise we provide our highly resilient built-in odds engine.
  }

  // Output generated odds for requested matches (or all matches)
  const matchesToProcess = matchId ? db.matches.filter((m) => m.id === String(matchId)) : db.matches;

  const oddsList = matchesToProcess.map((m) => {
    const homeRating = TEAM_RATINGS[m.homeTeam] !== undefined ? TEAM_RATINGS[m.homeTeam] : 6;
    const awayRating = TEAM_RATINGS[m.awayTeam] !== undefined ? TEAM_RATINGS[m.awayTeam] : 6;
    const diff = homeRating - awayRating;
    const idHash = (Number(m.id) || 1) % 10;
    const randomOffset = parseFloat((idHash * 0.02).toFixed(2));

    let homeOdds = 2.5;
    let drawOdds = 3.2;
    let awayOdds = 2.5;

    if (diff === 0) {
      homeOdds = parseFloat((2.3 + randomOffset).toFixed(2));
      awayOdds = parseFloat((2.3 + (0.18 - randomOffset)).toFixed(2));
      drawOdds = parseFloat((3.1 + randomOffset * 0.5).toFixed(2));
    } else if (diff > 0) {
      if (diff <= 2) {
        homeOdds = parseFloat((1.7 + randomOffset).toFixed(2));
        awayOdds = parseFloat((3.4 + randomOffset * 2).toFixed(2));
        drawOdds = parseFloat((3.2 + randomOffset).toFixed(2));
      } else if (diff <= 4) {
        homeOdds = parseFloat((1.35 + randomOffset * 0.5).toFixed(2));
        awayOdds = parseFloat((5.0 + randomOffset * 3).toFixed(2));
        drawOdds = parseFloat((3.8 + randomOffset).toFixed(2));
      } else if (diff <= 6) {
        homeOdds = parseFloat((1.18 + randomOffset * 0.3).toFixed(2));
        awayOdds = parseFloat((8.0 + randomOffset * 5).toFixed(2));
        drawOdds = parseFloat((4.8 + randomOffset * 2).toFixed(2));
      } else {
        homeOdds = parseFloat((1.05 + randomOffset * 0.1).toFixed(2));
        awayOdds = parseFloat((15.0 + randomOffset * 10).toFixed(2));
        drawOdds = parseFloat((6.5 + randomOffset * 4).toFixed(2));
      }
    } else {
      const absDiff = Math.abs(diff);
      if (absDiff <= 2) {
        awayOdds = parseFloat((1.7 + randomOffset).toFixed(2));
        homeOdds = parseFloat((3.4 + randomOffset * 2).toFixed(2));
        drawOdds = parseFloat((3.2 + randomOffset).toFixed(2));
      } else if (absDiff <= 4) {
        awayOdds = parseFloat((1.35 + randomOffset * 0.5).toFixed(2));
        homeOdds = parseFloat((5.0 + randomOffset * 3).toFixed(2));
        drawOdds = parseFloat((3.8 + randomOffset).toFixed(2));
      } else if (absDiff <= 6) {
        awayOdds = parseFloat((1.18 + randomOffset * 0.3).toFixed(2));
        homeOdds = parseFloat((8.0 + randomOffset * 5).toFixed(2));
        drawOdds = parseFloat((4.8 + randomOffset * 2).toFixed(2));
      } else {
        awayOdds = parseFloat((1.05 + randomOffset * 0.1).toFixed(2));
        homeOdds = parseFloat((15.0 + randomOffset * 10).toFixed(2));
        drawOdds = parseFloat((6.5 + randomOffset * 4).toFixed(2));
      }
    }

    return {
      matchId: m.id,
      homeOdds,
      drawOdds,
      awayOdds,
      lastUpdated: toGMT7String(getCurrentTime()),
    };
  });

  res.json({ odds: oddsList });
});

// 10. Generate mock players and predictions for active demo simulation
app.post("/api/admin/generate-demo", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Quyền admin bị từ chối! Chức năng này chỉ dành cho tài khoản Admin." });
  }
  const names = ["Usr-Dần", "Usr-Bin", "Usr-Bop", "Usr-Bảy", "Usr-Bo", "Usr-Bi", "Usr-Sáu", "Usr-Ninh", "Usr-Hòa", "Trọng Tài", "Khách VIP", "Bình Luận", "Chuyên Gia"];
  const phones = ["582914", "719462", "348105", "925183", "260341", "815729", "492815", "318529", "674913", "491730", "602854", "137496", "850143"];

  // Add players
  for (let i = 0; i < names.length; i++) {
    db.players[phones[i]] = {
      phoneNumber: phones[i],
      name: names[i],
      score: 0,
      createdAt: toGMT7String(new Date("2026-06-08T00:00:00Z")),
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
    m.status = "FINISHED";
    m.homeScore = matchResults[i].home;
    m.awayScore = matchResults[i].away;
    m.winner = getHandicapWinner(m, m.homeScore, m.awayScore);
    m.visible = true; // Make active matches visible
  }

  // Add random predictions for those matches for all players
  const predictionOptions: ("HOME" | "DRAW" | "AWAY")[] = ["HOME", "DRAW", "AWAY"];

  for (const phone of phones) {
    // Predict matches 1 to 15
    for (let mIdx = 0; mIdx < 15; mIdx++) {
      const match = db.matches[mIdx];
      const randomPred = predictionOptions[Math.floor(Math.random() * 3)];
      const votedTime = new Date("2026-06-11T12:00:00Z");

      const predKey = `${phone}_${match.id}`;

      let points = 0;
      let evaluated = false;
      if (match.status === "FINISHED") {
        evaluated = true;
        points = randomPred === match.winner ? 0 : 1; // 0 for correct, 1 for incorrect
      }

      db.predictions[predKey] = {
        playerPhone: phone,
        matchId: match.id,
        prediction: randomPred,
        votedAt: toGMT7String(votedTime),
        points,
        evaluated,
      };
    }
  }

  // Setup Outright predictions & official results for representation
  db.outrightResults = {
    champion: "Pháp",
    goldenBoot: "Mbappe",
    goldenGlove: "Maignan",
    goldenBall: "Griezmann",
  };

  db.outrightPredictions = {};
  db.outrightEvaluations = {};

  const teamsDemo = ["Brazil", "Pháp", "Anh", "Argentina", "Bồ Đào Nha", "Ý"];
  const playersDemo = ["Mbappe", "Haaland", "Cristiano Ronaldo", "Kane", "Messi", "Bellingham"];
  const gkDemo = ["Maignan", "Alisson", "Courtois", "Donnarumma", "Pickford", "Martinez"];

  phones.forEach((phone, idx) => {
    // Add varying outright predictions
    const choiceChg = idx % 2 === 0 ? "Pháp" : teamsDemo[idx % teamsDemo.length];
    const choiceBoot = idx % 3 === 0 ? "Mbappe" : playersDemo[idx % playersDemo.length];
    const choiceGlove = idx % 4 === 0 ? "Maignan" : gkDemo[idx % gkDemo.length];
    const choiceBall = idx % 5 === 0 ? "Griezmann" : playersDemo[idx % playersDemo.length];

    db.outrightPredictions![phone] = {
      playerPhone: phone,
      champion: choiceChg,
      goldenBoot: choiceBoot,
      goldenGlove: choiceGlove,
      goldenBall: choiceBall,
      updatedAt: toGMT7String(new Date("2026-06-12T12:00:00Z")),
    };
  });

  recalculateAllScores();
  res.json({ message: "Đã tạo 10 tài khoản mẫu cùng các dự đoán trận đấu và dự kiến chung cuộc (Pháp, Mbappe, Maignan) thành công!", players: db.players });
});

// 11. Reset whole database to clean slate
app.post("/api/admin/reset-db", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Quyền admin bị từ chối! Chức năng này chỉ dành cho tài khoản Admin." });
  }
  // Create auto-backup snapshot before reset
  createAutomaticBackup("pre_reset_undo");

  db = {
    players: {},
    predictions: {},
    matches: generate104Matches().map((m) => ({ ...m, visible: m.status === "FINISHED" })),
    simulatedTime: null,
    adminCustomizedVisibility: {},
  };
  seedDefaultPlayers();
  saveDB();
  res.json({ message: "Đặt lại toàn bộ dữ liệu thành công", matchesCount: db.matches.length });
});

// 12. Get full registered player list with pass code details (Admin only)
app.get("/api/admin/players", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Quyền admin bị từ chối! Chức năng này chỉ dành cho tài khoản Admin." });
  }
  const players = Object.values(db.players).map((p) => ({
    name: p.name,
    code: p.phoneNumber, // original secret code is stored as phoneNumber mapped field
    score: p.score,
    createdAt: p.createdAt,
  }));
  res.json({ players });
});

// 12.5. Update match details (Admin only, separate from scoring)
app.post("/api/admin/matches/update-details", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Quyền admin bị từ chối! Chức năng này chỉ dành cho tài khoản Admin." });
  }
  const { matchId, homeTeam, awayTeam, stage, matchTime, handicapFavored, handicapValue } = req.body;
  const match = db.matches.find((m) => m.id === String(matchId));
  if (!match) {
    return res.status(404).json({ error: "Không tìm thấy trận đấu" });
  }

  if (homeTeam && typeof homeTeam === "string") {
    match.homeTeam = homeTeam.trim();
    match.isCustomized = true;
  }
  if (awayTeam && typeof awayTeam === "string") {
    match.awayTeam = awayTeam.trim();
    match.isCustomized = true;
  }
  if (stage && typeof stage === "string") {
    match.stage = stage.trim();
    match.isCustomized = true;
  }
  if (matchTime && typeof matchTime === "string") {
    match.matchTime = matchTime.trim();
    match.isCustomized = true;
  }

  // Handle custom handicap
  if (handicapFavored && ["HOME", "AWAY", "NONE"].includes(handicapFavored)) {
    match.handicapFavored = handicapFavored;
  } else if (handicapFavored === "NONE" || handicapFavored === null) {
    match.handicapFavored = "NONE";
  }

  if (handicapValue !== undefined) {
    const val = Number(handicapValue);
    if (!isNaN(val)) {
      match.handicapValue = val;
    }
  }

  // Recalculate winner if match is finished
  if (match.status === "FINISHED" && match.homeScore !== undefined && match.awayScore !== undefined) {
    match.winner = getHandicapWinner(match, match.homeScore, match.awayScore);
  }

  recalculateAllScores();
  saveDB();
  res.json({ message: "Cập nhật thông tin trận đấu thành công!", match });
});

// 12.6. Create standalone exhibition match (Admin only)
app.post("/api/admin/matches/create-exhibition", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Quyền admin bị từ chối! Chức năng này chỉ dành cho tài khoản Admin." });
  }

  const { homeTeam, awayTeam, matchTime, stage, note, handicapFavored, handicapValue } = req.body;

  if (!homeTeam || !awayTeam) {
    return res.status(400).json({ error: "Vui lòng nhập tên Đội Nhà và Đội Khách!" });
  }

  const newId = `ex_${Date.now()}`;
  const cleanStage = stage && typeof stage === "string" && stage.trim() ? stage.trim() : "Trận ngoài lề";

  const exhibitionMatch: Match = {
    id: newId,
    homeTeam: homeTeam.trim(),
    awayTeam: awayTeam.trim(),
    matchTime: matchTime && typeof matchTime === "string" ? matchTime : toGMT7String(getCurrentTime()),
    status: "SCHEDULED",
    stage: cleanStage.startsWith("Trận ngoài lề") ? cleanStage : `Trận ngoài lề - ${cleanStage}`,
    visible: true,
    isCustomized: true,
    isExhibition: true,
    note: note && typeof note === "string" ? note.trim() : "Trận đấu thêm (Đoán đúng: 0đ | Đoán sai/Bỏ lỡ: +1đ phạt)",
    handicapFavored: handicapFavored && ["HOME", "AWAY", "NONE"].includes(handicapFavored) ? handicapFavored : "NONE",
    handicapValue: handicapValue !== undefined ? Number(handicapValue) || 0 : 0,
  };

  db.matches.push(exhibitionMatch);
  recalculateAllScores();
  saveDB();

  res.json({
    message: "Tạo trận ngoài lề riêng lẻ thành công!",
    match: exhibitionMatch,
  });
});

// 12.7. Delete standalone exhibition match (Admin only)
app.post("/api/admin/matches/delete-exhibition", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Quyền admin bị từ chối! Chức năng này chỉ dành cho tài khoản Admin." });
  }

  const { matchId } = req.body;
  if (!matchId) {
    return res.status(400).json({ error: "Thiếu mã trận đấu cần xóa" });
  }

  const idx = db.matches.findIndex((m) => m.id === String(matchId));
  if (idx === -1) {
    return res.status(404).json({ error: "Không tìm thấy trận đấu cần xóa" });
  }

  const deletedMatch = db.matches.splice(idx, 1)[0];

  // Remove predictions related to this deleted match
  for (const predKey of Object.keys(db.predictions)) {
    if (predKey.endsWith(`_${matchId}`)) {
      delete db.predictions[predKey];
    }
  }

  recalculateAllScores();
  saveDB();

  res.json({
    message: `Đã xóa trận ngoài lề (${deletedMatch.homeTeam} vs ${deletedMatch.awayTeam}) thành công!`,
  });
});

// 13. Toggle match visibility dynamically (Admin only)
app.post("/api/admin/matches/toggle-visibility", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Quyền admin bị từ chối! Chức năng này chỉ dành cho tài khoản Admin." });
  }
  const { matchId, visible } = req.body;
  const match = db.matches.find((m) => m.id === String(matchId));
  if (!match) {
    return res.status(404).json({ error: "Không tìm thấy trận đấu" });
  }
  match.visible = !!visible;
  if (!db.adminCustomizedVisibility) {
    db.adminCustomizedVisibility = {};
  }
  db.adminCustomizedVisibility[match.id] = !!visible;
  saveDB();
  res.json({ message: `Đã ${visible ? "HIỂN THỊ" : "ẨN"} trận đấu ${matchId} thành công!`, match });
});

// 14. Bulk visibility action (Admin only toggle)
app.post("/api/admin/matches/bulk-visibility", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Quyền admin bị từ chối! Chức năng này chỉ dành cho tài khoản Admin." });
  }
  const { visible } = req.body;
  if (!db.adminCustomizedVisibility) {
    db.adminCustomizedVisibility = {};
  }

  let affectedCount = 0;
  for (const m of db.matches) {
    if (!visible) {
      // If we are hiding all, protect FINISHED and LIVE matches
      if (m.status === "FINISHED" || m.status === "LIVE" || (m.homeScore !== undefined && m.awayScore !== undefined)) {
        m.visible = true;
        db.adminCustomizedVisibility[m.id] = true;
      } else {
        m.visible = false;
        db.adminCustomizedVisibility[m.id] = false;
        affectedCount++;
      }
    } else {
      m.visible = true;
      db.adminCustomizedVisibility[m.id] = true;
      affectedCount++;
    }
  }
  saveDB();

  const msg = visible
    ? `Đã hiển thị toàn bộ 104 trận đấu thành công!`
    : `Đã cắt ẩn ${affectedCount} trận đấu chưa bắt đầu (SCHEDULED) thành công! Các trận đấu đang trực tiếp (LIVE) hoặc đã kết thúc (FINISHED) được tự động giữ hiển thị để bảo toàn dữ liệu bảng điểm.`;

  res.json({ message: msg });
});

// 14.5 Public/Unified user voting/prediction histories (Masked phone for regular users)
app.get("/api/predictions-history", (req, res) => {
  const isAdm = isAdmin(req);

  const history = Object.values(db.predictions || {}).map((p) => {
    const player = db.players[p.playerPhone];
    const match = db.matches.find((m) => m.id === p.matchId);
    return {
      playerPhone: isAdm ? p.playerPhone : "******",
      playerName: player ? player.name : "Vô danh",
      matchId: p.matchId,
      homeTeam: match ? match.homeTeam : "Không rõ",
      awayTeam: match ? match.awayTeam : "Không rõ",
      prediction: p.prediction,
      votedAt: p.votedAt,
      points: p.points,
      evaluated: p.evaluated,
      matchStatus: match ? match.status : "Không rõ",
      matchTime: match ? match.matchTime : null,
      matchStage: match ? match.stage : null,
    };
  });

  // Sort by votedAt desc (newest first)
  history.sort((a, b) => new Date(b.votedAt).getTime() - new Date(a.votedAt).getTime());

  res.json({ history });
});

// 15. Get all user voting/prediction histories (Admin only)
app.get("/api/admin/predictions-history", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Quyền admin bị từ chối! Chức năng này chỉ dành cho tài khoản Admin." });
  }

  const history = Object.values(db.predictions).map((p) => {
    const player = db.players[p.playerPhone];
    const match = db.matches.find((m) => m.id === p.matchId);
    return {
      playerPhone: p.playerPhone,
      playerName: player ? player.name : "Vô danh",
      matchId: p.matchId,
      homeTeam: match ? match.homeTeam : "Không rõ",
      awayTeam: match ? match.awayTeam : "Không rõ",
      prediction: p.prediction,
      votedAt: p.votedAt,
      points: p.points,
      evaluated: p.evaluated,
      matchStatus: match ? match.status : "Không rõ",
      matchTime: match ? match.matchTime : null,
      matchStage: match ? match.stage : null,
    };
  });

  // Sort by votedAt desc (newest first)
  history.sort((a, b) => new Date(b.votedAt).getTime() - new Date(a.votedAt).getTime());

  res.json({ history });
});

// 15.1 Export full backup payload directly (Admin only)
app.get("/api/admin/export-all", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Quyền admin bị từ chối! Chức năng này chỉ dành cho tài khoản Admin." });
  }
  res.json({
    matches: db.matches,
    players: db.players,
    predictions: db.predictions,
    outrightPredictions: db.outrightPredictions || {},
    outrightResults: db.outrightResults || { champion: "", goldenBoot: "", goldenGlove: "", goldenBall: "" },
    outrightEvaluations: db.outrightEvaluations || {},
    adminCustomizedVisibility: db.adminCustomizedVisibility || {},
    timestamp: toGMT7String(new Date()),
  });
});

// 16. Create manual backup (Admin only)
app.post("/api/admin/backups/create", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Quyền admin bị từ chối! Chức năng này chỉ dành cho tài khoản Admin." });
  }

  try {
    const timestamp = toGMT7String(new Date()).replace(/[:.]/g, "-");
    const filename = `manual_backup_${timestamp}.json`;
    const backupFilePath = path.join(BACKUPS_DIR, filename);

    const backupData = {
      matches: db.matches,
      players: db.players,
      predictions: db.predictions,
      outrightPredictions: db.outrightPredictions || {},
      outrightResults: db.outrightResults || { champion: "", goldenBoot: "", goldenGlove: "", goldenBall: "" },
      outrightEvaluations: db.outrightEvaluations || {},
      adminCustomizedVisibility: db.adminCustomizedVisibility || {},
      timestamp: toGMT7String(new Date()),
    };

    fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), "utf-8");
    res.json({ message: `Đã tạo tệp sao lưu ${filename} thành công!`, filename });
  } catch (err: any) {
    res.status(500).json({ error: "Không thể tạo tệp sao lưu: " + err.message });
  }
});

// 17. List all backups (Admin only)
app.get("/api/admin/backups/list", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Quyền admin bị từ chối! Chức năng này chỉ dành cho tài khoản Admin." });
  }

  try {
    if (!fs.existsSync(BACKUPS_DIR)) {
      return res.json({ backups: [] });
    }
    const files = fs.readdirSync(BACKUPS_DIR);
    const backups = files
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const filePath = path.join(BACKUPS_DIR, f);
        const stats = fs.statSync(filePath);
        return {
          filename: f,
          size: stats.size,
          mtime: toGMT7String(stats.mtime),
        };
      })
      .sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime()); // Newest first

    res.json({ backups });
  } catch (err: any) {
    res.status(500).json({ error: "Lỗi khi đọc danh mục sao lưu: " + err.message });
  }
});

// 18. Restore backup on server (Admin only)
app.post("/api/admin/backups/restore", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Quyền admin bị từ chối! Chức năng này chỉ dành cho tài khoản Admin." });
  }

  const { filename } = req.body;
  if (!filename) {
    return res.status(400).json({ error: "Thiếu tên tệp cần khôi phục" });
  }

  try {
    const filePath = path.join(BACKUPS_DIR, String(filename));
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Không tìm thấy tệp sao lưu" });
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(content);

    if (!data.players || !data.predictions) {
      return res.status(400).json({ error: "Cấu trúc tệp sao lưu không hợp lệ" });
    }

    // Auto-create snapshot and replace
    createAutomaticBackup("pre_restore_undo");

    if (data.matches && Array.isArray(data.matches)) {
      db.matches = data.matches;
    }
    db.players = data.players;
    db.predictions = data.predictions;
    db.outrightPredictions = data.outrightPredictions || {};
    db.outrightResults = data.outrightResults || { champion: "", goldenBoot: "", goldenGlove: "", goldenBall: "" };
    db.outrightEvaluations = data.outrightEvaluations || {};
    db.adminCustomizedVisibility = data.adminCustomizedVisibility || {};

    recalculateAllScores();
    saveDB();

    res.json({ message: `Đã khôi phục dữ liệu thành công từ tệp ${filename}!` });
  } catch (err: any) {
    res.status(500).json({ error: "Khôi phục bản sao lưu thất bại: " + err.message });
  }
});

// 19. Delete backup on server (Admin only)
app.post("/api/admin/backups/delete", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Quyền admin bị từ chối! Chức năng này chỉ dành cho tài khoản Admin." });
  }

  const { filename } = req.body;
  if (!filename) {
    return res.status(400).json({ error: "Thiếu tệp cần xóa" });
  }

  try {
    const filePath = path.join(BACKUPS_DIR, String(filename));
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Không tìm thấy tệp sao lưu" });
    }

    fs.unlinkSync(filePath);
    res.json({ message: `Đã xóa tệp sao lưu ${filename} thành công!` });
  } catch (err: any) {
    res.status(500).json({ error: "Xóa sao lưu thất bại: " + err.message });
  }
});

// 20. Direct import backup (Admin only)
app.post("/api/admin/backups/import-direct", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Quyền admin bị từ chối! Chức năng này chỉ dành cho tài khoản Admin." });
  }

  let { backupData } = req.body;
  if (!backupData || typeof backupData !== "object") {
    return res.status(400).json({ error: "Dữ liệu nhập trực tiếp không hợp lệ" });
  }

  try {
    if (backupData.backupData && typeof backupData.backupData === "object") {
      backupData = backupData.backupData;
    }
    if (backupData.data && typeof backupData.data === "object") {
      backupData = backupData.data;
    }

    createAutomaticBackup("pre_import_undo");

    if (backupData.matches && Array.isArray(backupData.matches)) {
      db.matches = backupData.matches;
    }
    if (backupData.players && typeof backupData.players === "object") {
      db.players = backupData.players;
    }
    if (backupData.predictions && typeof backupData.predictions === "object") {
      db.predictions = backupData.predictions;
    }
    if (backupData.outrightPredictions && typeof backupData.outrightPredictions === "object") {
      db.outrightPredictions = backupData.outrightPredictions;
    }
    if (backupData.outrightResults && typeof backupData.outrightResults === "object") {
      db.outrightResults = backupData.outrightResults;
    }
    if (backupData.outrightEvaluations && typeof backupData.outrightEvaluations === "object") {
      db.outrightEvaluations = backupData.outrightEvaluations;
    }
    if (backupData.adminCustomizedVisibility && typeof backupData.adminCustomizedVisibility === "object") {
      db.adminCustomizedVisibility = backupData.adminCustomizedVisibility;
    }

    recalculateAllScores();
    saveDB();

    res.json({ message: "Khôi phục và nhập dữ liệu từ tệp sao lưu JSON thành công!" });
  } catch (err: any) {
    res.status(400).json({ error: "Lỗi khi khôi phục dữ liệu: " + err.message });
  }
});

// Serve Vite or static builds
async function startServer() {
  console.log("[Startup] Loading up database partitions...");
  await loadDB();

  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Development Server running on http://localhost:${PORT}`);
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Production Server running on http://localhost:${PORT}`);
    });
  }
}

startServer().catch((err) => {
  console.error("Fail to start server:", err);
});
