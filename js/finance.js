function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function monthKey(dateStr) {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function monthRange(monthsBefore, monthsAfter) {
  const now = new Date();
  const keys = [];
  for (let i = -monthsBefore; i <= monthsAfter; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

function formatMoney(amount) {
  return Number(amount).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

async function fetchProjects() {
  const { data, error } = await supabaseClient.from("projects").select("id, name").order("name");
  if (error) throw error;
  return data;
}

async function fetchPayments() {
  const { data, error } = await supabaseClient
    .from("payments")
    .select("id, project_id, amount, due_date, paid_date, note, created_at, projects(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

async function fetchExpenses() {
  const { data, error } = await supabaseClient
    .from("expenses")
    .select("id, expense_date, category, description, amount, recurring")
    .order("expense_date", { ascending: false });
  if (error) throw error;
  return data;
}

function renderMonthlyOverview(payments, expenses) {
  const months = monthRange(2, 3);

  const rows = months.map((key) => {
    const expected = payments
      .filter((p) => !p.paid_date && p.due_date && monthKey(p.due_date) === key)
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const received = payments
      .filter((p) => p.paid_date && monthKey(p.paid_date) === key)
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const spent = expenses
      .filter((e) => monthKey(e.expense_date) === key)
      .reduce((sum, e) => sum + Number(e.amount), 0);
    return { key, expected, received, spent, net: received - spent };
  });

  const body = document.getElementById("overview-body");
  body.replaceChildren(
    ...rows.map((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${monthLabel(row.key)}</td>
        <td>${formatMoney(row.expected)}</td>
        <td>${formatMoney(row.received)}</td>
        <td>${formatMoney(row.spent)}</td>
        <td>${formatMoney(row.net)}</td>
      `;
      return tr;
    })
  );
}

function renderPaymentsByProject(projects, payments) {
  const rows = projects
    .map((project) => {
      const projectPayments = payments.filter((p) => p.project_id === project.id);
      const expected = projectPayments
        .filter((p) => !p.paid_date)
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const received = projectPayments
        .filter((p) => p.paid_date)
        .reduce((sum, p) => sum + Number(p.amount), 0);
      return { name: project.name, expected, received };
    })
    .filter((row) => row.expected > 0 || row.received > 0);

  const body = document.getElementById("project-payments-body");
  if (rows.length === 0) {
    body.innerHTML = '<tr><td colspan="3" class="lead-detail-contact">No payments logged yet.</td></tr>';
    return;
  }
  body.replaceChildren(
    ...rows.map((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${row.name}</td><td>${formatMoney(row.expected)}</td><td>${formatMoney(row.received)}</td>`;
      return tr;
    })
  );
}

function renderPaymentsList(payments) {
  const list = document.getElementById("payments-list");
  if (payments.length === 0) {
    list.innerHTML = '<p class="lead-detail-contact">No payments yet.</p>';
    return;
  }
  list.replaceChildren(
    ...payments.slice(0, 15).map((payment) => {
      const row = document.createElement("div");
      row.className = "entry-row";
      const status = payment.paid_date ? `Received ${payment.paid_date}` : payment.due_date ? `Due ${payment.due_date}` : "Expected";
      row.innerHTML = `
        <span class="entry-date">${status}</span>
        <span class="entry-project">${payment.projects?.name || "—"}</span>
        <span class="entry-hours">${formatMoney(payment.amount)}</span>
        <span class="entry-note">${payment.note || ""}</span>
        <button type="button" class="btn btn-secondary payment-delete" data-id="${payment.id}">Delete</button>
      `;
      row.querySelector(".payment-delete").addEventListener("click", () => deletePayment(payment.id));
      return row;
    })
  );
}

function renderExpensesList(expenses) {
  const list = document.getElementById("expenses-list");
  if (expenses.length === 0) {
    list.innerHTML = '<p class="lead-detail-contact">No expenses yet.</p>';
    return;
  }
  list.replaceChildren(
    ...expenses.slice(0, 15).map((expense) => {
      const row = document.createElement("div");
      row.className = "entry-row";
      row.innerHTML = `
        <span class="entry-date">${expense.expense_date}</span>
        <span class="entry-project">${expense.category || "—"}${expense.recurring ? " (recurring)" : ""}</span>
        <span class="entry-hours">${formatMoney(expense.amount)}</span>
        <span class="entry-note">${expense.description || ""}</span>
        <button type="button" class="btn btn-secondary expense-delete" data-id="${expense.id}">Delete</button>
      `;
      row.querySelector(".expense-delete").addEventListener("click", () => deleteExpense(expense.id));
      return row;
    })
  );
}

async function deletePayment(id) {
  const { error } = await supabaseClient.from("payments").delete().eq("id", id);
  if (error) {
    alert(`Couldn't delete payment: ${error.message}`);
    return;
  }
  await refresh();
}

async function deleteExpense(id) {
  const { error } = await supabaseClient.from("expenses").delete().eq("id", id);
  if (error) {
    alert(`Couldn't delete expense: ${error.message}`);
    return;
  }
  await refresh();
}

let projectsCache = [];

async function refresh() {
  const [payments, expenses] = await Promise.all([fetchPayments(), fetchExpenses()]);
  renderMonthlyOverview(payments, expenses);
  renderPaymentsByProject(projectsCache, payments);
  renderPaymentsList(payments);
  renderExpensesList(expenses);
}

async function init() {
  document.getElementById("expense-date").value = toISODate(new Date());

  projectsCache = await fetchProjects();
  const select = document.getElementById("payment-project-select");
  select.replaceChildren(
    ...projectsCache.map((p) => {
      const option = document.createElement("option");
      option.value = p.id;
      option.textContent = p.name;
      return option;
    })
  );

  document.getElementById("payment-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const { error } = await supabaseClient.from("payments").insert({
      project_id: formData.get("projectId"),
      amount: formData.get("amount"),
      due_date: formData.get("dueDate") || null,
      paid_date: formData.get("paidDate") || null,
      note: formData.get("note") || null,
    });
    if (error) {
      alert(`Couldn't log payment: ${error.message}`);
      return;
    }
    event.target.reset();
    await refresh();
  });

  document.getElementById("expense-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const { error } = await supabaseClient.from("expenses").insert({
      expense_date: formData.get("expenseDate"),
      category: formData.get("category") || null,
      description: formData.get("description") || null,
      amount: formData.get("amount"),
      recurring: formData.get("recurring") === "on",
    });
    if (error) {
      alert(`Couldn't log expense: ${error.message}`);
      return;
    }
    event.target.reset();
    document.getElementById("expense-date").value = toISODate(new Date());
    await refresh();
  });

  await refresh();
}

init().catch((error) => {
  console.error("Failed to load finance data:", error);
  document.querySelector(".app-main").innerHTML +=
    '<p style="color: var(--color-danger);">Couldn\'t load finance data. Check the console for details.</p>';
});
