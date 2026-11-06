CREATE TABLE IF NOT EXISTS chamados (
  id          SERIAL PRIMARY KEY,
  titulo      VARCHAR(100)  NOT NULL,
  descricao   VARCHAR(1000) NOT NULL,
  laboratorio VARCHAR(50)   NOT NULL,
  prioridade  VARCHAR(2)    NOT NULL CHECK (prioridade IN ('P1','P2','P3','P4')),
  status      VARCHAR(20)   NOT NULL DEFAULT 'aberto'
              CHECK (status IN ('aberto','em_atendimento','resolvido','fechado')),
  solucao     TEXT          NULL,
  aberto_em   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  prazo_sla   TIMESTAMPTZ   NOT NULL,
  resolvido_em TIMESTAMPTZ  NULL
);
CREATE INDEX IF NOT EXISTS idx_chamados_fila ON chamados (prioridade, aberto_em);