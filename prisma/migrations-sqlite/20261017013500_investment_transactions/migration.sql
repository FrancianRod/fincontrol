-- AlterTable
ALTER TABLE "CreditLetterPeriod" ADD COLUMN "installmentPaidAt" DATETIME;

-- CreateTable
CREATE TABLE "InvestmentTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "investmentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InvestmentTransaction_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "InvestmentTransaction_investmentId_date_idx" ON "InvestmentTransaction"("investmentId", "date");

-- Backfill: o saldo atual de cada investimento vira um aporte inicial na data de cadastro.
INSERT INTO "InvestmentTransaction" ("id", "investmentId", "type", "amountCents", "date", "note", "createdAt", "updatedAt")
SELECT
  lower(hex(randomblob(12))),
  "id",
  'APORTE',
  "balanceCents",
  "createdAt",
  'Saldo inicial',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM "Investment"
WHERE "balanceCents" > 0;
