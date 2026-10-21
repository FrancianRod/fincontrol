-- CreateEnum
CREATE TYPE "IncomeType" AS ENUM ('SALARY', 'FREELANCE', 'YIELD', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseType" AS ENUM ('FIXED', 'VARIABLE');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('PAID', 'PENDING');

-- CreateEnum
CREATE TYPE "InvestmentTxType" AS ENUM ('APORTE', 'RESGATE', 'RENDIMENTO');

-- CreateEnum
CREATE TYPE "RecurrenceMode" AS ENUM ('CONTINUOUS', 'INSTALLMENTS');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('STOCKS', 'REITS', 'FIXED_INCOME', 'EMERGENCY_RESERVE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "variableBudgetCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Income" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "type" "IncomeType" NOT NULL DEFAULT 'SALARY',
    "date" TIMESTAMP(3) NOT NULL,
    "received" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Income_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "type" "ExpenseType" NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "essential" BOOLEAN NOT NULL DEFAULT true,
    "seriesId" TEXT,
    "installmentNumber" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Investment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "institution" TEXT,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "monthlyContributionCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Investment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLetter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "administrator" TEXT,
    "creditValueCents" INTEGER NOT NULL,
    "totalInstallments" INTEGER,
    "correctedCreditCents" INTEGER,
    "paidCents" INTEGER NOT NULL DEFAULT 0,
    "outstandingCents" INTEGER NOT NULL,
    "installmentCents" INTEGER NOT NULL,
    "paidInstallments" INTEGER NOT NULL DEFAULT 0,
    "dueDay" INTEGER NOT NULL DEFAULT 10,
    "contemplated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLetterPeriod" (
    "id" TEXT NOT NULL,
    "creditLetterId" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "correctedCreditCents" INTEGER,
    "paidCents" INTEGER NOT NULL,
    "outstandingCents" INTEGER NOT NULL,
    "installmentCents" INTEGER NOT NULL,
    "paidInstallments" INTEGER NOT NULL,
    "installmentPaid" BOOLEAN NOT NULL DEFAULT false,
    "installmentPaidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditLetterPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentTransaction" (
    "id" TEXT NOT NULL,
    "investmentId" TEXT NOT NULL,
    "type" "InvestmentTxType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseSeries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "RecurrenceMode" NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "type" "ExpenseType" NOT NULL,
    "essential" BOOLEAN NOT NULL DEFAULT true,
    "dueDay" INTEGER NOT NULL,
    "startPeriod" INTEGER NOT NULL,
    "endPeriod" INTEGER,
    "totalInstallments" INTEGER,
    "skippedPeriods" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseSeries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Income_userId_date_idx" ON "Income"("userId", "date");

-- CreateIndex
CREATE INDEX "Expense_seriesId_dueDate_idx" ON "Expense"("seriesId", "dueDate");

-- CreateIndex
CREATE INDEX "Expense_userId_dueDate_idx" ON "Expense"("userId", "dueDate");

-- CreateIndex
CREATE INDEX "Expense_userId_type_status_idx" ON "Expense"("userId", "type", "status");

-- CreateIndex
CREATE INDEX "Investment_userId_assetType_idx" ON "Investment"("userId", "assetType");

-- CreateIndex
CREATE UNIQUE INDEX "CreditLetterPeriod_creditLetterId_period_key" ON "CreditLetterPeriod"("creditLetterId", "period");

-- CreateIndex
CREATE INDEX "InvestmentTransaction_investmentId_date_idx" ON "InvestmentTransaction"("investmentId", "date");

-- CreateIndex
CREATE INDEX "ExpenseSeries_userId_idx" ON "ExpenseSeries"("userId");

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "ExpenseSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLetter" ADD CONSTRAINT "CreditLetter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLetterPeriod" ADD CONSTRAINT "CreditLetterPeriod_creditLetterId_fkey" FOREIGN KEY ("creditLetterId") REFERENCES "CreditLetter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentTransaction" ADD CONSTRAINT "InvestmentTransaction_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseSeries" ADD CONSTRAINT "ExpenseSeries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
