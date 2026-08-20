"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import styles from "./page.module.css";
import receiptStyles from "@/components/ReceiptList.module.css";
import PaymentSchedule from "@/components/PaymentSchedule";
import { getAcademicYear, getGradeInfo } from "@/lib/academicYear";
import { useParams, useRouter } from "next/navigation";

export default function StudentDashboardIdPage() {
  const { data: session, status } = useSession();
  const params = useParams();
  const routeId = params?.id;
  const router = useRouter();

  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [courseInfo, setCourseInfo] = useState(null);
  const [computedTuition, setComputedTuition] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [amount, setAmount] = useState("");
  const [receiptMonth, setReceiptMonth] = useState("");
  const [payments, setPayments] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [prevYearRemaining, setPrevYearRemaining] = useState(null);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [migrating, setMigrating] = useState(false);
  const [newReason, setNewReason] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [isTeacher, setIsTeacher] = useState(false);

  const getStudentId = () =>
    routeId ||
    session?.user?.studentId ||
    String(session?.user?.email || "").split("@")[0];

  const fetchStudent = useCallback(async () => {
    const sid = getStudentId();
    if (!sid) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/students/${sid}`);
      if (res.ok) setStudent(await res.json());
      else setStudent(null);
    } catch (e) { setStudent(null); }
    finally { setLoading(false); }
  }, [routeId, session]);

  const fetchPayments = useCallback(async () => {
    const sid = getStudentId();
    if (!sid) return;
    try {
      const res = await fetch(`/api/payments?studentId=${sid}&orderBy=createdAt`);
      if (res.ok) setPayments(await res.json());
    } catch (e) { /* ignore */ }
  }, [routeId, session]);

  const fetchDiscounts = useCallback(async () => {
    const sid = getStudentId();
    if (!sid) return;
    try {
      const res = await fetch(`/api/students/${sid}/discounts`);
      if (res.ok) setDiscounts(await res.json());
    } catch (e) { /* ignore */ }
  }, [routeId, session]);

  useEffect(() => {
    if (status === "unauthenticated") { setLoading(false); return; }
    if (status !== "authenticated") return;

    const role = session?.user?.role;
    const isTeacherUser = role === "teacher" || session?.user?.isAdmin;
    setIsTeacher(isTeacherUser);

    // 学生は自分のページ以外にアクセスできない
    if (!isTeacherUser && routeId) {
      const ownId = session?.user?.studentId || String(session?.user?.email || "").split("@")[0].toLowerCase();
      if (ownId && ownId !== routeId) {
        router.replace(`/student/dashboard/${ownId}`);
        return;
      }
    }

    fetchStudent();
    fetchPayments();
    fetchDiscounts();
    const interval = setInterval(() => { fetchStudent(); fetchPayments(); fetchDiscounts(); }, 10000);
    return () => clearInterval(interval);
  }, [fetchStudent, fetchPayments, fetchDiscounts, status]);

  useEffect(() => {
    if (!student?.courseId) { setCourseInfo(null); setComputedTuition(null); return; }
    (async () => {
      try {
        const gradeEN = student.gradeEN || null;
        const gradeJP = student.gradeJP || null;
        // courseKey ("web") is used for filtering, courseId may be the full code ("web-3rd-year")
        const ck = student.courseKey || student.courseId;
        const queries = [
          `/api/courses?code=${encodeURIComponent(student.courseId)}`,
          gradeEN ? `/api/courses?courseKey=${encodeURIComponent(ck)}&year=${encodeURIComponent(gradeEN)}` : null,
          gradeJP ? `/api/courses?courseKey=${encodeURIComponent(ck)}&year=${encodeURIComponent(gradeJP)}` : null,
          `/api/courses?courseKey=${encodeURIComponent(ck)}`,
        ].filter(Boolean);
        for (const url of queries) {
          const res = await fetch(url);
          if (res.ok) {
            const list = await res.json();
            if (list.length) {
              const c = list[0];
              setCourseInfo({ id: c.id || c.code, name: c.name || "未設定", pricePerMonth: Number(c.pricePerMonth) || null, totalFee: Number(c.fee) || Number(c.tuition) || null, year: c.year, monthlyTemplate: c.monthlyTemplate, paymentAcademicYear: c.paymentAcademicYear });
              setComputedTuition(Number(c.fee) || Number(c.tuition) || Number(c.pricePerMonth) || null);
              return;
            }
          }
        }
        setCourseInfo(null); setComputedTuition(null);
      } catch (e) { setCourseInfo(null); setComputedTuition(null); }
    })();
  }, [student?.courseId, student?.grade, student?.gradeJP]);

  useEffect(() => {
    if (!student?.studentId) return;
    let mounted = true;
    (async () => {
      try {
        const today = new Date();
        const academicYear = getAcademicYear(today);
        const code = parseInt(String(student.studentId).slice(1, 3), 10);
        let ey = 2000 + (Number.isFinite(code) ? code : 0);
        if (ey > academicYear) ey -= 100;
        const { gradeNum } = getGradeInfo(student.entranceYear || ey, today);
        if (gradeNum < 2) { if (mounted) setPrevYearRemaining(0); return; }
        const res = await fetch(`/api/students/${student.studentId}/schedules`);
        if (!res.ok || !mounted) return;
        const docs = await res.json();
        const prev = academicYear - 1;
        const prevDocs = docs.filter((d) => typeof d.month === "string" && d.month.startsWith(`${prev}-`));
        const due = prevDocs.reduce((s, d) => s + (Number(d.dueAmount) || 0), 0);
        const paid = prevDocs.reduce((s, d) => s + (Number(d.paidAmount) || 0), 0);
        if (mounted) setPrevYearRemaining(Math.max(due - paid, 0));
      } catch (e) { if (mounted) setPrevYearRemaining(null); }
    })();
    return () => { mounted = false; };
  }, [student?.studentId, student?.entranceYear]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setLightboxSrc(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleReceiptUpload = async (targetMonth) => {
    if (!targetMonth) return alert("対象月を選択してください。");
    if (!file || !student) return alert("ファイルを選択してください。");
    const numericAmount = Number(String(amount).replace(/[^0-9.-]/g, ""));
    if (!numericAmount || numericAmount <= 0) return alert("有効な金額を入力してください");
    setUploading(true);
    try {
      const toBase64 = (f) => new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(f);
      });
      const base64Data = await toBase64(file);
      const res = await fetch("/api/payments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.studentId, course: student.courseId || "未設定", receiptBase64: base64Data, amount: numericAmount, paymentMethod: "銀行振込", status: "支払い済み", month: targetMonth || student.startMonth || new Date().toISOString().slice(0, 7) }),
      });
      if (!res.ok) throw new Error("upload failed");
      alert("支払い情報を保存しました！");
      setFile(null); setAmount(""); setPreviewUrl(null);
      fetchPayments();
    } catch (err) { alert("アップロードに失敗しました。"); }
    finally { setUploading(false); }
  };

  const handleDeletePayment = async (paymentId) => {
    if (!paymentId || !confirm("この支払い履歴を削除してもよろしいですか？")) return;
    const res = await fetch(`/api/payments/${paymentId}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setPayments((prev) => prev.filter((p) => (p.paymentId || p.id) !== paymentId));
    else alert("削除に失敗しました。");
  };

  const handleApprovePayment = async (paymentId) => {
    const res = await fetch(`/api/payments/${paymentId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", approvedBy: { name: session?.user?.name, email: session?.user?.email } }),
    }).catch(() => null);
    if (res?.ok) fetchPayments();
    else alert("承認に失敗しました。");
  };

  const handleRejectPayment = async (paymentId) => {
    const reason = prompt("却下理由を入力してください（省略可）");
    if (reason === null) return;
    const res = await fetch(`/api/payments/${paymentId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", rejectReason: reason, rejectedBy: { name: session?.user?.name, email: session?.user?.email } }),
    }).catch(() => null);
    if (res?.ok) fetchPayments();
    else alert("却下に失敗しました。");
  };

  const handleRevertPayment = async (paymentId) => {
    if (!confirm("この承認を取り消して「確認中」に戻しますか？")) return;
    const res = await fetch(`/api/payments/${paymentId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revert" }),
    }).catch(() => null);
    if (res?.ok) fetchPayments();
    else alert("取り消しに失敗しました。");
  };

  const handleAddDiscount = async () => {
    if (!student?.studentId) return alert("学生情報が見つかりません。");
    const reason = String(newReason || "").trim();
    const amountNum = Number(newAmount);
    if (!reason) return alert("割引理由を入力してください。");
    if (isNaN(amountNum) || amountNum < 0) return alert("割引額は正の数値で入力してください。");
    if (discounts.length >= 5) return alert("割引レコードは最大5件です。");
    try {
      const res = await fetch(`/api/students/${student.studentId}/discounts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountNum, reason }),
      });
      if (!res.ok) throw new Error();
      setNewReason(""); setNewAmount("");
      fetchDiscounts();
    } catch (e) { alert("割引追加に失敗しました。"); }
  };

  const handleMigrateYear = async () => {
    if (!student?.studentId) return alert("学生情報が見つかりません。");
    if (!confirm("未払い残高を次年度に移行します。実行してよろしいですか？")) return;
    const defaultFrom = new Date().getFullYear() - 1;
    const raw = prompt(`移行元の年を入力してください（例: ${defaultFrom}）。`, String(defaultFrom));
    const fromYear = raw ? Number(raw) : defaultFrom;
    if (!fromYear || isNaN(fromYear)) return alert("有効な年を入力してください。");
    try {
      setMigrating(true);
      const res = await fetch("/api/admin/migrate-year", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.studentId, fromYear }),
      });
      const data = await res.json();
      if (data.migrated) alert(`移行完了: ${data.addedAmount} 円を移行しました。`);
      else alert(`移行なし: ${data.reason || "未払い残高なし"}`);
    } catch (e) { alert("移行に失敗しました。"); }
    finally { setMigrating(false); }
  };

  if (status === "unauthenticated") return <div className={styles.center}><h2>サインインしてください</h2><button onClick={() => signIn()}>サインイン</button></div>;

  const baseTotal = Number(courseInfo?.totalFee ?? courseInfo?.pricePerMonth ?? computedTuition ?? student?.totalFees ?? 0);
  const totalDiscount = discounts.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const total = Math.max(baseTotal - totalDiscount, 0);
  const paid = payments.filter((p) => p.verified === true).reduce((s, p) => s + (Number(p.amount) || 0), 0) || Number(student?.paidAmount || 0);
  const remaining = Math.max(total - paid + (prevYearRemaining || 0), 0);
  const progress = total ? Math.min((paid / total) * 100, 100) : 0;

  return (
    <main className={styles.container}>
      <header className={styles.tabs}>
        {["overview","history","upload","profile"].map((tab) => (
          <button key={tab} className={`${styles.tab} ${activeTab === tab ? styles.active : ""}`} onClick={() => setActiveTab(tab)}>
            {tab === "overview" ? "概要" : tab === "history" ? "毎月の支払い" : tab === "upload" ? "レシートをアップロード" : "プロフィール"}
          </button>
        ))}
      </header>

      {activeTab === "overview" && (
        <div className={styles.overviewWrap}>
          {/* Profile header */}
          <section className={styles.card}>
            <div className={styles.profileHeader}>
              <div className={styles.avatarCircle}>
                {(student?.name || session?.user?.name || "?").charAt(0).toUpperCase()}
              </div>
              <div className={styles.profileHeaderInfo}>
                <div className={styles.profileHeaderName}>{student?.name || session?.user?.name || "未設定"}</div>
                <div className={styles.profileHeaderMeta}>
                  <span>{student?.studentId || routeId}</span>
                  <span className={styles.dot}>·</span>
                  <span>{courseInfo?.name ?? student?.courseKey ?? "未設定"}</span>
                  {student?.gradeJP && <><span className={styles.dot}>·</span><span>{student.gradeJP}</span></>}
                </div>
              </div>
            </div>
          </section>

          {/* Progress + Stats */}
          <section className={styles.card}>
            <div className={styles["progress-row"]}>
              <span className={styles.label}>支払い進捗</span>
              <span className={styles.percent}>{progress.toFixed(1)}%</span>
            </div>
            <div className={styles["progress-wrap"]}>
              <div className={styles["progress-bar"]} style={{ width: `${progress}%` }} />
            </div>
            <div className={styles.stats}>
              <article className={styles.stat}>
                <div className={styles["stat-label"]}>総学費</div>
                <div className={styles["stat-value"]}>{total.toLocaleString()}円</div>
              </article>
              <article className={styles.stat}>
                <div className={styles["stat-label"]}>支払い済み</div>
                <div className={`${styles["stat-value"]} ${styles.paid}`}>{paid.toLocaleString()}円</div>
              </article>
              <article className={styles.stat}>
                <div className={styles["stat-label"]}>残り</div>
                <div className={`${styles["stat-value"]} ${styles.remain}`}>{remaining.toLocaleString()}円</div>
              </article>
            </div>
          </section>

          {/* Teacher: discount panel */}
          {isTeacher && (
            <section className={styles.card}>
              <h3 className={styles.sectionTitle}>割引管理</h3>
              {discounts.length > 0 && (
                <div className={styles.discountListBox}>
                  {discounts.map((d) => (
                    <div key={d.id} className={styles.discountItem}>
                      <span className={styles.discountReason}>{d.reason}</span>
                      <span className={styles.discountAmt}>−¥{Number(d.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.discountForm}>
                <input className={styles.discountInput} type="text" placeholder="割引理由" value={newReason} onChange={(e) => setNewReason(e.target.value)} />
                <input className={styles.discountAmount} type="number" placeholder="金額" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} />
                <button className={styles.discountSave} onClick={handleAddDiscount}>追加</button>
              </div>
              <button className={styles.migrateBtn} onClick={handleMigrateYear} disabled={migrating}>
                {migrating ? "移行中..." : "年度移行"}
              </button>
            </section>
          )}

          {/* Payment history */}
          <section className={styles.card}>
            <h3 className={styles.sectionTitle}>支払い履歴</h3>
            {payments.length === 0 ? (
              <p className={styles.emptyMsg}>支払い履歴がありません</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.paymentTable}>
                  <thead>
                    <tr><th>日付</th><th>金額</th><th>方法</th><th>状態</th><th>領収書</th></tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => {
                      const date = p.createdAt ? new Date(p.createdAt) : new Date();
                      const pid = p.paymentId || p.id;
                      const statusCls = p.verified ? styles.badgeApproved : p.status === "却下" ? styles.badgeRejected : styles.badgePending;
                      const statusLabel = p.verified ? "承認済み" : p.status === "却下" ? "却下" : "確認中";
                      return (
                        <tr key={pid}>
                          <td data-label="日付">
                            <div className={styles.dateCell}>
                              <span>{date.toLocaleDateString("ja-JP")}</span>
                              <span className={styles.timeText}>{date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                          </td>
                          <td className={styles.amountCell} data-label="金額">¥{Number(p.amount).toLocaleString()}</td>
                          <td data-label="方法">{p.paymentMethod || "-"}</td>
                          <td data-label="状態">
                            <span className={`${styles.statusBadge} ${statusCls}`}>{statusLabel}</span>
                            {p.rejectReason && <div className={styles.rejectReason}>{p.rejectReason}</div>}
                          </td>
                          <td data-label="領収書">
                            <div className={styles.paymentAction}>
                              {p.receiptBase64
                                ? <img src={p.receiptBase64} alt="receipt" className={receiptStyles.thumb} onClick={() => setLightboxSrc(p.receiptBase64)} />
                                : <span className={styles.noImg}>なし</span>}
                              {isTeacher && !p.verified && p.status !== "却下" && (
                                <>
                                  <button className={styles.approveBtn} onClick={() => handleApprovePayment(pid)}>承認</button>
                                  <button className={styles.rejectBtn} onClick={() => handleRejectPayment(pid)}>却下</button>
                                </>
                              )}
                              {isTeacher && p.verified && (
                                <button className={styles.revertBtn} onClick={() => handleRevertPayment(pid)}>却下に戻す</button>
                              )}
                              {!isTeacher && !p.verified && p.status !== "却下" && (
                                <button className={styles.deleteBtn} onClick={() => handleDeletePayment(pid)}>削除</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {lightboxSrc && (
            <div className={receiptStyles.modal} onClick={() => setLightboxSrc(null)}>
              <div className={receiptStyles.modalContent} onClick={(e) => e.stopPropagation()}>
                <button className={receiptStyles.closeBtn} onClick={() => setLightboxSrc(null)}>×</button>
                <img src={lightboxSrc} alt="receipt-large" className={receiptStyles.modalImage} />
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "history" && (
        <section className={styles.card}>
          <PaymentSchedule student={student} courseInfo={courseInfo} payments={payments} />
        </section>
      )}

      {activeTab === "upload" && (
        <section className={styles.uploadSection}>
          <h2 className={styles.uploadTitle}>領収書アップロード</h2>
          <p className={styles.uploadSubtitle}>支払いの証明として領収書画像を提出してください</p>
          <div className={styles.uploadForm}>
            <div className={styles.uploadField}>
              <span className={styles.uploadLabel}>対象月</span>
              <input
                type="month"
                className={styles.uploadInput}
                value={receiptMonth}
                onChange={(e) => setReceiptMonth(e.target.value)}
              />
            </div>
            <div className={styles.uploadField}>
              <span className={styles.uploadLabel}>支払い金額（円）</span>
              <input
                type="number"
                className={styles.uploadInput}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="例: 86000"
                min="0"
              />
            </div>
            <div className={styles.uploadField}>
              <span className={styles.uploadLabel}>領収書画像</span>
              <label className={styles.uploadFileLabel}>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    setFile(f);
                    setPreviewUrl(f ? URL.createObjectURL(f) : null);
                  }}
                />
                {previewUrl ? (
                  <div className={styles.uploadPreview}>
                    <img src={previewUrl} alt="preview" className={styles.uploadPreviewImg} />
                    <span className={styles.uploadPreviewName}>{file?.name}</span>
                    <span className={styles.uploadPreviewChange}>クリックして変更</span>
                  </div>
                ) : (
                  <div className={styles.uploadDropArea}>
                    <span className={styles.uploadDropIcon}>📎</span>
                    <span className={styles.uploadDropText}>クリックしてファイルを選択</span>
                    <span className={styles.uploadDropHint}>JPG・PNG・GIF 対応</span>
                  </div>
                )}
              </label>
            </div>
            <div className={styles.uploadBtnWrap}>
              <button
                className={styles.uploadBtn}
                onClick={() => handleReceiptUpload(receiptMonth || undefined)}
                disabled={uploading || !file || !amount || !receiptMonth}
              >
                {uploading ? "アップロード中..." : "送信する"}
              </button>
            </div>
          </div>
        </section>
      )}

      {activeTab === "profile" && (
        <section className={styles.card}>
          <div className={styles.profilePageWrap}>
            <div className={styles.profilePageAvatar}>
              {session?.user?.image
                ? <img src={session.user.image} alt="avatar" className={styles.profilePageImg} referrerPolicy="no-referrer" />
                : <span>{(student?.name || session?.user?.name || "?").charAt(0).toUpperCase()}</span>
              }
            </div>
            <div className={styles.profilePageName}>{student?.name || session?.user?.name || "未設定"}</div>
            <div className={styles.profileGrid}>
              {[
                { label: "メールアドレス", value: student?.email || session?.user?.email || "-" },
                { label: "学籍番号", value: student?.studentId || routeId || "未登録" },
                { label: "コース", value: courseInfo?.name ?? student?.courseKey ?? "未設定" },
                { label: "学年", value: student?.gradeJP || "-" },
                { label: "入学年", value: student?.entranceYear ? `${student.entranceYear}年` : "-" },
              ].map(({ label, value }) => (
                <div key={label} className={styles.profileGridItem}>
                  <span className={styles.profileGridLabel}>{label}</span>
                  <span className={styles.profileGridValue}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
