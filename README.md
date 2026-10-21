# fincontrol

Controle financeiro pessoal minimalista para quem mora sozinho: custos fixos e variáveis, renda, patrimônio e projeção de sobra no fim do mês.

**Stack:** Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS 4 · Prisma 7 + PostgreSQL no Supabase (`@prisma/adapter-pg`)

## Rodando

```bash
npm install            # também roda `prisma generate`
cp .env.example .env   # preencha DATABASE_URL e DIRECT_URL do Supabase
npm run db:migrate     # aplica as migrações (prisma migrate dev)
npm run db:seed        # dados de exemplo (4 meses) — APAGA os dados existentes
npm run dev
```

Outros scripts: `db:studio`, `db:reset`.

### Banco (Supabase)

- `DATABASE_URL`: pooler em modo transação (porta 6543, `?pgbouncer=true`), usado pelo app em `src/lib/db.ts` via `@prisma/adapter-pg`.
- `DIRECT_URL`: pooler em modo sessão (porta 5432), usado pelo CLI (migrações e seed). Fica em `prisma.config.ts`.
- No Prisma 7 `url`/`directUrl` **não** podem ficar no `schema.prisma` (erro P1012): o schema só declara `provider = "postgresql"`.
- Importar dados do SQLite antigo: `npx tsx scripts/import-sqlite.ts` (simulação, mostra as contagens) e `--apply` (apaga os dados do Supabase e copia tudo do `prisma/dev.db`, numa transação, mantendo os ids). Usado em 21/10/2026 para levar os dados reais para a nuvem.
- **RLS ativo** em todas as tabelas (`*_enable_rls`), sem políticas: a API pública do Supabase (chaves anon/authenticated) não lê nem grava nada. O app conecta como `postgres` (BYPASSRLS) e não é afetado. Ao criar uma tabela nova, inclua `ALTER TABLE "..." ENABLE ROW LEVEL SECURITY;` na migração.
- O histórico de migrações começa em `prisma/migrations/*_init_supabase`. As migrações da época do SQLite estão arquivadas em `prisma/migrations-sqlite/` (não são aplicadas).

## Estrutura

```
prisma/schema.prisma        modelos User, Income, Expense, Investment, CreditLetter
prisma/seed.ts              dados de exemplo
src/lib/finance.ts          regras de negócio puras (projeção, custo de vida, formatação)
src/lib/dashboard.ts        consultas ao banco + montagem do dashboard
src/app/page.tsx            dashboard (seletor de mês via ?mes=AAAA-MM)
src/app/actions.ts          server action compartilhada (pago/pendente)
src/app/{renda,despesas,patrimonio}/  páginas, formulários e server actions de cada módulo
src/components/             shell (sidebar/bottom nav), tema, UI
```

Valores monetários ficam em **centavos (Int)**.

## Regras do dashboard

Todas as telas (Dashboard, Renda, Despesas, Patrimônio) usam o mesmo filtro de data (`src/components/day-filter.tsx`): `?data=AAAA-MM-DD`, seletores de Mês/Ano e ‹ Hoje › (dia a dia). A tela mostra o mês do dia selecionado; o que é "até a data" usa o fim desse dia: renda recebida (recebida e com data ≤ dia), custos pagos (pagos até o dia), variáveis gastos (data ≤ dia), saldo em conta e patrimônio. O `?mes=AAAA-MM` antigo do dashboard continua funcionando.

- **Sobra prevista** = Entradas (recebidas + previstas) − Fixos (pagos + a pagar) − Variáveis já gastos − Variáveis restantes − Aportes em investimentos − Parcelas de consórcio.
  - *Variáveis restantes* = `max(max(referência, gasto + agendados) − gasto, 0)`: a referência é o limite definido em `User.variableBudgetCents` ou, se vazio, a média dos 3 meses anteriores; "agendados" são variáveis já lançados com data depois do dia do filtro. Em meses passados vale só o que foi lançado. Assim a sobra do fim do mês não muda conforme o dia escolhido dentro do mesmo mês.
- **Saldo em conta** = entradas recebidas − despesas pagas.
- **Custo de vida real** = todos os custos fixos + variáveis marcados como essenciais, com o % da renda.

### Painéis de inteligência (Dashboard)

Calculados em `src/lib/dashboard-analytics.ts` (dados) e `src/lib/analytics.ts` (regras puras), para o mês do dia filtrado, com tudo o que está lançado no mês:

- **Gastos por categoria** (rosca, `components/charts/category-donut.tsx`): Todos / Fixos / Variáveis. A cor de cada categoria vem do ranking de todos os gastos do mês e não muda ao alternar; a partir da 8ª categoria tudo vira "Outros" (cinza).
- **Entradas × custos × sobra** (`components/charts/history-chart.tsx`): 6 ou 12 meses terminando no mês filtrado. Barras: entradas e custos (fixos + variáveis + parcela de consórcio); linhas: sobra real (entradas − custos) e aportes líquidos (aportes − resgates; o "Saldo inicial" da migração não conta). Tooltip por mês e tabela.
- **Regra 50/30/20**: essenciais (despesas marcadas como essenciais) até 50%, estilo de vida (não essenciais) até 30%, investimentos (aportes líquidos + parcela de consórcio) 20%+ da renda do mês.
- **Destaques**: maior categoria, maior alta/queda por categoria e variação dos custos em relação ao mês anterior, dias até o fim do mês e quanto dá para gastar por dia (o que sobra do limite/média de variáveis; sem referência, a sobra prevista).

### Investimentos: aportes e resgates

O saldo de um investimento é Σ aportes − Σ resgates + Σ rendimentos (`InvestmentTransaction`: `APORTE`/`RESGATE` com valor positivo; `RENDIMENTO` com sinal, negativo = desvalorização). O formulário oferece Aporte, Resgate, Rendimento e Desvalorização (sempre valor positivo; desvalorização vira RENDIMENTO negativo). "Atualizar saldo" recebe o valor de mercado numa data e lança a diferença como RENDIMENTO ao fim daquele dia. O card "Investido" mostra o rendimento do mês até a data do filtro. Na tela de Patrimônio os saldos são calculados até o fim do dia selecionado. Um resgate (ou a exclusão de um aporte) que deixaria o saldo negativo em qualquer data é recusado. `Investment.balanceCents` guarda a soma de todas as movimentações e é usado no dashboard. As regras ficam em `src/lib/investments.ts`.

### Consórcios por período

Parcela, crédito corrigido, pago acumulado e saldo devedor sofrem reajustes, então cada mudança é gravada como um retrato do mês/ano (`CreditLetterPeriod`, chave `AAAAMM`). Para um mês qualquer vale o retrato mais recente até ele; meses sem reajuste herdam os valores anteriores. A tela de Patrimônio filtra por dia (`?data=AAAA-MM-DD`, com Mês/Ano e ‹ Hoje ›): editar grava o retrato do mês da data, e registrar parcela guarda o dia (`installmentPaidAt`), então dias anteriores no mesmo mês mostram os valores de antes do pagamento. A projeção de sobra usa a parcela vigente no mês consultado, e um consórcio sem retrato até aquele mês não entra na conta. As colunas de valores em `CreditLetter` guardam uma cópia do retrato mais recente. As regras ficam em `src/lib/credit-letters.ts`.

## Módulos

- **/renda** — entradas do mês do dia filtrado (recebidas até a data × previstas), criar/editar/excluir, alternar recebida/prevista. Entrada marcada como recebida mas com data depois do dia aparece como "Agendada".
- **/despesas** — fixas e variáveis com filtro, status pago/pendente, categoria, flag essencial e repetição. Filtro por dia (`?data=AAAA-MM-DD`, Mês/Ano e ‹ Hoje ›): mostra o mês do dia, e status e cards ("pago até", "em aberto até") são calculados até o fim do dia selecionado. Marcar como pago registra o pagamento no dia do filtro.
  - **Repetição** (`ExpenseSeries`): *Todo mês* (sem término, por N meses ou até um mês/ano) ou *Parcelada* (N parcelas, podendo começar numa parcela intermediária, ex.: 3/12). Cada mês é uma linha `Expense` própria ligada à série; as linhas que faltam são criadas automaticamente ao abrir um mês (Despesas ou Dashboard) até aquele mês. A lista mostra "Parcela 3/12 · faltam 9" ou "Todo mês · até dez/2027".
  - Editar uma despesa da série pergunta se vale **só para este mês** ou para **este e os próximos** (aí a repetição/parcelas também podem mudar). Excluir também: "só este mês" marca o mês como pulado (`skippedPeriods`) para não ser recriado; "este e os próximos" encerra a série.
  - Regras puras em `src/lib/expense-series.ts`; geração em `src/lib/expense-data.ts`.
- **/patrimonio** — investimentos por tipo de ativo e cartas de crédito/consórcios, com "Registrar parcela paga".

Formulários usam server actions validadas com zod (`src/lib/validation.ts`); toda consulta e mutação é filtrada pelo usuário de `getCurrentUser()`. Valores aceitam `1.234,56`, `1.000` ou `1234.56`.

## Ainda não implementado

- Autenticação (hoje o app usa o primeiro usuário do banco).
- Edição do limite mensal de custos variáveis (`User.variableBudgetCents`) pela interface.
