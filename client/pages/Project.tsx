import Layout from "@/components/Layout";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import { toast } from "sonner";
import {
  createProjectCost,
  createProjectSale,
  deleteProject,
  loadProjectSnapshot,
} from "@/services/accounting";
import type {
  ProjectCost,
  ProjectSale,
  ProjectSnapshot,
} from "@shared/accounting";

const today = () => new Date().toLocaleDateString("en-CA");

export default function ProjectPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user?.role === "manager" || user?.role === "accountant";

  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const makeNewCostState = () => ({
    type: "construction" as ProjectCost["type"],
    amount: "",
    date: today(),
    note: "",
    customTypeLabel: "",
  });
  const [newCost, setNewCost] = useState(makeNewCostState);
  const [savingCost, setSavingCost] = useState(false);

  const [newSale, setNewSale] = useState({
    unitNo: "",
    buyer: "",
    price: "",
    date: today(),
    terms: "",
    area: "",
    paymentMethod: "كاش",
  });
  const [savingSale, setSavingSale] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const s = await loadProjectSnapshot(id);
        if (alive) setSnapshot(s);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "فشل التحميل";
        setError(msg);
        toast.error("تعذر تحميل المشروع", { description: msg });
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [id]);

  const totals = useMemo(() => {
    const costs = snapshot?.costs.reduce((a, b) => a + b.amount, 0) ?? 0;
    const sales = snapshot?.sales.reduce((a, b) => a + b.price, 0) ?? 0;
    return { costs, sales, profit: sales - costs };
  }, [snapshot]);

  const addCost = async () => {
    if (!snapshot || !id) return;
    if (!newCost.amount) return toast.error("المبلغ مطلوب");
    const amount = Number(newCost.amount);
    if (!Number.isFinite(amount) || amount <= 0)
      return toast.error("قيمة غير صحيحة");
    const customTypeLabel =
      newCost.type === "other" ? newCost.customTypeLabel.trim() : undefined;
    if (newCost.type === "other" && !customTypeLabel) {
      return toast.error("يرجى إدخال نوع التكلفة");
    }
    try {
      setSavingCost(true);
      const res = await createProjectCost({
        projectId: id,
        projectName: snapshot.project.name,
        type: newCost.type,
        customTypeLabel,
        amount,
        date: newCost.date,
        note: newCost.note,
        approved: canManage,
        createdBy: user?.id ?? null,
      });
      setSnapshot((prev) =>
        prev ? { ...prev, costs: [res.cost, ...prev.costs] } : prev,
      );
      setNewCost(makeNewCostState());
      toast.success("تم تسجيل التكلفة");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذر التسجيل";
      toast.error("فشل تسجيل التكلفة", { description: msg });
    } finally {
      setSavingCost(false);
    }
  };

  const addSale = async () => {
    if (!snapshot || !id) return;
    if (!newSale.unitNo || !newSale.buyer || !newSale.price)
      return toast.error("��كمل بيانات البيع");
    const price = Number(newSale.price);
    if (!Number.isFinite(price) || price <= 0)
      return toast.error("قيمة غير صحيحة");
    try {
      setSavingSale(true);
      const res = await createProjectSale({
        projectId: id,
        projectName: snapshot.project.name,
        unitNo: newSale.unitNo,
        buyer: newSale.buyer,
        price,
        date: newSale.date,
        terms: newSale.terms || null,
        area: newSale.area || null,
        paymentMethod: newSale.paymentMethod || null,
        approved: canManage,
        createdBy: user?.id ?? null,
      });
      setSnapshot((prev) =>
        prev ? { ...prev, sales: [res.sale, ...prev.sales] } : prev,
      );
      setNewSale({
        unitNo: "",
        buyer: "",
        price: "",
        date: today(),
        terms: "",
        area: "",
        paymentMethod: "كاش",
      });
      toast.success("تم تسجيل البيع وإصدار الفاتورة");
      printInvoice(res.sale.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذر التسجيل";
      toast.error("فشل تسجيل البيع", { description: msg });
    } finally {
      setSavingSale(false);
    }
  };

  const printInvoice = (saleId: string) => {
    const sale = snapshot?.sales.find((s) => s.id === saleId);
    if (!sale || !snapshot) return;
    const p = snapshot.project;
    const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>فاتورة</title>
      <style>body{font-family:Arial,system-ui;padding:24px} h1{font-size:20px;margin-bottom:12px}
      table{width:100%;border-collapse:collapse;margin-top:12px} th,td{border:1px solid #ddd;padding:8px} th{background:#f1f5f9}</style>
    </head><body>
      <h1>فاتورة بيع وحدة</h1>
      <div>المشروع: <strong>${p.name}</strong> — الموقع: ${p.location}</div>
      <div>التاريخ: ${sale.date}</div>
      <table><thead><tr><th>الوحدة</th><th>المشتري</th><th>المساحة</th><th>طريقة الدفع</th><th>السعر</th></tr></thead>
        <tbody><tr><td>${sale.unitNo}</td><td>${sale.buyer}</td><td>${sale.area ?? "-"}</td><td>${sale.paymentMethod ?? "-"}</td><td>${sale.price.toLocaleString()} ج.م</td></tr></tbody>
      </table>
      <script>window.print()</script>
    </body></html>`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

  const handleDelete = async () => {
    if (!id) return;
    if (!confirm("هل أنت متأكد من حذف المشروع؟")) return;
    try {
      setDeleting(true);
      await deleteProject(id);
      toast.success("تم حذف المشروع");
      navigate("/dashboard", { replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذر الحذف";
      toast.error("فشل حذف المشروع", { description: msg });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-6">جارٍ التحميل...</div>
      </Layout>
    );
  }

  if (error || !snapshot) {
    return (
      <Layout>
        <div className="p-6">تعذر العثو�� على المشروع</div>
      </Layout>
    );
  }

  const getCostTypeLabel = (cost: ProjectCost) => {
    if (cost.customTypeLabel && cost.customTypeLabel.trim()) {
      return cost.customTypeLabel;
    }
    if (cost.type === "construction") return "إنشاء";
    if (cost.type === "operation") return "تشغيل";
    if (cost.type === "expense") return "مصروفات";
    return "أخرى";
  };

  const p = snapshot.project;

  return (
    <Layout>
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold">{p.name}</h1>
            <div className="text-slate-600 text-sm">{p.location}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-md border px-3 py-2"
              onClick={() => navigate(-1)}
            >
              رجوع
            </button>
            <button
              className="rounded-md bg-red-600 text-white px-3 py-2 disabled:opacity-50"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting ? "حذف..." : "حذف المشروع"}
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow">
            <h3 className="font-semibold mb-3">تسجيل تكلفة للمشروع</h3>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <select
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  value={newCost.type}
                  onChange={(e) => {
                    const value = e.target.value as ProjectCost["type"];
                    setNewCost((prev) => ({
                      ...prev,
                      type: value,
                      customTypeLabel: value === "other" ? prev.customTypeLabel : "",
                    }));
                  }}
                >
                  <option value="construction">إنشاء</option>
                  <option value="operation">تشغيل</option>
                  <option value="expense">مصروفات</option>
                  <option value="other">أخرى</option>
                </select>
                <input
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  placeholder="المبلغ"
                  value={newCost.amount}
                  onChange={(e) =>
                    setNewCost({ ...newCost, amount: e.target.value })
                  }
                />
              </div>
              {newCost.type === "other" ? (
                <input
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  placeholder="حدد نوع التكلفة"
                  value={newCost.customTypeLabel}
                  onChange={(e) =>
                    setNewCost((prev) => ({
                      ...prev,
                      customTypeLabel: e.target.value,
                    }))
                  }
                />
              ) : null}
              <input
                type="date"
                className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                value={newCost.date}
                onChange={(e) =>
                  setNewCost({ ...newCost, date: e.target.value })
                }
              />
              <input
                className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                placeholder="ملاحظة"
                value={newCost.note}
                onChange={(e) =>
                  setNewCost({ ...newCost, note: e.target.value })
                }
              />
              <div className="flex gap-2">
                <button
                  onClick={() => void addCost()}
                  disabled={savingCost}
                  className="rounded-md bg-slate-900 px-4 py-2 text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingCost ? "جاري التسجيل..." : "تسجيل التكلفة"}
                </button>
                <button
                  onClick={() => setNewCost(makeNewCostState())}
                  className="rounded-md border px-3 py-2 bg-white"
                >
                  إعادة تعيين
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow">
            <h3 className="font-semibold mb-3">تسجيل بيع وإصدار فاتورة</h3>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  placeholder="رقم الوحدة"
                  value={newSale.unitNo}
                  onChange={(e) =>
                    setNewSale({ ...newSale, unitNo: e.target.value })
                  }
                />
                <input
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  placeholder="السعر"
                  value={newSale.price}
                  onChange={(e) =>
                    setNewSale({ ...newSale, price: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  placeholder="اسم المشتري"
                  value={newSale.buyer}
                  onChange={(e) =>
                    setNewSale({ ...newSale, buyer: e.target.value })
                  }
                />
                <input
                  type="date"
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  value={newSale.date}
                  onChange={(e) =>
                    setNewSale({ ...newSale, date: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  placeholder="المساحة (م²)"
                  value={newSale.area}
                  onChange={(e) =>
                    setNewSale({ ...newSale, area: e.target.value })
                  }
                />
                <select
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  value={newSale.paymentMethod}
                  onChange={(e) =>
                    setNewSale({ ...newSale, paymentMethod: e.target.value })
                  }
                >
                  <option value="كاش">كاش</option>
                  <option value="تقسيط">تقسيط</option>
                </select>
              </div>

              <input
                className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                placeholder="شروط التعاقد (اختياري)"
                value={newSale.terms}
                onChange={(e) =>
                  setNewSale({ ...newSale, terms: e.target.value })
                }
              />
              <div className="flex gap-2">
                <button
                  onClick={() => void addSale()}
                  disabled={savingSale}
                  className="rounded-md bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingSale ? "جاري التسجيل..." : "تسجيل البيع + فاتورة"}
                </button>
                <button
                  onClick={() =>
                    setNewSale({
                      unitNo: "",
                      buyer: "",
                      price: "",
                      date: today(),
                      terms: "",
                    })
                  }
                  className="rounded-md border px-3 py-2 bg-white"
                >
                  إعادة تعيين
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow">
            <h3 className="font-semibold mb-3">التكاليف</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left bg-slate-50">
                    <th className="px-3 py-2">التاريخ</th>
                    <th className="px-3 py-2">النوع</th>
                    <th className="px-3 py-2">المبلغ</th>
                    <th className="px-3 py-2">ملاحظة</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.costs.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="px-3 py-2">{c.date}</td>
                      <td className="px-3 py-2">
                        {c.type === "construction"
                          ? "إنشاء"
                          : c.type === "operation"
                            ? "تشغيل"
                            : "مصروفات"}
                      </td>
                      <td className="px-3 py-2">{c.amount.toLocaleString()}</td>
                      <td className="px-3 py-2">{c.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow">
            <h3 className="font-semibold mb-3">المبيعات</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left bg-slate-50">
                    <th className="px-3 py-2">التاريخ</th>
                    <th className="px-3 py-2">الوحدة</th>
                    <th className="px-3 py-2">المشتري</th>
                    <th className="px-3 py-2">المساحة</th>
                    <th className="px-3 py-2">طريقة الدفع</th>
                    <th className="px-3 py-2">السعر</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.sales.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="px-3 py-2">{s.date}</td>
                      <td className="px-3 py-2">{s.unitNo}</td>
                      <td className="px-3 py-2">{s.buyer}</td>
                      <td className="px-3 py-2">{s.area ?? "-"}</td>
                      <td className="px-3 py-2">{s.paymentMethod ?? "-"}</td>
                      <td className="px-3 py-2">{s.price.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          className="rounded-md bg-slate-900 text-white px-3 py-1"
                          onClick={() => printInvoice(s.id)}
                        >
                          فاتورة
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="rounded-lg border p-4 bg-white">
          <div className="font-semibold">ملخص</div>
          <div className="grid grid-cols-3 gap-4 mt-2 text-sm">
            <div>
              <div className="text-slate-500">التكاليف</div>
              <div className="font-bold">
                {totals.costs.toLocaleString()} ج.م
              </div>
            </div>
            <div>
              <div className="text-slate-500">المبيعات</div>
              <div className="font-bold">
                {totals.sales.toLocaleString()} ج.م
              </div>
            </div>
            <div>
              <div className="text-slate-500">الربح</div>
              <div className="font-bold">
                {totals.profit.toLocaleString()} ج.م
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
