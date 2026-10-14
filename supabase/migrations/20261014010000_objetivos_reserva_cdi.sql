-- Objetivos por lançamento, reserva de emergência e CDI automático.
-- Ver SPEC.md §1, §4 e §9 (decisões de 14/10/2026).

-- ============ Reserva de emergência ============
-- O ativo inteiro é marcado como reserva: fica fora do patrimônio e da Carteira,
-- e aparece só na aba Reserva.
alter table ativos
  add column finalidade text not null default 'investimento'
  check (finalidade in ('investimento', 'reserva_emergencia'));

-- ============ Destino do lançamento ============
-- Cada aporte/resgate pode pertencer a um objetivo. O que é de um objetivo fica
-- "reservado": conta como investimento, mas não como patrimônio livre, e o
-- rendimento daquela parte vai para o objetivo. Excluir o objetivo (ou trocar o
-- destino do lançamento) devolve o dinheiro para o livre.
-- Substitui, para o front, o modelo de valor fixo da tabela `alocacoes`.
alter table movimentacoes
  add column objetivo_id uuid references objetivos(id) on delete set null;
create index on movimentacoes (objetivo_id);

-- ============ CDI diário automático ============
-- A Edge Function `atualizar-cdi` busca a série 12 do BCB e grava em cdi_diario.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- 09:30 e 21:30 (horário de Brasília), todos os dias. O BCB publica o CDI do dia
-- útil anterior pela manhã; a segunda execução cobre atrasos.
select cron.schedule(
  'atualizar-cdi',
  '30 12,0 * * *',
  $$ select net.http_post(
       url := 'https://xqxiqqqqqeudesyzihju.supabase.co/functions/v1/atualizar-cdi',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb,
       timeout_milliseconds := 60000
     ) $$
);
