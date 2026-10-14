-- Move pg_net para o schema extensions (alerta do Security Advisor).
-- As funções continuam em net.*, então o agendamento do CDI não muda.
drop extension if exists pg_net;
create extension pg_net with schema extensions;
