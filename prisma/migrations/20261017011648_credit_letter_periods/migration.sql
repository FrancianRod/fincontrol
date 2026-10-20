-- AlterTable
ALTER TABLE "CreditLetter" ADD COLUMN "correctedCreditCents" INTEGER;

-- CreateTable
CREATE TABLE "CreditLetterPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creditLetterId" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "correctedCreditCents" INTEGER,
    "paidCents" INTEGER NOT NULL,
    "outstandingCents" INTEGER NOT NULL,
    "installmentCents" INTEGER NOT NULL,
    "paidInstallments" INTEGER NOT NULL,
    "installmentPaid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreditLetterPeriod_creditLetterId_fkey" FOREIGN KEY ("creditLetterId") REFERENCES "CreditLetter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditLetterPeriod_creditLetterId_period_key" ON "CreditLetterPeriod"("creditLetterId", "period");

-- Backfill: cada consórcio existente ganha um retrato no mês em que foi cadastrado.
INSERT INTO "CreditLetterPeriod" ("id", "creditLetterId", "period", "correctedCreditCents", "paidCents", "outstandingCents", "installmentCents", "paidInstallments", "installmentPaid", "createdAt", "updatedAt")
SELECT
  lower(hex(randomblob(12))),
  "id",
  CAST(strftime('%Y%m', "createdAt") AS INTEGER),
  "correctedCreditCents",
  "paidCents",
  "outstandingCents",
  "installmentCents",
  "paidInstallments",
  false,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM "CreditLetter";
