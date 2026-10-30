import { redirect } from "next/navigation";

/** Expenses now lives on Operations. Old links keep working. */
export default function ExpensesPage() {
  redirect("/operations?tab=expenses");
}
