# 秘書室（hisho-app）

楓の朝レポートで挙がった「やること」を、ひろさんが**対応した／していない**でチェック管理し、
その結果を**翌朝以降の楓LINE通知にも反映**する個人用 PWA。

- **形態**：PWA（Safari →「ホーム画面に追加」。App Store審査不要・無料）
- **バックエンド**：秘書室専用の新規 Supabase プロジェクト（無料枠）
- **追跡対象**：① 楓が拾うGmail返信タスク ② TimeTreeの今日の予定 ③ 手動追加タスク
- **担当**：テック部（桐生部長／香坂課長＝バックエンド・パイプライン連携／月城課長＝PWA UI）

---

## 全体アーキテクチャ（発想の逆転）

「LINEの受信メッセージを読み取る」のは技術的に困難なため、**同じ元データを共有DBに書き出して全員がそこを見る**設計にする。

```
[GitHub Actions cron 毎朝08:00]
   kaede-morning-report / src/main.py
        │  TimeTree取得 + Gmail取得 + 楓要約
        ├─────────────► LINE通知（従来どおり）
        │
        └─────────────► Supabase「tasks」テーブルに構造化UPSERT  ★新規
                              ▲                    │
                              │ チェック結果保存    │ 未対応/対応済を読む
                              │                    ▼
        [秘書室 PWA] ◄────────┘          [翌朝レポートに反映]
        ・タスク一覧表示                  「未対応◯件・対応済◯件・本日新規◯件」
        ・対応済/未対応をタップでチェック
        ・手動タスク追加
```

### ポイント
- 朝レポートのパイプラインが、LINE送信と**同時に**タスクをDBへUPSERT（重複排除付き）
- アプリはそのDBを読み、チェック状態を書き戻す
- 翌朝の `main.py` はDBの未対応タスクを読み、レポート冒頭に「持ち越し」を表示
- ひろさんから見える内容はLINEと完全一致（同じ元データだから）

---

## データモデル（tasks テーブル）

| カラム | 型 | 説明 |
|---|---|---|
| `id` | uuid (PK) | 自動採番 |
| `source` | text | `gmail` / `timetree` / `manual` |
| `source_id` | text | Gmail message id ・ TimeTree event id ・ 手動はuuid（重複排除キー） |
| `title` | text | 件名 / 予定名 / 手動タイトル |
| `detail` | text | 要約スニペット / 楓コメント / メモ |
| `sender` | text | 差出人（Gmailのみ） |
| `priority` | text | `high`🔴 / `mid`🟡 / `low` / null |
| `category` | text | `recent`（直近7日）/ `reminder`（8-30日）/ `event`（予定）/ `manual` |
| `task_date` | date | レポートに載った日（JST） |
| `status` | text | `open`（未対応）/ `done`（対応済）/ `dismissed`（対象外）。既定 `open` |
| `handled_at` | timestamptz | チェックした時刻 |
| `gmail_thread_id` | text | スレッドへの導線用（Gmailのみ） |
| `created_at` | timestamptz | 既定 now() |
| `updated_at` | timestamptz | 更新時刻 |

- **重複排除**：`UNIQUE(source, source_id)`。毎朝同じメールが再掲されても1行に集約され、`status` は保持される（＝対応済にした項目が翌日また「未対応」で復活しない）
- 翌朝レポート反映：`status='open'` かつ `category in ('recent','reminder')` を「持ち越し」として表示

---

## セキュリティ方針（個人用・単一ユーザー）

- **RLS（Row Level Security）有効**
- **PWA**：Supabase Auth のマジックリンク（ひろさんのGmailにワンタップログイン）。`anon` キーのみ公開、RLSで本人以外アクセス不可
- **パイプライン**：`service_role` キー（GitHub Secrets に格納）でRLSをバイパスしてUPSERT
- anon キーがPWAソースに出ても、RLSがあるので第三者はデータを読めない

---

## フェーズ計画

| Phase | 内容 | 担当 | 状態 |
|---|---|---|---|
| 0 | 設計書・DBスキーマ（本書＋schema.sql） | 香坂 | ✅ |
| 3 | **PWA本体**（一覧・チェック・手動追加・ホーム画面追加）※Hallmark適用・デモモード動作確認済 | 月城 | ✅ |
| 1 | Supabase作成・スキーマ適用・キー配線・接続確認 | ひろさん＋楓 | ✅ |
| 2 | パイプライン連携（main.pyがtasksへUPSERT・対応済を保持・過去予定整頓） | 香坂 | ✅ |
| 4 | 翌朝レポートへの反映（未対応/対応済サマリ＋持ち越し） | 香坂 | ⏳ |
| 5 | 通し動作確認・微調整 | 桐生 | ⏳ |

> Phase 3 を先行実装済み。Supabaseの鍵が未設定のうちは **デモモード**（サンプルタスクで一覧・チェック・手動追加が動作。チェックはこの端末のlocalStorageに保存）。`app/config.js` に Project URL と anon key を入れると本番Supabaseへ自動切替。

---

## 動かし方

### ローカルで開く（PC確認）
```bash
cd hisho-app/app
python3 -m http.server 8787
# ブラウザで http://localhost:8787/
```

### iPhoneのホーム画面に追加（本番運用）
PWAは https で配信する必要がある（ホーム画面追加・Service Worker・マジックリンクのため）。配信は下記のいずれか（無料・Phase 1の後に楓が案内）：
- GitHub Pages（このリポジトリを公開）／ Cloudflare Pages ／ Vercel いずれも無料枠
1. 配信URLをiPhoneのSafariで開く
2. 共有ボタン →「ホーム画面に追加」→「秘書室」アイコンが追加される
3. アイコンから起動するとフルスクリーンのアプリとして動く

### 本番ログイン（マジックリンク）を有効化する一手間
本番モードはセキュリティのためログインが必要（anonキーは公開されるがRLSでデータを保護）。ログインを通すには Supabase 側で**リダイレクトURLの許可**が要る：
- Supabase → Authentication → URL Configuration
  - **Site URL** / **Redirect URLs** に、アプリを開くURLを追加
    - ローカル確認：`http://localhost:8787`
    - 本番配信後：そのURL（GitHub Pages等）
- デモで使い続けたいときは URL 末尾に `#demo` を付けて開く

### 接続情報
- Supabase URL：`https://ynyibgkheatayvxvhcpp.supabase.co`
- anonキー：`app/config.js` に配線済（公開可・RLSで保護）
- service_roleキー：`kaede-morning-report` の GitHub Secrets（`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`）に登録済（Phase 2用）

### 構成ファイル（`app/`）
| ファイル | 役割 |
|---|---|
| `index.html` | 画面構造 |
| `app.css` / `tokens.css` | デザイン（Hallmark・桜テーマ・ダークモード対応） |
| `app.js` | データ取得・チェック・手動追加（デモ/本番自動切替） |
| `config.js` | Supabase URL / anon key（**ここに鍵を入れる**） |
| `manifest.webmanifest` / `service-worker.js` | PWA（ホーム画面追加・オフライン起動） |
| `icon.svg` / `icon-maskable.svg` | アプリアイコン（🌸） |

---

## コスト

- Supabase：無料枠内（行数・帯域とも極小）。キープアライブ運用ノウハウは既存資産を流用
- GitHub Actions：既存ジョブに数百msのDB書込が増えるのみ
- Apple Developer：**不要**（PWAのため）
- 追加課金：**なし**（AI独断発注禁止条項にも抵触しない）
