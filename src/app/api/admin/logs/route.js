import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// GET /api/admin/logs?actor=...&action=...&from=...&to=...
// Returns audit log entries (admin logins + changes), newest first.
export async function GET(req) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  const isAdmin = session?.user?.isAdmin;
  if (!session || (!isAdmin && role !== "teacher")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const actor = searchParams.get("actor");
  const action = searchParams.get("action");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where = {};
  if (actor) where.actor = { contains: actor, mode: "insensitive" };
  if (action) where.action = action;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) {
      // Include the whole "to" day
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json(logs);
}
