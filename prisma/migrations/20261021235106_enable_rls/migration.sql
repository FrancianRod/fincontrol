-- Ativa Row Level Security em todas as tabelas do schema public, sem políticas.
-- Efeito: a API pública do Supabase (PostgREST com as chaves anon/authenticated)
-- não lê nem grava nada. O app usa o Prisma conectado como `postgres`, que tem
-- BYPASSRLS, então continua funcionando normalmente.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Income" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Expense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExpenseSeries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Investment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvestmentTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreditLetter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreditLetterPeriod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
