// Wave 59A: search/filter helpers, CSV/JSON export, deterministic offline AI over own records.
// No provider calls: all AI endpoints are deterministic and labelled aiGenerated:false.
export function filterRecords(rows, { q = "", status = "", risk = "" } = {}) {
  const needle = String(q || "").trim().toLowerCase();
  return (rows || []).filter((r) => {
    if (status && String(r.status || "") !== status) return false;
    if (risk && String(r.risk || "") !== risk) return false;
    if (!needle) return true;
    const hay = [r.reference, r.title, r.status, r.owner, r.risk, r.feature_id, JSON.stringify(r.payload ?? "")].join(" ").toLowerCase();
    return hay.includes(needle);
  });
}
export function toCsv(rows, columns) {
  const esc = (v) => { if (v === null || v === undefined) return ""; const s = typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const head = columns.join(",");
  const body = (rows || []).map((r) => columns.map((c) => esc(r[c])).join(",")).join("\n");
  return head + "\n" + body + (body ? "\n" : "");
}
export const EXPORT_COLUMNS = ["id","feature_id","reference","title","status","owner","risk","due_date","amount","created_at","updated_at"];
function money(n){ return Number(n||0); }
export function buildInsights(records, feature, kind) {
  const rows = records || [];
  const total = rows.reduce((s,r)=>s+money(r.amount),0);
  const open = rows.filter(r=>!["Approved","Closed"].includes(String(r.status||""))).length;
  const high = rows.filter(r=>["High","Critical"].includes(String(r.risk||""))).length;
  const closed = rows.filter(r=>String(r.status||"")==="Closed").length;
  const zeroAmount = rows.filter(r=>money(r.amount)===0).length;
  // Preserve false/0/empty explicitly in labelled sections.
  const base = { aiGenerated:false, fallback:true, source:"deterministic-fallback", label:"Deterministic fallback (offline) — not AI-generated", featureId:feature?.id||null, featureTitle:feature?.title||null, kind, recordCount:rows.length };
  if (kind === "risk-triage") return { ...base, headline:`${feature?.title||"Domain"} — risk triage (deterministic fallback)`, sections:[{label:"Record count",value:rows.length,detail:`${rows.length} record(s) in scope.`},{label:"High or critical risk",value:high,detail:`${high} record(s) flagged High/Critical.`},{label:"Open items",value:open,detail:`${open} record(s) not yet Approved/Closed.`},{label:"Zero-amount records preserved",value:zeroAmount,detail:`${zeroAmount} record(s) carry amount 0 and are retained, not dropped.`}], metrics:[{label:"Records",value:rows.length},{label:"High risk",value:high},{label:"Open",value:open},{label:"Closed",value:closed}], actions: high>0?["Review High/Critical records first","Assign owners to open items"]:["No high-risk records; continue routine review"] };
  if (kind === "next-actions") return { ...base, headline:`${feature?.title||"Domain"} — next actions (deterministic fallback)`, sections:[{label:"Total represented value",value:total,detail:`Sum of amounts across ${rows.length} record(s): ${total}.`},{label:"Closed records",value:closed,detail:`${closed} record(s) Closed.`},{label:"Has open work",value:open>0,detail:open>0?`${open} open record(s) need follow-up.`:"No open records."},{label:"Empty result preserved",value:rows.length===0,detail:rows.length===0?"No records matched; empty set is reported explicitly.":"Records present."}], metrics:[{label:"Total value",value:total},{label:"Open",value:open},{label:"Closed",value:closed}], actions: open>0?["Work open records in due-date order","Validate evidence for high-value items"]:["No pending actions from current records"] };
  return { ...base, headline:`${feature?.title||"Domain"} — portfolio summary (deterministic fallback)`, sections:[{label:"Record count",value:rows.length,detail:`${rows.length} record(s) summarised.`},{label:"Total represented value",value:total,detail:`Total amount ${total} across scope.`},{label:"Open items",value:open,detail:`${open} open; ${closed} closed.`},{label:"Zero-amount records preserved",value:zeroAmount,detail:`Zero values are preserved (count ${zeroAmount}), not hidden.`}], metrics:[{label:"Records",value:rows.length},{label:"Total value",value:total},{label:"Open",value:open},{label:"High risk",value:high}], actions:["Validate supporting documents","Assign exceptions to accountable owners"] };
}
export function mountWave59a(app, { pool, auth, featureById }) {
  const guard = auth;
  app.get("/api/features/:id/records/export", guard, async (req, res, next) => {
    try { const feature = featureById(req.params.id); const rows = (await pool.query("SELECT * FROM feature_records WHERE feature_id=$1 ORDER BY updated_at DESC,id DESC", [feature.id])).rows; const filtered = filterRecords(rows, req.query||{}); const format = String(req.query.format||"json").toLowerCase();
      if (format === "csv") { res.setHeader("Content-Type","text/csv; charset=utf-8"); res.setHeader("Content-Disposition",`attachment; filename="${feature.id}-records.csv"`); return res.send(toCsv(filtered, EXPORT_COLUMNS)); }
      return res.json({ aiGenerated:false, featureId:feature.id, count:filtered.length, items:filtered });
    } catch(e){ next(e); }
  });
  for (const kind of ["portfolio-summary","risk-triage","next-actions"]) {
    app.post(`/api/features/:id/ai/${kind}`, guard, async (req, res, next) => {
      try { const feature = featureById(req.params.id); const rows = (await pool.query("SELECT * FROM feature_records WHERE feature_id=$1 ORDER BY updated_at DESC,id DESC LIMIT 500", [feature.id])).rows; return res.json({ result: buildInsights(rows, feature, kind) }); } catch(e){ next(e); }
    });
  }
}
