-- Saldo líquido informado manualmente (ex.: "disponível para resgate" do banco).
-- Não altera aportes, rendimentos nem impostos: só substitui o valor exibido.
-- `liquido_manual_assinatura` guarda um resumo dos lançamentos no momento em que o valor
-- foi salvo; se os lançamentos mudarem, o app avisa que o valor pode estar desatualizado.
alter table ativos
  add column liquido_manual            numeric(18,2) check (liquido_manual is null or liquido_manual >= 0),
  add column liquido_manual_em         timestamptz,
  add column liquido_manual_assinatura text;
