-- Cotação manual (Fase 1 do SPEC).
-- A tabela `cotacoes` é compartilhada e, no schema inicial, só aceitava escrita pela
-- service role. Aqui o usuário logado passa a poder gravar/corrigir cotações com
-- fonte = 'manual'. Cotações de rotinas automáticas (outras fontes) continuam
-- protegidas: não podem ser criadas nem sobrescritas pelo front.

create policy "manual_insere" on cotacoes
  for insert to authenticated
  with check (fonte = 'manual');

create policy "manual_atualiza" on cotacoes
  for update to authenticated
  using (fonte = 'manual')
  with check (fonte = 'manual');
