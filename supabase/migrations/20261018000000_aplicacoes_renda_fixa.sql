-- Controle individual de aplicações em renda fixa.
-- Cada aporte de CDB, LCI/LCA ou Tesouro é uma aplicação (lote) com condições próprias.
-- As colunas são opcionais: vazias = herdam do ativo (taxa, indexador, vencimento…),
-- então tudo o que já existe continua calculando igual.

alter table movimentacoes
  add column taxa       numeric(9,4),
  add column indexador  indexador,
  add column vencimento date,
  add column liquidez   text,
  -- Data até a qual a aplicação não pode ser resgatada.
  add column carencia   date;

-- ============ IPCA mensal (compartilhado) ============
-- Série 433 do BCB (variação % no mês). Usada no Tesouro IPCA+ e em CDB/LCI IPCA+.
create table ipca_mensal (
  mes       date primary key,          -- 1º dia do mês de referência
  variacao  numeric(9,4) not null,     -- % no mês, ex.: 0.4400
  fonte     text not null default 'bcb_sgs_433'
);

alter table ipca_mensal enable row level security;
create policy "leitura" on ipca_mensal for select to authenticated using (true);

-- A Edge Function `atualizar-ipca` grava a série. Roda junto com a do CDI.
select cron.schedule(
  'atualizar-ipca',
  '45 12 * * *',
  $$ select net.http_post(
       url := 'https://xqxiqqqqqeudesyzihju.supabase.co/functions/v1/atualizar-ipca',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb,
       timeout_milliseconds := 60000
     ) $$
);
