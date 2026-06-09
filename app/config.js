/* 秘書室 設定ファイル
 * ────────────────────────────────────────────────
 * Supabaseの鍵が揃ったら、下記2つを実際の値に書き換えてください。
 * （Supabase ダッシュボード → Settings → API）
 *
 *   SUPABASE_URL      … Project URL（https://xxxx.supabase.co）
 *   SUPABASE_ANON_KEY … anon public key
 *
 * 未設定（__で始まる）のうちは「デモモード」で動きます。
 */
window.HISHO_CONFIG = {
  SUPABASE_URL: "https://ynyibgkheatayvxvhcpp.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlueWliZ2toZWF0YXl2eHZoY3BwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5ODA0NTcsImV4cCI6MjA5NjU1NjQ1N30.qXVtUO3ByoY4iHmKZtqSlrWkzy8MRt3G7puViH_MzjU",
};

/* デモモードに切り替えたいとき：URL末尾に #demo を付けて開く（例 …/index.html#demo）。
 * 本番接続を確認したいときは通常どおり開く（ログイン画面が出ます）。*/
