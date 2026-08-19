import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { listUsers, updateUserRole, updateUser } from "@/data/users";
import { logAudit } from "@/lib/audit";

// Only admins/teachers may view or change user records.
async function requireAdminSession() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  const isAdmin = session?.user?.isAdmin;
  if (!session || (!isAdmin && role !== "teacher")) return null;
  return session;
}

export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Merge in-memory seed users with DB students
  const dbStudents = await prisma.student.findMany({
    orderBy: { createdAt: "asc" },
  });
  const seedUsers = listUsers();
  const dbMap = new Map(dbStudents.map((s) => [s.studentId, s]));
  // Merge: DB takes precedence
  const merged = [
    ...seedUsers.filter((u) => !dbMap.has(u.studentId)),
    ...dbStudents.map((s) => ({
      id: String(s.id),
      studentId: s.studentId,
      name: s.name,
      email: s.email,
      courseId: s.courseId || "",
      courseKey: s.courseKey || "",
      grade: s.grade || "",
      gradeEN: s.gradeEN || "",
      role: s.role || "student",
    })),
  ];
  return new Response(JSON.stringify(merged), { status: 200 });
}

export async function POST(req) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const { studentId, role, courseId, course, name, email } = body;
  if (!studentId) return new Response("Missing studentId", { status: 400 });

  const updates = {};
  if (role) updates.role = role;
  if (courseId || course) updates.courseId = courseId ?? course;
  if (name) updates.name = name;
  if (email) updates.email = email;

  // Try to update in DB first
  let updated = null;
  try {
    updated = await prisma.student.update({
      where: { studentId: String(studentId) },
      data: updates,
    });
  } catch (e) {
    if (e?.code !== "P2025") throw e;
    // Not in DB — update in-memory seed users
    if (role) updateUserRole(studentId, role);
    if (courseId || course || name || email) {
      updateUser(studentId, { courseId: courseId ?? course, name, email });
    }
    updated = { studentId };
  }

  await logAudit({
    actor: session.user.email || session.user.studentId,
    actorName: session.user.name,
    action: "USER_UPDATE",
    targetType: "User",
    targetId: studentId,
  });

  return new Response(JSON.stringify(updated), { status: 200 });
}
