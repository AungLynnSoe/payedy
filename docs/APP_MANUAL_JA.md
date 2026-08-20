**アプリケーション操作マニュアル（`src/app`）**

このドキュメントは Next.js（App Router）プロジェクトの `src/app` 配下のファイル／フォルダの役割、担当処理、他マシンで使う際の注意点、機能追加時に変更すべき箇所をまとめた操作マニュアルです。CSS ファイルは除外しています。初心者にもわかるよう、やさしい日本語・箇条書き中心で説明します。

※このアプリは以前 Firebase / Firestore を使っていましたが、現在は **PostgreSQL（Prisma ORM 経由）** に完全移行済みです。Firebase 関連のパッケージ・設定・環境変数はコードベースから完全に削除されています。本マニュアルは現在の実装（Prisma + PostgreSQL）に合わせて記載しています。

**目次**

- **ルートと共通レイアウト**: `layout.js`, `page.js`, `providers/Providers.jsx`, `error.js`
- **認証関連**: `auth/`（`error/page.jsx`, `redirect/page.jsx`）
- **学生向け画面**: `student/dashboard/*`
- **教員向け画面**: `teacher/dashboard/*`
- **管理画面（簡易）**: `admin/users/page.jsx`
- **API ルート**: `api/*`（重要なエンドポイントの説明）
- **よくある変更点（環境）**
- **コース追加の手順（詳細）**

---

**ルートと共通レイアウト**

- **`layout.js`**: サイト全体のルートレイアウトを定義しています。

  - 目的: すべてのページに共通の HTML 構造（`<html lang="en">` と viewport / charset の meta タグ）を挿入し、`Providers` と `Footer` を配置します。
  - 担当: ページ全体の共通ラッパー（`body className="appRoot"`）とモバイル向け viewport 設定。
  - 他の PC での注意点: 特になし。`Providers` がセッション（NextAuth）を利用するため、認証を正しく動かすには NextAuth / Google OAuth の環境変数が必要。
  - 変更時: 共通のナビゲーションを変える場合はここを編集（例えば `Footer` を差し替える）。

- **`page.js`**: ルート（ホーム）ページのコンポーネント。

  - 目的: 初期画面（`LoginForm` とロゴ・装飾イラスト `WalkingFigures` を表示）を担当。
  - 担当: `LoginForm` を中央に配置し、左右に装飾用の歩くキャラクター（`FIGURES`）を並べているだけのシンプルな構成。
  - 他の PC での注意点: 特になし。
  - 変更時: ホームの文言や初期導線を変えるときに編集。

- **`providers/Providers.jsx`**: アプリ全体で使う React コンテキストをまとめる場所。

  - 目的: `next-auth` の `SessionProvider` と共通 `Header` をラップ。
  - 担当: 認証セッションをページで利用できるようにする。ヘッダの常時表示。
  - 他の PC での注意点: `next-auth` の設定（`authOptions`）に依存するため、Google OAuth のクライアント ID/SECRET と NextAuth 用の環境変数が必要。
  - 変更時: セッションの初期化方法を変えたり、共通コンテキストを追加する場合に編集。

- **`error.js`**: アプリケーションレベルのエラーページ（クライアント側エラーバウンダリ）。
  - 目的: 予期しないエラー発生時に表示される簡易ページ（Next.js App Router が要求する `error.js` の実装）。
  - 担当: エラーメッセージを画面に表示し、「Try again」ボタンで `reset()` を呼ぶか、ページをリロードする。
  - 他の PC での注意点: 特になし。
  - 変更時: エラーメッセージやデザインを変更する場合に編集。

---

**認証関連 (`auth/`)**

- **`auth/error/page.jsx`**

  - 目的: NextAuth のサインイン失敗時に表示するエラーページ。
  - 担当: `error` クエリパラメータを読み取り、`AccessDenied`（所属メール以外でのサインイン拒否）、`CredentialsSignin`（学生番号/パスワード誤り）、`Configuration`、`OAuthAccountNotLinked` などのコードをわかりやすい日本語メッセージにマッピングして表示。
  - 他の PC での注意点: メッセージの文言は自由に編集できます。
  - 変更時: エラーコードの追加対応やリンク先変更はここを編集。

- **`auth/redirect/page.jsx`**
  - 目的: サインイン後にユーザーを適切なダッシュボードへリダイレクトするサーバーコンポーネント。
  - 担当:
    - `getServerSession(authOptions)` を呼び、セッションがなければ `/` にリダイレクト。
    - メールアドレスの学籍番号部分（例: `w24002`）の先頭文字からコースキー（`w`→web, `k`→kokusai, `j`→japanese, `i`→it, `f`→global）を判定し、学籍番号から入学年度・学年（`getEntranceYearFromStudentId` / `getGradeInfo`）を計算。
    - 学年に合ったコース（`prisma.course.findFirst`）を検索し、`prisma.student.upsert` で学生レコードを自動作成・更新する（Firestore ではなく PostgreSQL の `Student` テーブル）。
    - コースの学生数（`students` カウンタ）を実際の登録人数に合わせて `prisma.course.update` で再計算する。
    - 最後に `session.user.role` が `"teacher"` なら `/teacher/dashboard`、それ以外は `/student/dashboard` にリダイレクト。
  - 他の PC での注意点: `authOptions`（`src/app/api/auth/[...nextauth]/route.js`）と `DATABASE_URL`（PostgreSQL 接続文字列）が正しく設定されている必要があります。DB に接続できない場合でもリダイレクト自体は失敗せず（upsert 失敗はログに警告を出すだけで非致命的）、続行します。
  - 変更時: ロールの追加や別の遷移先を追加する場合、コースキーの判定ルールを変える場合はここを編集。

---

**学生向け画面 (`student/dashboard`)**

- **`student/dashboard/page.jsx`**

  - 目的: ログインした学生向けのメインダッシュボード（クライアントコンポーネント）。タブは「概要」「毎月の支払い」「レシートをアップロード」「プロフィール」の4つ。
  - 担当:
    - `/api/students/{studentId}` から自分の学生レコード（PostgreSQL の `Student` テーブル）を取得し、8秒ごとにポーリングして最新化する。
    - `/api/payments?studentId=...` で支払い履歴、`/api/students/{studentId}/discounts` で割引一覧を取得。
    - 初回 Google ログイン時は `PATCH /api/students/{studentId}`（失敗したら `POST /api/students`）を呼び、学生レコードを自動登録・更新する。
    - `courseId` を使って `/api/courses?courseKey=...&year=...` を（学年 EN → JP → フォールバックの順で）呼び、コース情報（学費・月額・`monthlyTemplate` など）を取得して学費・進捗・残額を計算する。
    - 領収書画像はブラウザ側で `canvas` を使って軽量化（JPEG 圧縮）してから base64 に変換し、`POST /api/payments` に送信して保存する（画像は `Payment.receiptBase64` カラムに文字列として保存）。
    - 未払い月を計算し、`POST /api/student/reminder` を呼んでリマインダーメールを送信できる。
  - 他の PC での注意点:
    - Firebase のクライアント設定は不要（すでに撤去済み）。
    - `DATABASE_URL`（PostgreSQL）と NextAuth / Google OAuth の環境変数が必要。DB や API が使えないと学生情報の自動登録・表示が動かない。
  - 変更時: 学生向けの UI を変更する／新しいフィールドを表示する場合はこのファイルと、必要に応じて `components/PaymentSchedule.jsx` などを編集。
  - 補足: コース情報は PostgreSQL の `Course` テーブル（`/api/courses` 経由）を参照して表示を決めるロジックがあり、学年（EN/JP）の判定やフォールバック探索が含まれます。

- **`student/dashboard/[id]/page.jsx`**
  - 目的: パスに `id` を含む場合に表示する学生詳細ページ。教員（または管理者）が他の学生のデータを確認・操作するための画面で、学生本人がアクセスした場合は自分の `studentId` のページへ自動リダイレクトされる。
  - 担当:
    - `routeId`（URL の `id`）をキーに `/api/students/{id}` などから学生情報・支払い・割引・コース情報を読み込む。
    - 教員/管理者（`session.user.role === "teacher"` または `isAdmin`）の場合のみ、支払いの承認（`PATCH /api/payments/{id}` action: `approve`）・却下（`reject`）・承認取り消し（`revert`）、割引の追加（`POST /api/students/{id}/discounts`）、年度移行（`POST /api/admin/migrate-year`）が行える。
    - 学生本人の場合は自分の支払い履歴の閲覧・領収書アップロード・未承認の支払いの削除のみ可能。
  - 他の PC での注意点: `DATABASE_URL` と、教員/管理者ロールを持つアカウントでのサインインが必要（Firebase 認証ではなく NextAuth のセッション情報で権限判定）。
  - 変更時: 学生の編集 UI、割引ロジック、年度移行の挙動を変える場合はここを修正。

---

**教員向け画面 (`teacher/dashboard`)**

- **`teacher/dashboard/page.jsx`**

  - 目的: 教員（管理者）向けのトップダッシュボード。
  - 担当: コース数・支払金合計の統計カード表示、月別 Excel（未払い一覧）ダウンロード（`xlsx` ライブラリ + `/api/admin/stats`）、承認待ち支払い一覧（`/api/payments?status=確認中`）の承認・却下操作、最近のアクティビティ表示。
  - 他の PC での注意点: `DATABASE_URL` が必要。Firestore や Firebase Admin SDK は使用していません。

- **`teacher/dashboard/course/page.jsx`**

  - 目的: コースの一覧表示と新規追加・削除・編集へのリンクを提供する画面（クライアントコンポーネント）。
  - 担当:
    - `GET /api/courses` を10秒おきにポーリングしてコース一覧を表示。
    - 新しいコースを追加するフォーム（モーダル）を提供し、送信すると `POST /api/admin/courses` を呼ぶ（この API がサーバー側で PostgreSQL の `Course` テーブルに `prisma.course.upsert` で書き込む）。
    - `determineCourseKey` で日本語/英語どちらのコース名からも `courseKey` を自動判定する。
    - 削除は `DELETE /api/admin/courses`（`prisma.course.delete`）を呼ぶ。
  - 他の PC での注意点:
    - `DATABASE_URL`（PostgreSQL 接続）が必要。Firestore の書き込み権限やサービスアカウントは不要になりました。
  - 変更時:
    - コース追加時に必要なフィールドを増やしたい場合はここと `prisma/schema.prisma` の `Course` モデルを合わせて編集。
    - 月別テンプレートは `monthlyTemplate`（`Json` 型カラム）として保存されるため、読み取り側（例: 支払い移行 API `api/admin/migrate-year`）も更新が必要。

- **`teacher/dashboard/course/[id]/page.jsx`**（コース詳細ページ）

  - 目的: 特定コースに在籍する学生一覧を表示する。
  - 担当: `GET /api/courses?code=...` でコース情報、`GET /api/admin/users` で全学生を取得し、`courseId` 一致または `courseKey`＋`gradeEN` 一致でそのコースの学生を絞り込んで表示。
  - 変更時: コース詳細の表示項目や検索・フィルタを変えたい場合に編集。

- **`teacher/dashboard/course/[id]/edit/page.jsx`**（コース編集ページ）

  - 目的: 既存コースの内容（名称・学費・月額・学年・月別テンプレート・支払学年）を編集する。
  - 担当: `GET /api/courses?code=...` で現在値を取得し、保存時に `PUT /api/admin/courses` を呼んで更新する。
  - 変更時: 編集可能な項目を増やす場合はフォームと `PUT /api/admin/courses` 側のフィールドを合わせて編集。

- **`teacher/dashboard/payment/page.jsx`**

  - 目的: 全ての支払いを一覧し、コース別・学年別・月別の集計を表示する管理画面。
  - 担当: `GET /api/payments?limit=500` で支払い一覧、`GET /api/admin/users` で学生一覧、`GET /api/courses` でコース一覧を取得し、クライアント側で `lib/paymentAllocation.js` の割当ロジックを使ってコース×学年ごとの予定金額・入金済み・残額、および月別の棒グラフを計算する。
  - 他の PC での注意点: `DATABASE_URL` が必要。大量データを扱う場合は PostgreSQL 側のインデックスやクエリ性能に注意（Firestore の課金は関係ありません）。
  - 変更時: 表示／フィルタの追加はここを修正。

---

**管理画面（簡易）**

- **`admin/users/page.jsx`**
  - 目的: 管理者向けのユーザー一覧・ロール変更・学生のコース変更インターフェース。
  - 担当:
    - `/api/admin/users` と `/api/admin/courses` を呼んで一覧を取得。
    - ドロップダウンで学生の `courseId` を更新し（`POST /api/admin/users`）、ボタンでロール（`student`⇄`teacher`）を切り替える。
  - 他の PC での注意点: `/api/admin/*` の API はサーバー側で Prisma を通じて PostgreSQL に直接アクセスします。Firebase Admin SDK やサービスアカウントは不要です。`DATABASE_URL` のみ必要。
  - 変更時: 管理 UI の列や操作を追加する場合はこのコンポーネントを編集。

---

**API ルート（`src/app/api`）**

- 共通の注意事項（API 全般）:

  - サーバーサイドのデータ読み書きは `src/lib/prisma.js` がエクスポートする `prisma` クライアント（`@prisma/client` + `@prisma/adapter-pg`）経由で PostgreSQL に対して行われます。Firebase Admin SDK（`adminDb` 等）は使用していません。
  - `next-auth` を使う API は `getServerSession(authOptions)` を呼んでおり、`authOptions` は `src/app/api/auth/[...nextauth]/route.js` に定義されています。
  - 一部の古い API（`api/student/profile`, `api/student/payments`）は、`src/data/users.js` / `src/data/payments.js` という **メモリ上（サーバー再起動で消える）のデモ用データ** を参照する古い実装のままで、現行の学生ダッシュボードからは使われていません（実際の学生データ・支払いは `api/students/*` と `api/payments` 経由で PostgreSQL に保存されます）。また `src/data/courses.js` は現在どこからも import されておらず、実装内で参照している `courses` という変数も定義されていないため、呼び出すとエラーになる未使用の死んだコードです。コース関連の実際の永続化は `api/admin/courses` と `api/courses` が Prisma 経由で直接行っています。

- **`api/auth/[...nextauth]/route.js`**

  - 目的: NextAuth による認証プロバイダー（`CredentialsProvider` と `GoogleProvider`）を定義する。
  - 担当:
    - `CredentialsProvider`: `src/data/users.js` のメモリ上シードユーザー（`w24002`/`admin`、パスワードは平文比較）を使ったデモ用ログイン。
    - `GoogleProvider`: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` を使用。`profile()` コールバックで `isAllowedInstitutionEmail()`（`osfl.ac.jp` または `std.it-college.ac.jp` ドメイン、もしくは個別許可リスト）を満たすメールのみ許可し、`createOrGetUserByEmail()`（こちらもメモリ上のシードデータ操作）でロールを決定する。
    - `signIn` コールバックで Google サインイン時に許可ドメイン外のメールを拒否（`AccessDenied`）。
    - `jwt`/`session` コールバックでメールのローカル部分から `studentId` を算出し、セッションに `role` と `studentId` を載せる。
    - `redirect` コールバックで、外部 URL でなければ `/auth/redirect` に遷移させる。
  - 他の PC での注意点:
    - Google OAuth の環境変数（`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`）と `NEXTAUTH_URL`, `NEXTAUTH_SECRET` が必須。
    - Firebase 関連の環境変数・サービスアカウントは一切不要（既に撤去済み）。
    - 学生の実データ（コース・学費など）の自動作成は、このファイルではなく `auth/redirect/page.jsx` が PostgreSQL（`prisma.student.upsert`）に対して行います。
  - 変更時: サインイン時の挙動やコールバック（role メタデータ付与など）を変えたいときに編集。

- **`api/admin/courses/route.js`**

  - 目的: サーバー側のコース一覧取得、新規追加、更新、削除を取り扱う（管理向け API）。
  - 担当:
    - `GET` → `prisma.course.findMany()` で PostgreSQL の `Course` テーブルを全件返す。
    - `POST` → コース名から `code`（例: `web-3rd-year`）と `courseKey` を算出し、`prisma.course.upsert()` で新規作成または更新する。
    - `PUT` → `code` をキーに `prisma.course.update()` で部分更新する。
    - `DELETE` → `prisma.course.delete()` でコースを削除する（存在しない場合は 404）。
  - 他の PC での注意点:
    - `DATABASE_URL` が正しく設定されていれば動作します。Firestore のサービスアカウントやエミュレータは不要です。
  - 変更時: 管理 API の認可や入力バリデーションを強化するならこのファイルを中心に編集。

- **`api/admin/users/route.js`**

  - 目的: ユーザー一覧取得とユーザー情報（role / courseId / name / email）の更新処理。
  - 担当:
    - `GET` → `prisma.student.findMany()` で PostgreSQL の学生を取得し、`src/data/users.js` のメモリ上シードユーザーのうち DB に存在しないものだけをマージして返す（DB 側が優先）。
    - `POST` → まず `prisma.student.update()` で DB 更新を試み、対象学生が DB に存在しない場合（`P2025`）だけメモリ上のシードユーザーを `updateUserRole` / `updateUser` で更新する。
  - 他の PC での注意点: `DATABASE_URL` が必要。Firestore の書き込み権限は不要。
  - 変更時: ユーザー属性を増やす／権限チェックを厳密化する場合は編集。

- **`api/admin/migrate-year/route.js`**

  - 目的: ある学生の前年度（`fromYear`）の未払い残を次年度の支払いスケジュールに振り替える処理。
  - 担当: `prisma.paymentSchedule.findMany()` で対象学生の全スケジュールを読み取り、前年度分の未払い残額を計算し、コースの `monthlyTemplate` または `pricePerMonth` を参考に翌年度12か月分の予定金額を再配分して `prisma.paymentSchedule.upsert()` でまとめて作成・更新する。
  - 他の PC での注意点: 実行は認証済みで、`teacher` ロールまたは `isAdmin` である必要がある（`getServerSession` で判定）。`DATABASE_URL` が必要。Firestore の読み書き権限は不要。
  - 変更時: 年度の計算方法や配分方法を変えるときはこのファイルを修正。

- **`api/teacher/payments/decision/route.js`**

  - 目的: 教員が支払いを「承認」「却下」する操作をサーバー側で受けて支払いレコードを更新する（`teacher/dashboard/course/[id]` などから使われる想定の、`api/payments/[paymentId]` の PATCH と機能が重複する別エンドポイント）。
  - 担当: `prisma.payment.update()` で `paymentId` を条件に `verified` / `status` / `approvedBy` / `approvedAt` または `rejectReason` / `rejectedBy` / `rejectedAt` を書き込む。認可チェックあり（`teacher` ロールまたは `isAdmin` でなければ 403）。
  - 他の PC での注意点: 認証が必須。`DATABASE_URL` が必要。
  - 変更時: 承認ワークフローを拡張する際に編集。

- **`api/student/*`**
  - **`profile/route.js`**: クエリで `email` または `studentId` を渡すと、`src/data/users.js` のメモリ上シードデータからユーザーを検索して返す（GET）。現在の学生ダッシュボードはこの API を呼んでおらず、代わりに `api/students/[studentId]`（PostgreSQL）を使っている点に注意。
  - **`payments/route.js`**: `src/data/payments.js` のメモリ上マップに対して、学生ごとの「支払い済み合計」を取得（GET）／設定（POST）するだけの簡易 API。実際の支払い（レシート・承認状態など）は `api/payments`（PostgreSQL の `Payment` テーブル）で管理されており、こちらは使われていないレガシー API。
  - **`reminder/route.js`**: 未払い月のリマインドメール送信。`nodemailer` を使用し、環境変数 `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `FROM_EMAIL` を参照する。
  - 他の PC での注意点: メール送信は SMTP 情報（`EMAIL_*`）が必要。未設定でも本番以外（`NODE_ENV !== "production"`）ならログ出力にフォールバックする。

- **参考: 実際にデータを保存している主要 API**（学生・教員画面が使っているもの）
  - `api/students/route.js`（`POST`）／`api/students/[studentId]/route.js`（`GET`/`PATCH`/`DELETE`）: `Student` テーブルの作成・取得・更新・削除。
  - `api/students/[studentId]/discounts/route.js`（`GET`/`POST`）: `Discount` テーブル。
  - `api/students/[studentId]/schedules/route.js`（`GET`/`POST`）: `PaymentSchedule` テーブル。
  - `api/payments/route.js`（`GET`/`POST`）、`api/payments/[paymentId]/route.js`（`PATCH`/`DELETE`）: `Payment` テーブル（領収書は `receiptBase64` カラムに文字列で保存）。
  - `api/courses/route.js`（`GET`）: `Course` テーブルを条件検索し、在籍学生数を実カウントして返す。

---

**他のパソコンでこのプロジェクトを使う場合に変更が必要になりやすい点（まとめ）**

- **データベース（PostgreSQL / Prisma）**: `.env` に下記が必要です。
  - `DATABASE_URL`（例: `postgresql://postgres:postgres@localhost:5432/payedu`）
  - 初回セットアップ時は `prisma/schema.prisma` に対して `npx prisma migrate deploy`（または `db push`）を実行し、テーブル（`Student`, `Course`, `Payment`, `PaymentSchedule`, `Discount`）を作成しておく必要があります。
- **Google OAuth（NextAuth）**: `.env.local` に下記が必要です。
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `NEXTAUTH_SECRET`
  - `NEXTAUTH_URL`（例: `http://localhost:3000`）
- **メール（nodemailer、任意）**:
  - `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `FROM_EMAIL`
  - 現在の `.env.local` にはこれらは設定されていません。未設定でも開発環境（`NODE_ENV !== "production"`）ではログ出力にフォールバックしますが、本番運用でリマインダーメールを実際に送るには設定が必須です。
- **Firebase 関連の環境変数は一切不要です**。以前存在した `NEXT_PUBLIC_FIREBASE_*`（クライアント用）や `FIREBASE_SERVICE_ACCOUNT` / `GOOGLE_APPLICATION_CREDENTIALS`（Admin SDK 用）はコードから完全に削除されており、設定しても意味がありません。
- **NextAuth のページ設定**:
  - `authOptions.pages.signIn` は `/`、`authOptions.pages.error` は `/auth/error` に設定されています。カスタムのサインインページを作る場合は該当ルートを用意してください。

---

**コース（"コース"）を追加したい場合 — 詳細手順**

※以下は "新しいコースをアプリに追加する" 時に必要な箇所を初心者向けにまとめたものです。UI 側（教師が追加できる）と API/データ保存の両方を扱います。

1. どの API ファイルを修正／確認するか

- **`src/app/api/admin/courses/route.js`**

  - サーバー経由でコースを追加・編集・削除したい場合、この API が使われます。
  - すでに `POST`（追加、`prisma.course.upsert`）、`PUT`（更新、`prisma.course.update`）、`DELETE`（`prisma.course.delete`）を実装しており、直接 PostgreSQL の `Course` テーブルへ書き込みます。中間の in-memory ストアは経由しません。
  - 変更点例: 新しいコースのフィールド（例: `tuitionByYear` のような複数年学費など）を API 経由でも受け取り保存したい場合は、`POST` / `PUT` 内で `body` から値を取り出し、`prisma.course.upsert` / `update` の `data` に追加してください。あわせて `prisma/schema.prisma` の `Course` モデルにカラムを追加し、`npx prisma migrate dev` でスキーマを反映する必要があります。

- **（参考）`src/data/courses.js`**
  - 開発初期の in-memory 実装の名残です。現在は内部の `courses` Map の定義がコメントアウトされたまま残っており、他のどこからも import されていない未使用ファイルです。コース追加・編集の実処理には一切関与しません（削除しても現行の動作に影響しません）。

2. どの画面ファイルを修正するか（追加・編集 UI）

- **`src/app/teacher/dashboard/course/page.jsx`**

  - ここにコース追加フォーム（モーダル）があり、フォームを送信すると `fetch("/api/admin/courses", { method: "POST" })` を呼びます（Firestore の `addDoc` ではありません）。
  - 新しい項目（例: `tuitionByYear` や追加の学費フィールド）を UI から入力させたい場合は：
    - モーダルのフォームに入力欄を追加する
    - `POST` する `body`（payload）に新しいフィールドを含める
    - コースの編集は同じ画面ではなく `src/app/teacher/dashboard/course/[id]/edit/page.jsx` が担当しており、こちらも `PUT /api/admin/courses` に合わせて更新が必要

- **`src/app/admin/users/page.jsx`**（管理画面）

  - 管理画面のコース選択ドロップダウンは `fetch("/api/admin/courses")` を使っているので、`api/admin/courses` を更新した場合はここで取得されるデータの形に合わせる。

- **学生画面の表示（必要に応じて）**
  - `src/app/student/dashboard/page.jsx` と `src/app/student/dashboard/[id]/page.jsx` は `/api/courses`（`Course` テーブルを条件検索する API）を参照して学費や月額を計算します。
  - 新しいフィールド（例: `monthlyTemplate` や `pricePerMonth`）をコースに追加した場合、これらのページ内で該当フィールドを読み取るロジックを追加／調整してください（`fetchCourse` ロジック）。

3. データ保存の注意（Prisma スキーマ）

- コースの永続化は `prisma/schema.prisma` の `Course` モデルで定義されています。主なカラムは以下の通りです。
  - `code`（一意キー、例: `web-3rd-year`）, `name`, `nameJa`, `nameEn`, `tuition`, `courseKey`, `year`, `pricePerMonth`, `fee`, `monthlyTemplate`（`Json`）, `paymentAcademicYear`, `students`（在籍数カウンタ）
- 教員画面（`teacher/dashboard/course/page.jsx`）は `POST /api/admin/courses` を呼ぶだけで、実際の書き込みはすべてサーバー側の `api/admin/courses/route.js` が `prisma.course.upsert()` で行います。二重管理される in-memory ストアは存在しません。
- カラムを追加・変更した場合は `prisma/schema.prisma` を編集した後、`npx prisma migrate dev`（開発環境）または `npx prisma migrate deploy`（本番環境）でマイグレーションを実行し、`npx prisma generate` で Prisma Client を再生成してください。

4. 関連箇所（複数ファイル）

- UI（追加）: `src/app/teacher/dashboard/course/page.jsx`（必須）
- UI（編集）: `src/app/teacher/dashboard/course/[id]/edit/page.jsx`
- UI（詳細/在籍学生表示）: `src/app/teacher/dashboard/course/[id]/page.jsx`
- 学生表示: `src/app/student/dashboard/page.jsx` と `src/app/student/dashboard/[id]/page.jsx`（学費表示に影響するため必須で確認）
- 管理 API: `src/app/api/admin/courses/route.js`（追加・更新・削除）、`src/app/api/courses/route.js`（検索・一覧取得）
- データモデル: `prisma/schema.prisma` の `Course` モデル

---

**開発時のよくあるトラブルと対処**

- PostgreSQL に接続できない／`DATABASE_URL` エラーが出る
  - `.env` の `DATABASE_URL` が正しいか、PostgreSQL サーバーが起動しているかを確認してください。`src/lib/prisma.js` は `@prisma/adapter-pg` 経由で接続します。
- Prisma のクエリでエラーが出る（例: カラムが存在しない、`P2025` など）
  - `prisma/schema.prisma` を編集した後に `npx prisma migrate dev` / `npx prisma generate` を忘れていないか確認してください。`P2025` は「対象レコードが見つからない」エラーです。
- Google ログインが動かない
  - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` を `.env.local` に設定し、NextAuth の `NEXTAUTH_URL` / `NEXTAUTH_SECRET` も正しく設定してください。
  - 所属メール（`osfl.ac.jp` または `std.it-college.ac.jp`）以外でログインしようとすると `AccessDenied` になります（`src/data/users.js` の `isAllowedInstitutionEmail`）。
- メール送信が失敗する
  - `EMAIL_*` の環境変数を確認。開発環境（`NODE_ENV !== "production"`）では未設定でもログ出力にフォールバックします。
- コース名を日本語で追加したが学生画面で反映されない
  - 学生画面は `courseKey` と学年（EN/JP）でコースを検索しています。`courseKey` は `determineCourseKey`（コース画面側）や `slugify`（`api/admin/courses/route.js`）で自動生成されるため、`nameJa` / `nameEn` を追加したら `courseKey` のルールに合わせるか、学生画面のフォールバックロジックを更新してください。

---

**最後に（次に何をするか）**

- 小さな変更なら該当のページコンポーネント（例: `teacher/dashboard/course/page.jsx`）だけ編集すれば済みます。
- サーバー側の一貫性を保つため、保存するフィールドを増やす場合は `prisma/schema.prisma`、API（`api/admin/courses/route.js` など）、学生画面（`student/dashboard/*`）の三か所を合わせて修正することをおすすめします。

---

このファイルは `docs/APP_MANUAL_JA.md` としてプロジェクト内に保存しました。追加で別の形式（PDF、スライド）や、もっと細かいファイル行単位の説明が必要であれば教えてください。
