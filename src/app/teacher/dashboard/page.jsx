"use client";
import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import * as XLSX from "xlsx";
import "./page.css";

import Link from "next/link";
import StatCard from "@/components/StatCard";
import RecentActivity from "@/components/RecentActivity";

export default function TeacherDashboard() {
  const { data: session } = useSession();
  const user = session?.user;

  const [courseCount, setCourseCount] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);
  const [recentPayments, setRecentPayments] = useState([]);
  const [recentLimit, setRecentLimit] = useState(3);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [previewUrl, setPreviewUrl] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/courses");
        if (res.ok) {
          const courses = await res.json();
          setCourseCount(courses.length);
        }
      } catch (e) { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const paidStatuses = ["支払い済み", "paid", "completed"].map(encodeURIComponent).join(",");
        const res = await fetch(`/api/payments?limit=500`);
        if (res.ok) {
          const payments = await res.json();
          const paidSet = new Set(["支払い済み", "paid", "completed"]);
          const sum = payments.reduce((acc, p) => {
            if (!paidSet.has(p.status)) return acc;
            return acc + (Number(p.amount) || 0);
          }, 0);
          setTotalPaid(sum);
        }
      } catch (e) { /* ignore */ }
    })();
  }, []);

  const fetchRecent = async () => {
    try {
      const res = await fetch(`/api/payments?limit=${recentLimit}&orderBy=createdAt`);
      if (res.ok) setRecentPayments(await res.json());
    } catch (e) { /* ignore */ }
  };

  useEffect(() => {
    fetchRecent();
    const interval = setInterval(fetchRecent, 10000);
    return () => clearInterval(interval);
  }, [recentLimit]);

  const handleExportExcel = async () => {
    if (!selectedMonth) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/admin/stats?month=${selectedMonth}`);
      if (!res.ok) throw new Error();
      const { students } = await res.json();
      if (!students?.length) { alert("選択した月に未払いの学生はいません。"); return; }
      const [y, m] = selectedMonth.split("-");
      const label = `${y}年${Number(m)}月`;
      const data = students.map((s) => ({
        "コース": s.courseName,
        "学年": s.grade,
        "学生番号": s.studentId,
        "氏名": s.name,
        "未払い月": s.unpaidMonths.join("/"),
        "学費（円）": s.totalFee,
        "支払い済み（円）": s.totalPaid,
        "残り（円）": s.totalRemaining,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [22, 10, 12, 14, 26, 14, 14, 14].map((w) => ({ wch: w }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `未払い_${label}`);
      XLSX.writeFile(wb, `未払い一覧_${label}.xlsx`);
    } catch (e) {
      alert("ダウンロードに失敗しました。");
    } finally {
      setDownloading(false);
    }
  };


  const fetchPending = async () => {
    try {
      const res = await fetch("/api/payments?status=確認中&limit=100&orderBy=createdAt");
      if (res.ok) setPendingPayments(await res.json());
    } catch (e) { /* ignore */ }
    finally { setPendingLoading(false); }
  };

  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleApprove = async (paymentId) => {
    await fetch(`/api/payments/${paymentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", approvedBy: user?.name || user?.email }),
    });
    fetchPending();
    fetchRecent();
  };

  const handleReject = async (paymentId) => {
    const reason = rejectReason.trim();
    await fetch(`/api/payments/${paymentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", rejectReason: reason }),
    });
    setRejectingId(null);
    setRejectReason("");
    fetchPending();
  };

  const th = { padding: "8px 12px", fontWeight: 600, fontSize: 13, color: "#374151", whiteSpace: "nowrap" };
  const td = { padding: "10px 12px", verticalAlign: "middle" };
  const approveBtn = { padding: "5px 12px", borderRadius: 6, border: "none", background: "#10b981", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13 };
  const rejectBtn = { padding: "5px 12px", borderRadius: 6, border: "none", background: "#ef4444", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13 };
  const cancelBtn = { padding: "5px 12px", borderRadius: 6, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 13 };

  const stats = [
    {
      title: "コース数",
      value: courseCount,
      color: "#4F9DDE",
      link: "/teacher/dashboard/course",
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <rect width="20" height="14" x="2" y="5" rx="2" fill="#4F9DDE" />
          <path d="M6 9h12" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      title: "支払金",
      value: `¥${totalPaid.toLocaleString()}`,
      color: "#57C785",
      link: "/teacher/dashboard/payment",
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <rect x="2" y="6" width="20" height="12" rx="2" fill="#57C785" />
          <path d="M7 12h10" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="8.5" cy="12" r="0.8" fill="#fff" />
        </svg>
      ),
    },
    {
      title: "ログ",
      value: "一覧を見る",
      color: "#A855F7",
      link: "/admin/logs",
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <rect x="4" y="3" width="16" height="18" rx="2" fill="#A855F7" />
          <path d="M8 8h8M8 12h8M8 16h5" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      ),
    },
  ];

  return (
    <div className="dashboard">
      {/* Receipt preview modal */}
      {previewUrl && (
        <div onClick={() => setPreviewUrl(null)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, cursor: "zoom-out",
        }}>
          <img src={previewUrl} alt="receipt" style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 8 }} />
        </div>
      )}

      <header className="dashboard-header">
        <div>
          <h1>学費管理システム・{user?.isAdmin ? "管理者用" : "教師用"}</h1>
          <div style={{ color: "#666", marginTop: 6 }}>ようこそ、{user?.name || "先生"} さん</div>
        </div>
      </header>

      <div className="stats-grid">
        {stats.map((stat, index) => (
          <Link key={index} href={stat.link} className="stat-card link-card">
            <StatCard title={stat.title} value={stat.value} color={stat.color} icon={stat.icon} />
          </Link>
        ))}
      </div>

      {/* Month selector + Excel download */}
      {(() => {
        const year = new Date().getFullYear();
        const months = Array.from({ length: 12 }, (_, i) => {
          const m = i + 1;
          return { value: `${year}-${String(m).padStart(2, "0")}`, label: `${year}年${m}月` };
        });
        return (
          <div className="card" style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <label style={{ fontWeight: 600, fontSize: 14, color: "#374151" }}>対象月を選択：</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, cursor: "pointer" }}>
              {months.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <button
              onClick={handleExportExcel}
              disabled={downloading}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 20px", borderRadius: 8, border: "none",
                background: downloading ? "#9ca3af" : "#3b82f6", color: "#fff",
                cursor: downloading ? "default" : "pointer", fontWeight: 700, fontSize: 14 }}>
              {downloading ? "作成中..." : "📥 Excelダウンロード"}
            </button>
          </div>
        );
      })()}

      {/* Pending approvals section */}
      <div className="card" style={{ marginTop: 24, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>承認待ち一覧</h3>
          {pendingPayments.length > 0 && (
            <span style={{
              background: "#ef4444", color: "#fff",
              borderRadius: 999, fontSize: 12, padding: "2px 8px", fontWeight: 700,
            }}>{pendingPayments.length}</span>
          )}
        </div>

        {pendingLoading ? (
          <div style={{ color: "#888", padding: "12px 0" }}>読み込み中…</div>
        ) : pendingPayments.length === 0 ? (
          <div style={{ color: "#888", padding: "12px 0" }}>承認待ちの支払いはありません</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f9fafb", textAlign: "left" }}>
                  <th style={th}>学生番号</th>
                  <th style={th}>金額</th>
                  <th style={th}>対象月</th>
                  <th style={th}>アップロード日</th>
                  <th style={th}>領収書</th>
                  <th style={th}>操作</th>
                </tr>
              </thead>
              <tbody>
                {pendingPayments.map((p) => (
                  <React.Fragment key={p.id}>
                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <td style={td}>
                        <Link href={`/student/dashboard/${p.studentId}`} style={{ color: "#3b82f6" }}>
                          {p.studentId}
                        </Link>
                      </td>
                      <td style={td}>¥{Number(p.amount || 0).toLocaleString()}</td>
                      <td style={td}>{p.month || "-"}</td>
                      <td style={td}>
                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString("ja-JP") : "-"}
                      </td>
                      <td style={td}>
                        {p.receiptBase64 ? (
                          <img
                            src={p.receiptBase64}
                            alt="receipt"
                            onClick={() => setPreviewUrl(p.receiptBase64)}
                            style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4, cursor: "zoom-in", border: "1px solid #e5e7eb" }}
                          />
                        ) : <span style={{ color: "#bbb" }}>なし</span>}
                      </td>
                      <td style={td}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button onClick={() => handleApprove(p.paymentId)} style={approveBtn}>承認</button>
                          <button onClick={() => { setRejectingId(p.paymentId); setRejectReason(""); }} style={rejectBtn}>却下</button>
                        </div>
                      </td>
                    </tr>
                    {rejectingId === p.paymentId && (
                      <tr>
                        <td colSpan={6} style={{ padding: "8px 12px", background: "#fff7f7", borderBottom: "1px solid #e5e7eb" }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <input
                              type="text"
                              placeholder="却下理由を入力..."
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              style={{ flex: 1, padding: "6px 10px", border: "1px solid #fca5a5", borderRadius: 6, minWidth: 180 }}
                              autoFocus
                            />
                            <button onClick={() => handleReject(p.paymentId)} style={rejectBtn}>送信</button>
                            <button onClick={() => setRejectingId(null)} style={cancelBtn}>キャンセル</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <aside>
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>クイックアクション</h3>
        </div>
        <div className="card">
          <RecentActivity
            items={recentPayments.map((p) => {
              const t = p.createdAt ? new Date(p.createdAt) : new Date();
              const time = t.toLocaleString("ja-JP");
              const title = (p.receiptBase64 || p.receiptUrl)
                ? `${p.studentId || "unknown"} がレシートをアップロードしました`
                : `${p.studentId || "unknown"} の支払いが登録されました`;
              const detail = `金額: ¥${Number(p.amount || 0).toLocaleString()}  コース: ${p.course || "-"}`;
              return { title, time, detail, status: p.status, verified: p.verified, rejectReason: p.rejectReason };
            })}
          />
          <div style={{ marginTop: 8, display: "flex", alignItems: "center" }}>
            <div style={{ marginLeft: "auto" }}>
              <button
                onClick={() => setRecentLimit((prev) => (prev === 3 ? 20 : 3))}
                style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ddd", background: "#fff" }}
              >
                {recentLimit === 3 ? "もっと見る" : "閉じる"}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
