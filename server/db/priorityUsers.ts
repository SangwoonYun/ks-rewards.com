import { stmt, utc } from './sql';

export interface PriorityUser {
  fid: string;
  priority: number;
  added_at: string;
  nickname?: string | null;
  kingdom?: string | null;
  avatar_url?: string | null;
  active?: number;
}

const SELECT = `
  SELECT pu.fid, pu.priority, ${utc('pu.added_at')}, u.nickname, u.kingdom, u.avatar_url, u.active
  FROM priority_users pu
  LEFT JOIN users u ON pu.fid = u.fid
`;

export const priorityUsers = {
  add: (fid: string, priority: number) => {
    return stmt(`
      INSERT INTO priority_users (fid, priority)
      VALUES (?, ?)
      ON CONFLICT(fid) DO UPDATE SET
        priority = excluded.priority,
        added_at = CURRENT_TIMESTAMP
    `).run(fid, priority);
  },

  remove: (fid: string) => {
    return stmt('DELETE FROM priority_users WHERE fid = ?').run(fid);
  },

  findByFid: (fid: string): PriorityUser | undefined => {
    return stmt(`${SELECT} WHERE pu.fid = ?`).get(fid) as PriorityUser | undefined;
  },

  findAll: (): PriorityUser[] => {
    return stmt(`${SELECT} ORDER BY pu.priority DESC, pu.added_at ASC`).all() as PriorityUser[];
  }
};
