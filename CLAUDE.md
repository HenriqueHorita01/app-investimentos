# CLAUDE.md

App pessoal de investimentos. Toda a lógica de negócio está em `SPEC.md`: leia antes de implementar.

## Regras do projeto
- Idioma da interface e do código de domínio: português (nomes de tabelas, colunas e telas como no SPEC).
- Stack: React + Vite + TypeScript, Tailwind, Supabase, Vercel. PWA.
- O repositório é **público**: nunca commitar chaves. Usar `.env.local` (no `.gitignore`) e `.env.example`.
- Só a chave `anon`/publishable vai pro front. A `service_role` fica só em Edge Functions.
- Toda tabela de usuário usa RLS por `user_id`. Não desativar.
- Mudanças de banco sempre como nova migration em `supabase/migrations/`.
- Valores monetários: `numeric` no banco; no front, formatar em BRL (`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`).
- Datas em `America/Sao_Paulo`. Renda fixa rende só em dias úteis.
- Tema claro e escuro, seguindo a paleta do SPEC. Referência visual em `docs/telas/`.
- Estimativas sempre rotuladas como estimativa na interface.

## Ordem de implementação
Seguir as fases da seção 8 do SPEC, começando pelo MVP.
