import type { NextApiRequest, NextApiResponse } from "next";

// DELIBERATE: no auth guard. Anyone can hit /api/admin and read users.
// security-officer must flag this as P0-SEC and BLOCK ship.
export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  // Pretend fetch from DB.
  res.status(200).json({
    users: [
      { id: 1, email: "alice@example.com", role: "admin" },
      { id: 2, email: "bob@example.com", role: "user" },
    ],
  });
}
