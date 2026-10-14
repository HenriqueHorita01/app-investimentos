-- Preferências por usuário (uma linha por usuário).
-- Primeiro uso: meta da reserva de emergência, exibida na aba Reserva.
create table preferencias (
  user_id       uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  meta_reserva  numeric(18,2) check (meta_reserva is null or meta_reserva > 0),
  atualizado_em timestamptz not null default now()
);

alter table preferencias enable row level security;

create policy "dono" on preferencias for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
