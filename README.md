# Help Desk dos Laboratórios

Cloud Challenge, Desafio 04 (Cloud Computing, Senac 2026.2, prof. Roni Maciel).

| Item | Valor |
|---|---|
| Grupo | [OTávio Augusto, Arlane, Dayane Oleiveira, Daniel Cabral, Ian, Sabrina:g03 ] |
| Integrantes e papéis | [ Otávio, Ian DEV / Dayana, Arlane DADOS / Otávio, Daniel, Sabrina NUVEM / Otávio, Sabrina QA] |
| Nível de implantação | A (URL pública no Azure App Service) |
| URL pública (nível A) | [https://app-helpdesk-g03.azurewebsites.net] |
| Vídeo do pitch (90 s) | [PREENCHER] |

## 1. Problema e usuário

Os problemas dos laboratórios (projetor, rede, software) são relatados no corredor, então o técnico de TI não sabe o que é mais urgente e chamados somem sem solução registrada. Professores abrem chamados com uma prioridade de P1 a P4 e o técnico atende uma fila ordenada por prioridade e antiguidade, com prazo de atendimento (SLA) calculado e um fluxo de status que não deixa pular etapas.

## 2. Requisitos da ficha

| Código | Requisito | Status |
|---|---|---|
| RF1 | Abrir chamado (título, descrição, laboratório, prioridade P1 a P4) | Implementado |
| RF2 | Prazo pela prioridade: P1 4 h, P2 8 h, P3 24 h, P4 72 h | Implementado |
| RF3 | Fila ordenada por prioridade e depois antiguidade, com filtro por status | Implementado |
| RF4 | Status só por transições válidas (regra central) | Implementado |
| RF5 | Solução obrigatória para resolver | Implementado |
| RF6 | Indicar "SLA vencido" | Implementado |
| CA1 a CA5 | Critérios de aceitação | CA1, CA2, CA3 e CA5 em teste automatizado; CA4 depende do banco real (ver seção 7) |
| Geral | Interface web e requisições em `.http` | Implementado (`frontend/` e `backend/requisicoes.http`) |
| Geral | Persistência em banco, consultas parametrizadas, `DATABASE_URL` fora do código | Implementado; prova de persistência pendente |
| Geral | `GET /health` testa o banco; erros 400, 404, 409 e 503 sem detalhes internos | Implementado |
| Geral | Deploy no Azure App Service e evidências E1 a E6 | Deploy feito (URL no topo); evidências E2, E3, E5 e E6 pendentes (seção 8) |
| Extra | Contagem por status (`GET /chamados/resumo`) | Implementado |
| Extra | Painel de indicadores, busca na fila e legenda de prioridades (só interface) | Implementado |

## 3. Arquitetura

```mermaid
flowchart LR
    U["Navegador<br/>professor ou técnico"] -->|HTTPS| A["Azure App Service<br/>Node.js 22 + Express<br/>serve a interface e a API"]
    A -->|"DATABASE_URL, TLS<br/>consultas parametrizadas"| B[("Azure Database for PostgreSQL<br/>Servidor Flexível")]
```

Caminho de uma requisição até o banco (mudança de status):

```mermaid
sequenceDiagram
    participant N as Navegador
    participant A as Express no App Service
    participant B as PostgreSQL
    N->>A: PATCH /chamados/7/status
    A->>B: SELECT do status atual
    B-->>A: aberto
    A->>A: valida a transição e a solução
    A->>B: UPDATE só se o status ainda for o lido
    B-->>A: linha atualizada
    A-->>N: 200 com o chamado, ou 400 / 409 / 404 / 503
```

### Decisão obrigatória: instalar o banco na VM Linux da TI?

Decidimos **não** instalar o banco na VM e usar o PostgreSQL gerenciado do Azure.

| Critério | PostgreSQL gerenciado | Banco instalado na VM existente |
|---|---|---|
| Manutenção | O Azure aplica correções do sistema e do PostgreSQL. | A TI instala, atualiza e protege o servidor e o banco. |
| Backup | Backups automáticos com restauração para um ponto no tempo; a retenção é configurável. | É preciso criar e testar uma rotina (por exemplo `pg_dump` ou snapshot) e guardar a cópia fora da VM. |
| Custo | Cobra por hora; no laboratório, é só parar o servidor ao fim da aula. | A VM já existe, então o custo extra em dinheiro é baixo, mas sobra o custo em horas da equipe. |
| Tempo | Fica pronto em 5 a 15 minutos pelo portal. | Instalar, configurar firewall, TLS e `pg_hba.conf` leva bem mais. |

**O que se ganha:** backup e atualização sem trabalho nosso, e menos risco de perder chamados, que é justamente o problema do cliente. **O que se perde:** custo mensal do serviço, menos controle fino da configuração e dependência do Azure. A VM só valeria a pena se a TI já tivesse um responsável pelo banco e uma rotina de backup testada.

### Outras decisões

- **Transições num mapa no código** (`backend/src/regras.js`), e não numa tabela do banco. Ganha simplicidade e testes sem banco; perde a possibilidade de mudar a regra sem novo deploy.
- **Prazo gravado na abertura** (`prazo_sla`), e não calculado a cada consulta. Ganha uma fila ordenável e estável mesmo se a regra de SLA mudar depois; perde a correção automática de prazos antigos.
- **Interface servida pelo próprio Express.** Uma única URL e um único App Service, sem CORS; o custo é publicar front e back juntos.
- **PostgreSQL em vez de Azure SQL**, porque o driver `pg` e as consultas parametrizadas já estão prontos para ele. [CONFIRMAR com o grupo]

## 4. Modelo de dados

```mermaid
erDiagram
    CHAMADOS {
        serial id PK
        varchar titulo "NOT NULL, ate 100"
        varchar descricao "NOT NULL, ate 1000"
        varchar laboratorio "NOT NULL, ate 50"
        varchar prioridade "NOT NULL, CHECK P1 a P4"
        varchar status "NOT NULL, CHECK 4 valores, padrao aberto"
        text solucao "NULL ate resolver"
        timestamptz aberto_em "NOT NULL"
        timestamptz prazo_sla "NOT NULL"
        timestamptz resolvido_em "NULL ate resolver"
    }
```

Script: [`banco/schema.sql`](banco/schema.sql). Há um índice em `(prioridade, aberto_em)` para a ordem da fila. Datas em `timestamptz`, porque o App Service usa UTC e a interface converte para o horário local.

Fluxo de status (regra central):

```mermaid
stateDiagram-v2
    [*] --> aberto
    aberto --> em_atendimento
    em_atendimento --> aberto : devolver à fila
    em_atendimento --> resolvido : exige solução
    resolvido --> fechado
    fechado --> [*]
```

## 5. API

| Rota | O que faz | Erros |
|---|---|---|
| `POST /chamados` | Abre chamado e grava o prazo | 400 |
| `GET /chamados?status=` | Fila por prioridade e antiguidade; aceita um ou mais status separados por vírgula | 400 |
| `GET /chamados/resumo` | Contagem por status e de SLA vencido | |
| `GET /chamados/:id` | Um chamado | 400, 404 |
| `PATCH /chamados/:id/status` | Muda o status (`status`, e `solucao` ao resolver) | 400, 404, 409 |
| `GET /health` | Testa a conexão com o banco e informa `iniciado_em` | 503 |

Requisições prontas em [`backend/requisicoes.http`](backend/requisicoes.http) (extensão REST Client do VS Code). Qualquer falha de conexão com o banco vira 503 sem expor detalhes.

## 6. Como executar

Requisitos: Node.js 20 ou mais novo (no Azure usamos o 22 LTS) e um PostgreSQL.

```bash
npm install
cp .env.example .env        # preencha DATABASE_URL
psql "$DATABASE_URL" -f banco/schema.sql
npm start                   # http://localhost:3000
npm test                    # testes sem banco
```

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | String de conexão, por exemplo `postgres://usuario:senha@servidor.postgres.database.azure.com:5432/banco` |
| `DB_SSL` | `true` (padrão) para o Azure; `false` para um Postgres local sem TLS |
| `PORT` | Porta; o App Service define sozinho |

O `.env` nunca vai para o Git (está no `.gitignore`).

### Implantação no Azure (como foi feita)

Tudo na assinatura Azure for Students, região Brazil South, no grupo de recursos `HelpDesk` (marca `grupo = g03`).

1. **Banco:** Azure Database for PostgreSQL, Servidor Flexível `pg-helpdesk-g03`, PostgreSQL 18, Burstable B1ms, 32 GiB (SSD Premium), sem alta disponibilidade e sem redundância geográfica. Acesso público, com "permitir serviços do Azure" e o IP de quem administra no firewall. Banco `helpdesk`.
2. **Tabelas:** `banco/schema.sql` executado com `psql` no Cloud Shell.
3. **App Service:** plano `plan-helpdesk-g03` (Linux, Gratuito F1) e aplicativo `app-helpdesk-g03`, runtime **Node 22 LTS**. O Node 20 não é mais aceito pelo Azure, e o projeto roda em qualquer versão a partir da 20.
4. **Variáveis de ambiente do App Service** (a senha nunca vai para o código ou para o Git): `DATABASE_URL`, `DB_SSL=true` e `SCM_DO_BUILD_DURING_DEPLOYMENT=true` (faz o Azure rodar o `npm install`).
5. **Publicação** do código por zip, pelo Cloud Shell (comandos abaixo).
6. **Verificação:** `/health` responde ok e a tela mostra "Banco conectado".

### Como atualizar o app depois de mudar o código

As variáveis de ambiente continuam salvas no App Service, então só o código precisa ser enviado de novo. Para testar antes, rode `npm start` e abra http://localhost:3000.

```bash
# 1. gere um zip da raiz do projeto (sem node_modules, .git e .env)
# 2. envie o zip no Cloud Shell (Gerenciar arquivos > Carregar) e rode:
az webapp deploy -g HelpDesk -n app-helpdesk-g03 --src-path deploy.zip --type zip
```

Outras formas: a extensão Azure App Service do VS Code (botão direito na pasta > Deploy to Web App) ou o Centro de Implantação do App Service ligado ao GitHub, que publica a cada `git push`.

Ao fim da aula, parar o servidor PostgreSQL (Visão geral > Parar) e ligar de novo antes de apresentar.

## 7. Casos de teste (E3)

Rodam com `npm test`. Os marcados "automatizado" usam um banco falso e já passam; os demais precisam do banco real e o grupo deve preencher o resultado obtido.

| ID | Tipo | Entrada | Esperado | Obtido |
|---|---|---|---|---|
| T1 | Positivo | `POST /chamados` P1 válido | 201 e prazo = abertura + 4 h | Passou (automatizado) |
| T2 | Positivo | P1 aberto às 19:00 (CA3) | Prazo 23:00 do mesmo dia | Passou (automatizado) |
| T3 | Negativo | Prioridade `P7` (CA5) | 400 | Passou (automatizado) |
| T4 | Negativo | `aberto` para `fechado` direto (CA1) | 409 | Passou (automatizado) |
| T5 | Negativo | `em_atendimento` para `resolvido` sem solução (CA2) | 400 | Passou (automatizado) |
| T6 | Positivo | `em_atendimento` para `resolvido` com solução | 200 (e `resolvido_em` preenchido no banco) | Passou o 200 (automatizado); conferir `resolvido_em` no banco |
| T7 | Negativo | Chamado inexistente | 404 | Passou (automatizado) |
| T8 | Negativo | Banco fora do ar em `/health` | 503 sem detalhes internos | Passou (automatizado) |
| T9 | Positivo | Um P1 aberto depois de um P3 (CA4) | O P1 aparece antes na fila | [PREENCHER no banco real] |
| T10 | Positivo | Chamado com `aberto_em` antigo inserido direto no banco | `sla_vencido = true` | [PREENCHER no banco real] |
| T11 | Positivo | Registro `G03-PALAVRA` após reiniciar a aplicação | Continua listado | [PREENCHER] |

Para T10, insira um chamado com `aberto_em` e `prazo_sla` no passado direto no banco e documente isso aqui.

## 8. Evidências

| Código | Evidência | Onde | Status |
|---|---|---|---|
| E1 | URL pública ou descrição do ambiente | Topo deste README | URL no topo; falta o print em `evidencias/` |
| E2 | Quatro prints da prova de persistência (`G03-PALAVRA`) | `evidencias/` | [PREENCHER] |
| E3 | Casos de teste | Seção 7 | Parcial |
| E4 | Diagrama de arquitetura | Seção 3 | Feito |
| E5 | Print das variáveis de ambiente com o valor oculto e `.gitignore` com `.env` | `evidencias/` | [PREENCHER] |
| E6 | README completo e vídeo do pitch | Topo deste README | [PREENCHER] |

Específicas do desafio: teste das transições (T4 e T5), print da fila ordenada (T9) e o parágrafo VM × gerenciado (seção 3).

## 9. Segurança

- Consultas parametrizadas; nenhum texto do usuário é concatenado ao SQL.
- Entradas validadas no servidor, com tamanhos máximos e corpo limitado a 10 KB.
- Erros genéricos para o cliente; detalhes internos só no log do servidor.
- A interface monta a tela com `textContent`, sem inserir HTML vindo do usuário.
- Somente dados fictícios nos testes.
- Recomendado: criar no banco um usuário da aplicação sem privilégio de administrador. Pendente: [PREENCHER pelo papel DADOS]

## 10. Dificuldade superada

**Problema:** logo após o deploy, a tela mostrava "Banco indisponível" e as chamadas davam 500, embora o banco estivesse no ar e o `schema.sql` já tivesse rodado.

**Diagnóstico:** listamos a `DATABASE_URL` salva no App Service com a senha mascarada e a URL estava certa (usuário, servidor e banco). Depois testamos a conexão com `psql` usando a mesma URL e ele **pediu a senha**, o que mostrou que ela estava vazia na variável.

**Causa:** a senha foi lida no Cloud Shell com `read -s SENHA`, que não mostra o que se digita, e o comando seguinte foi colado antes de digitar a senha. A variável ficou vazia e a `DATABASE_URL` foi gravada sem senha.

**Solução:** repetimos o `read -s`, conferimos com `echo ${#SENHA}` que a variável tinha o tamanho esperado, regravamos a variável, reiniciamos o app e a tela passou a mostrar "Banco conectado".

**Outro obstáculo:** o runtime `NODE:20-lts` foi recusado pelo Azure (versão fora de suporte). Listamos os disponíveis com `az webapp list-runtimes --os-type linux` e usamos o Node 22 LTS.

## 11. Limitações e próximos passos

- Não há login: qualquer pessoa com a URL abre e muda chamados. O próximo passo seria separar os perfis de professor e de técnico.
- A tela não tem comentários nos chamados nem paginação da fila.
- A API foi testada com um banco falso; o teste de ponta a ponta com PostgreSQL real é do grupo.
- A busca da interface filtra só a lista já carregada, não consulta o banco.
- Próximo passo opcional: mensagem na Azure Queue Storage quando entrar um P1.

## Estrutura

```
backend/    API Express (src/, test/, requisicoes.http)
frontend/   interface web (index.html)
banco/       schema.sql
evidencias/  prints com data e hora visíveis
```
