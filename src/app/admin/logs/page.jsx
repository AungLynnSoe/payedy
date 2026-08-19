"use client";

import React, { useEffect, useState } from "react";
import { useRequireRole } from "@/lib/auth";

const ACTION_LABELS = {
  LOGIN: "ログイン",
  USER_UPDATE: "ユーザー情報変更",
};

function formatTarget(log) {
  if (!log.targetType) return "-";
  return log.targetId ? `${log.targetType}: ${log.targetId}` : log.targetType;
}

export default function AdminLogsPage() {
  // Only admins/teachers may view this page.
  useRequireRole("teacher");

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ actor: "", action: "", from: "", to: "" });

  const fetchLogs = async (f = filters) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (f.actor) params.set("actor", f.actor);
      if (f.action) params.set("action", f.action);
      if (f.from) params.set("from", f.from);
      if (f.to) params.set("to", f.to);
      const res = await fetch(`/api/admin/logs?${params.toString()}`);
      if (res.ok) setLogs(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const th = { padding: "8px 12px", fontWeight: 600, fontSize: 13, color: "#374151", whiteSpace: "nowrap", textAlign: "left" };
  const td = { padding: "10px 12px", verticalAlign: "middle", fontSize: 14 };
  const input = { padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 };

  return (
    <div style={{ padding: "24px 20px", maxWidth: 1100, margin: "0 auto", fontFamily: "Inter, 'Noto Sans JP', system-ui, sans-serif", color: "#0F172A" }}>
      <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 20 }}>操作ログ</h1>
      <div style={{ color: "#64748B", marginBottom: 20, fontSize: 13 }}>
        管理者のログイン履歴と変更操作を確認できます(生徒のログインは記録対象外です)。
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          fetchLogs();
        }}
        style={{
          display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center",
          background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: 16, marginBottom: 20,
        }}
      >
        <input
          type="text"
          placeholder="操作者(メール/学籍番号)"
          value={filters.actor}
          onChange={(e) => setFilters((f) => ({ ...f, actor: e.target.value }))}
          style={{ ...input, minWidth: 200 }}
        />
        <select
          value={filters.action}
          onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
          style={input}
        >
          <option value="">すべての種類</option>
          {Object.entries(ACTION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <label style={{ fontSize: 13, color: "#374151", display: "flex", alignItems: "center", gap: 6 }}>
          開始日
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            style={input}
          />
        </label>
        <label style={{ fontSize: 13, color: "#374151", display: "flex", alignItems: "center", gap: 6 }}>
          終了日
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            style={input}
          />
        </label>
        <button
          type="submit"
          style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
        >
          絞り込み
        </button>
      </form>

      <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: 16, overflowX: "auto" }}>
        {loading ? (
          <div style={{ color: "#888", padding: "12px 0" }}>読み込み中…</div>
        ) : logs.length === 0 ? (
          <div style={{ color: "#888", padding: "12px 0" }}>該当するログはありません</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                <th style={th}>日時</th>
                <th style={th}>操作者</th>
                <th style={th}>種別</th>
                <th style={th}>対象</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <td style={td}>{new Date(log.createdAt).toLocaleString("ja-JP")}</td>
                  <td style={td}>{log.actorName ? `${log.actorName} (${log.actor})` : log.actor}</td>
                  <td style={td}>{ACTION_LABELS[log.action] || log.action}</td>
                  <td style={td}>{formatTarget(log)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
