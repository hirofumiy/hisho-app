-- 秘書室（hisho-app）DBスキーマ
-- Supabase SQL Editor に貼り付けて実行する（Phase 1）。
-- 単一ユーザー（ひろさん）専用。RLSで本人のみアクセス可。

-- ============================================================
-- 1. tasks テーブル
-- ============================================================
create table if not exists public.tasks (
    id              uuid primary key default gen_random_uuid(),
    source          text not null check (source in ('gmail', 'timetree', 'manual')),
    source_id       text not null,
    title           text not null,
    detail          text,
    sender          text,
    priority        text check (priority in ('high', 'mid', 'low')),
    category        text not null check (category in ('recent', 'reminder', 'event', 'manual')),
    task_date       date not null,
    status          text not null default 'open' check (status in ('open', 'done', 'dismissed')),
    handled_at      timestamptz,
    gmail_thread_id text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    -- 同じメール/予定が毎朝再掲されても1行に集約（ステータス保持）
    unique (source, source_id)
);

create index if not exists idx_tasks_status     on public.tasks (status);
create index if not exists idx_tasks_task_date  on public.tasks (task_date);
create index if not exists idx_tasks_category   on public.tasks (category);

-- ============================================================
-- 2. updated_at 自動更新トリガー
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    -- status が done/dismissed に変わった瞬間に handled_at を打刻
    if new.status in ('done', 'dismissed') and (old.status is distinct from new.status) then
        new.handled_at := now();
    end if;
    if new.status = 'open' then
        new.handled_at := null;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
    before update on public.tasks
    for each row execute function public.set_updated_at();

-- ============================================================
-- 3. Row Level Security（本人＝ログイン済ユーザーのみ）
-- ============================================================
alter table public.tasks enable row level security;

-- マジックリンクでログインした認証ユーザーに全操作を許可。
-- 単一ユーザー運用のため owner 列は持たず「認証済みなら可」とする。
-- （第三者は anon キーを知っていても未認証なので一切読めない）
drop policy if exists "authenticated full access" on public.tasks;
create policy "authenticated full access"
    on public.tasks
    for all
    to authenticated
    using (true)
    with check (true);

-- パイプライン（GitHub Actions）は service_role キーを使うため
-- RLS をバイパスして UPSERT 可能（追加ポリシー不要）。

-- ============================================================
-- 4. 動作確認用サンプル（任意・確認後 delete してよい）
-- ============================================================
-- insert into public.tasks (source, source_id, title, detail, category, priority, task_date)
-- values ('manual', gen_random_uuid()::text, 'テストタスク', '動作確認用', 'manual', 'mid', current_date);
