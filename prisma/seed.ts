import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! }),
});

const r = (reais: number) => Math.round(reais * 100);

/** Data no mês atual (offset 0) ou em meses anteriores (offset negativo). */
function day(d: number, monthOffset = 0) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + monthOffset, d, 12);
}

/** AAAAMM do mês atual + offset (para CreditLetterPeriod). */
function periodOf(monthOffset: number) {
  const d = day(1, monthOffset);
  return d.getFullYear() * 100 + d.getMonth() + 1;
}

const fixedCosts = [
  { key: "aluguel", description: "Aluguel", category: "Moradia", amount: 1800, due: 5 },
  { key: "condominio", description: "Condomínio", category: "Moradia", amount: 450, due: 10 },
  { key: "luz", description: "Conta de luz", category: "Contas", amount: 160, due: 15 },
  { key: "internet", description: "Internet", category: "Contas", amount: 110, due: 20 },
  { key: "celular", description: "Plano de celular", category: "Contas", amount: 60, due: 22 },
  { key: "streaming", description: "Streaming", category: "Assinaturas", amount: 55, due: 25, essential: false },
];

async function main() {
  await db.user.deleteMany();

  const user = await db.user.create({
    data: { name: "Você", email: "voce@exemplo.com", variableBudgetCents: r(1500) },
  });

  // Custos fixos recorrentes (sem término): uma série por conta; as linhas dos
  // meses seguintes são criadas pelo app ao abrir cada mês.
  const series = new Map<string, string>();
  for (const f of fixedCosts) {
    const s = await db.expenseSeries.create({
      data: {
        userId: user.id,
        mode: "CONTINUOUS",
        description: f.description,
        amountCents: r(f.amount),
        category: f.category,
        type: "FIXED",
        essential: f.essential ?? true,
        dueDay: f.due,
        startPeriod: periodOf(-3),
      },
    });
    series.set(f.key, s.id);
  }

  // Compra parcelada: 10x de R$ 189,90, começou há 2 meses (parcela 3/10 neste mês)
  await db.expenseSeries.create({
    data: {
      userId: user.id,
      mode: "INSTALLMENTS",
      description: "Geladeira (10x)",
      amountCents: r(189.9),
      category: "Moradia",
      type: "VARIABLE",
      dueDay: 12,
      startPeriod: periodOf(-2),
      endPeriod: periodOf(7),
      totalInstallments: 10,
      expenses: {
        create: [-2, -1, 0].map((offset) => ({
          userId: user.id,
          description: "Geladeira (10x)",
          amountCents: r(189.9),
          category: "Moradia",
          type: "VARIABLE" as const,
          status: offset < 0 ? ("PAID" as const) : ("PENDING" as const),
          paidAt: offset < 0 ? day(12, offset) : null,
          dueDate: day(12, offset),
          installmentNumber: offset + 3,
        })),
      },
    },
  });

  // Últimos 3 meses + mês atual
  for (const offset of [-3, -2, -1, 0]) {
    const isCurrent = offset === 0;
    const today = new Date().getDate();

    await db.income.createMany({
      data: [
        { userId: user.id, description: "Salário líquido", amountCents: r(6200), type: "SALARY", date: day(5, offset), received: !isCurrent || today >= 5 },
        { userId: user.id, description: "Rendimentos CDB", amountCents: r(85), type: "YIELD", date: day(1, offset) },
        ...(isCurrent
          ? [{ userId: user.id, description: "Freela – landing page", amountCents: r(1200), type: "FREELANCE" as const, date: day(28), received: false }]
          : []),
      ],
    });

    for (const f of fixedCosts) {
      const due = day(f.due, offset);
      const paid = !isCurrent || f.due < today;
      await db.expense.create({
        data: {
          userId: user.id,
          description: f.description,
          category: f.category,
          amountCents: r(f.amount),
          type: "FIXED",
          status: paid ? "PAID" : "PENDING",
          paidAt: paid ? due : null,
          dueDate: due,
          essential: f.essential ?? true,
          seriesId: series.get(f.key)!,
        },
      });
    }

    const variable = isCurrent
      ? [
          { d: "Mercado", c: "Alimentação", v: 420, day: 3 },
          { d: "Uber", c: "Transporte", v: 64, day: 6 },
          { d: "Farmácia", c: "Saúde", v: 48, day: 9 },
          { d: "Restaurante", c: "Lazer", v: 95, day: 11, essential: false },
        ]
      : [
          { d: "Mercado", c: "Alimentação", v: 780 + offset * -20, day: 4 },
          { d: "Transporte", c: "Transporte", v: 210, day: 12 },
          { d: "Lazer", c: "Lazer", v: 260, day: 18, essential: false },
          { d: "Farmácia", c: "Saúde", v: 90, day: 21 },
        ];

    await db.expense.createMany({
      data: variable
        .filter((v) => !isCurrent || v.day <= today)
        .map((v) => ({
          userId: user.id,
          description: v.d,
          category: v.c,
          amountCents: r(v.v),
          type: "VARIABLE" as const,
          status: "PAID" as const,
          paidAt: day(v.day, offset),
          dueDate: day(v.day, offset),
          essential: v.essential ?? true,
        })),
    });
  }

  // Saldo = aportes − resgates; balanceCents guarda a soma.
  const investments = [
    { name: "Reserva – CDB liquidez diária", assetType: "EMERGENCY_RESERVE" as const, institution: "Nubank", monthly: 300, txs: [[13900, -3], [300, -2], [300, -1], [-500, -1], [500, 0]] },
    { name: "Tesouro IPCA+ 2035", assetType: "FIXED_INCOME" as const, institution: "Tesouro Direto", monthly: 300, txs: [[7300, -3], [300, -2], [300, -1], [300, 0]] },
    { name: "Carteira de ações", assetType: "STOCKS" as const, institution: "XP", monthly: 200, txs: [[4700, -3], [200, -2], [200, -1], [200, 0]] },
    { name: "FIIs", assetType: "REITS" as const, institution: "XP", monthly: 200, txs: [[3300, -3], [200, -2], [200, -1], [200, 0]] },
  ];
  for (const inv of investments) {
    const txs = inv.txs.map(([v, offset]) => ({
      type: v < 0 ? ("RESGATE" as const) : ("APORTE" as const),
      amountCents: r(Math.abs(v)),
      date: day(v < 0 ? 20 : 6, offset),
      note: v < 0 ? "Resgate para imprevisto" : null,
    }));
    await db.investment.create({
      data: {
        userId: user.id,
        name: inv.name,
        assetType: inv.assetType,
        institution: inv.institution,
        monthlyContributionCents: r(inv.monthly),
        balanceCents: txs.reduce((a, t) => a + (t.type === "RESGATE" ? -t.amountCents : t.amountCents), 0),
        transactions: { create: txs },
      },
    });
  }

  await db.creditLetter.create({
    data: {
      userId: user.id,
      name: "Consórcio Imóvel",
      administrator: "Porto",
      creditValueCents: r(200000),
      correctedCreditCents: r(208400),
      paidCents: r(18400),
      outstandingCents: r(213600),
      installmentCents: r(1150),
      totalInstallments: 200,
      paidInstallments: 16,
      dueDay: 15,
      // Histórico: reajuste anual aplicado há 1 mês (parcela 1.080 -> 1.150)
      periods: {
        create: [
          { period: periodOf(-3), correctedCreditCents: r(200000), paidCents: r(15160), outstandingCents: r(200840), installmentCents: r(1080), paidInstallments: 13 },
          { period: periodOf(-1), correctedCreditCents: r(208400), paidCents: r(17250), outstandingCents: r(214750), installmentCents: r(1150), paidInstallments: 15 },
          { period: periodOf(0), correctedCreditCents: r(208400), paidCents: r(18400), outstandingCents: r(213600), installmentCents: r(1150), paidInstallments: 16, installmentPaid: true },
        ],
      },
    },
  });

  console.log(`Seed concluído para ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
