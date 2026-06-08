/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Match } from '../types';

export const GROUPS = [
  { name: 'A', teams: ['Mexico', 'Ecuador', 'Venezuela', 'Jamaica'] },
  { name: 'B', teams: ['Canada', 'Argentina', 'Peru', 'Chile'] },
  { name: 'C', teams: ['Mỹ (USA)', 'Uruguay', 'Panama', 'Bolivia'] },
  { name: 'D', teams: ['Brazil', 'Colombia', 'Paraguay', 'Costa Rica'] },
  { name: 'E', teams: ['Pháp (France)', 'Hà Lan', 'Ba Lan', 'Áo'] },
  { name: 'F', teams: ['Bỉ (Belgium)', 'Slovakia', 'Romania', 'Ukraine'] },
  { name: 'G', teams: ['Đức (Germany)', 'Hungary', 'Thụy Sĩ', 'Scotland'] },
  { name: 'H', teams: ['Tây Ban Nha', 'Croatia', 'Ý (Italy)', 'Albania'] },
  { name: 'I', teams: ['Anh (England)', 'Đan Mạch', 'Slovenia', 'Serbia'] },
  { name: 'J', teams: ['Bồ Đào Nha', 'Thổ Nhĩ Kỳ', 'Georgia', 'CH Séc'] },
  { name: 'K', teams: ['Ma-rốc (Morocco)', 'CHDC Công-gô', 'Zambia', 'Tanzania'] },
  { name: 'L', teams: ['Nhật Bản (Japan)', 'Úc (Australia)', 'Ả Rập Xê-út', 'Bahrain'] },
];

export function generate104Matches(): Match[] {
  const matches: Match[] = [];
  let matchIdCounter = 1;

  // Base starting date: June 11, 2026
  let currentDateTime = new Date('2026-06-11T16:00:00Z'); // UTC

  // Helper to add matches and advance time slightly
  const addMatch = (home: string, away: string, stage: string) => {
    const id = String(matchIdCounter++);
    matches.push({
      id,
      homeTeam: home,
      awayTeam: away,
      matchTime: currentDateTime.toISOString(),
      status: 'SCHEDULED',
      stage,
    });
    // Add 4 hours for the next match, or daily distribution
    if (matchIdCounter % 3 === 0) {
      // Move to next day
      currentDateTime = new Date(currentDateTime.getTime() + 16 * 60 * 60 * 1000);
    } else {
      currentDateTime = new Date(currentDateTime.getTime() + 4 * 60 * 60 * 1000);
    }
  };

  // 1. Group Stage: 12 groups, 6 matches per group = 72 matches
  for (const group of GROUPS) {
    const t = group.teams;
    const stageName = `Vòng bảng - Bảng ${group.name}`;
    
    // Match 1: T1 vs T2
    addMatch(t[0], t[1], stageName);
    // Match 2: T3 vs T4
    addMatch(t[2], t[3], stageName);
    // Match 3: T1 vs T3
    addMatch(t[0], t[2], stageName);
    // Match 4: T4 vs T2
    addMatch(t[3], t[1], stageName);
    // Match 5: T4 vs T1
    addMatch(t[3], t[0], stageName);
    // Match 6: t[1] vs t[2]
    addMatch(t[1], t[3], stageName);
  }

  // Align dates for Round of 32: Starting around June 28, 2026
  currentDateTime = new Date('2026-06-28T16:00:00Z');

  // 2. Round of 32 (Matches 73 to 88 - 16 Matches)
  const roundOf32Pairs = [
    { home: 'Nhất Bảng A', away: 'Nhì Bảng C' },
    { home: 'Nhất Bảng B', away: 'Hạng 3 Bảng A/C/D' },
    { home: 'Nhất Bảng C', away: 'Nhì Bảng D' },
    { home: 'Nhất Bảng D', away: 'Hạng 3 Bảng B/E/F' },
    { home: 'Nhất Bảng E', away: 'Nhì Bảng F' },
    { home: 'Nhất Bảng F', away: 'Nhì Bảng E' },
    { home: 'Nhất Bảng G', away: 'Nhì Bảng H' },
    { home: 'Nhất Bảng H', away: 'Nhì Bảng G' },
    { home: 'Nhất Bảng I', away: 'Nhì Bảng J' },
    { home: 'Nhất Bảng J', away: 'Nhì Bảng I' },
    { home: 'Nhất Bảng K', away: 'Nhì Bảng L' },
    { home: 'Nhất Bảng L', away: 'Nhì Bảng K' },
    { home: 'Nhì Bảng A', away: 'Nhì Bảng B' },
    { home: 'Nhì Bảng K', away: 'Nhì Bảng J' },
    { home: 'Hạng 3 Bảng G/H/I', away: 'Nhất Bảng K' },
    { home: 'Hạng 3 Bảng J/K/L', away: 'Nhất Bảng L' },
  ];

  for (const pair of roundOf32Pairs) {
    addMatch(pair.home, pair.away, 'Vòng 32');
  }

  // Align dates for Round of 16: Starting around July 4, 2026
  currentDateTime = new Date('2026-07-04T18:00:00Z');

  // 3. Round of 16 (Matches 89 to 96 - 8 Matches)
  for (let i = 1; i <= 8; i++) {
    const matchHomeIndex = 72 + (i - 1) * 2 + 1;
    const matchAwayIndex = 72 + (i - 1) * 2 + 2;
    addMatch(`Thắng Trận ${matchHomeIndex}`, `Thắng Trận ${matchAwayIndex}`, 'Vòng 16');
  }

  // Align dates for Quarter-finals: Starting around July 9, 2026
  currentDateTime = new Date('2026-07-09T18:00:00Z');

  // 4. Tứ kết (Matches 97 to 100 - 4 Matches)
  for (let i = 1; i <= 4; i++) {
    const matchHomeIndex = 88 + (i - 1) * 2 + 1;
    const matchAwayIndex = 88 + (i - 1) * 2 + 2;
    addMatch(`Thắng Trận ${matchHomeIndex}`, `Thắng Trận ${matchAwayIndex}`, 'Tứ kết');
  }

  // Align dates for Semi-finals: Starting around July 14, 2026
  currentDateTime = new Date('2026-07-14T20:00:00Z');

  // 5. Bán kết (Matches 101 to 102 - 2 Matches)
  addMatch('Thắng Trận 97', 'Thắng Trận 98', 'Bán kết');
  addMatch('Thắng Trận 99', 'Thắng Trận 100', 'Bán kết');

  // Align dates for Third Place: July 18, 2026
  currentDateTime = new Date('2026-07-18T20:00:00Z');

  // 6. Tranh hạng Ba (Match 103)
  addMatch('Thua Trận 101', 'Thua Trận 102', 'Tranh hạng Ba');

  // Align dates for Final: July 19, 2026
  currentDateTime = new Date('2026-07-19T19:00:00Z');

  // 7. Chung kết (Match 104)
  addMatch('Thắng Trận 101', 'Thắng Trận 102', 'Chung kết');

  return matches;
}
