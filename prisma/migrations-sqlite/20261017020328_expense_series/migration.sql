-- CreateTable
CREATE TABLE "ExpenseSeries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "essential" BOOLEAN NOT NULL DEFAULT true,
    "dueDay" INTEGER NOT NULL,
    "startPeriod" INTEGER NOT NULL,
    "endPeriod" INTEGER,
    "totalInstallments" INTEGER,
    "skippedPeriods" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExpenseSeries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Backfill: cada conta recorrente existente (mesma recurrenceKey) vira uma série
-- contínua sem término. Valores e dia de vencimento vêm do mês mais recente;
-- o início é o mês mais antigo. A recurrenceKey vira o id da série.
INSERT INTO "ExpenseSeries" ("id", "userId", "mode", "description", "amountCents", "category", "type", "essential", "dueDay", "startPeriod", "endPeriod", "totalInstallments", "skippedPeriods", "createdAt", "updatedAt")
SELECT
  e."recurrenceKey",
  e."userId",
  'CONTINUOUS',
  e."description",
  e."amountCents",
  e."category",
  e."type",
  e."essential",
  CAST(strftime('%d', e."dueDate") AS INTEGER),
  (SELECT MIN(CAST(strftime('%Y%m', x."dueDate") AS INTEGER)) FROM "Expense" x WHERE x."userId" = e."userId" AND x."recurrenceKey" = e."recurrenceKey"),
  NULL,
  NULL,
  '',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM "Expense" e
WHERE e."recurring" = 1
  AND e."recurrenceKey" IS NOT NULL
  AND e."dueDate" = (SELECT MAX(y."dueDate") FROM "Expense" y WHERE y."userId" = e."userId" AND y."recurrenceKey" = e."recurrenceKey");

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueDate" DATETIME NOT NULL,
    "paidAt" DATETIME,
    "essential" BOOLEAN NOT NULL DEFAULT true,
    "seriesId" TEXT,
    "installmentNumber" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "ExpenseSeries" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("amountCents", "category", "createdAt", "description", "dueDate", "essential", "id", "paidAt", "status", "type", "updatedAt", "userId", "seriesId") SELECT "amountCents", "category", "createdAt", "description", "dueDate", "essential", "id", "paidAt", "status", "type", "updatedAt", "userId", CASE WHEN "recurring" = 1 THEN "recurrenceKey" END FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE INDEX "Expense_seriesId_dueDate_idx" ON "Expense"("seriesId", "dueDate");
CREATE INDEX "Expense_userId_dueDate_idx" ON "Expense"("userId", "dueDate");
CREATE INDEX "Expense_userId_type_status_idx" ON "Expense"("userId", "type", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ExpenseSeries_userId_idx" ON "ExpenseSeries"("userId");

