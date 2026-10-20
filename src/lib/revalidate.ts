import "server-only";
import { revalidatePath } from "next/cache";

/** Qualquer mudança afeta o dashboard e as listas: revalida todas as rotas. */
export function revalidateApp() {
  revalidatePath("/", "layout");
}
