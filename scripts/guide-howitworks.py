"""Builds the "How it works" chapter of docs/guide.html: plain-English text plus inline SVG charts.

Every number here is taken from the engine (src/lib/engine/*) and the demo cases after a reset
(Replay mode), so the worked examples match what the app shows. Run:  python3 scripts/guide-howitworks.py
"""
import re
from pathlib import Path

GUIDE = Path(__file__).resolve().parent.parent / "docs" / "guide.html"

NAVY, BRASS, BRASS2, SOFT = "#142B45", "#B08A4A", "#D9B97A", "#F5EEDF"
INK, INK2, MUTED, FAINT, LINE, CANVAS = "#16202C", "#3A4655", "#6B7480", "#9AA1AA", "#E7E3DA", "#F7F5F0"
OK, WARN, BAD = "#2F7A53", "#A8741E", "#A63A2A"
AGENT = {"Sales": "#a86b3c", "Finance": "#3f7d5b", "Operations": "#4f6d8a", "Legal": "#7a5c2a"}
FONT = "font-family:Inter,Helvetica,Arial,sans-serif"


def t(x, y, s, size=10, color=INK, weight=400, anchor="start", italic=False):
    st = f"font-style:italic;" if italic else ""
    return f'<text x="{x}" y="{y}" style="{FONT};font-size:{size}px;font-weight:{weight};{st}" fill="{color}" text-anchor="{anchor}">{s}</text>'


def svg(w, h, body, label):
    return f'<svg viewBox="0 0 {w} {h}" width="100%" role="img" aria-label="{label}" xmlns="http://www.w3.org/2000/svg">{body}</svg>'


def arrow(x1, y, x2, color=FAINT):
    return (f'<line x1="{x1}" y1="{y}" x2="{x2 - 5}" y2="{y}" stroke="{color}" stroke-width="1.4"/>'
            f'<path d="M{x2 - 6},{y - 4} L{x2},{y} L{x2 - 6},{y + 4}" fill="none" stroke="{color}" stroke-width="1.4"/>')


# ---------------------------------------------------------------- 1. pipeline
def pipeline():
    steps = [
        ("1 · Facts", ["Sales history, inventory,", "distribution centers,", "costs and 180 legal rules"], "#fff", INK),
        ("2 · Tools compute", ["Fixed formulas work out", "every number and give it", "an evidence ID"], "#fff", INK),
        ("3 · AI judges", ["Reads the evidence and its", "department’s policy, then", "answers in a fixed form"], SOFT, INK),
        ("4 · Guardrails check", ["Fake citations removed;", "hard limits and caps", "enforced"], "#fff", INK),
        ("5 · The answer", ["Recommendation,", "confidence, risk, conditions", "and the evidence used"], NAVY, "#F4F1EA"),
    ]
    w, gap, x = 124, 20, 2
    out = []
    for i, (title, lines, fill, color) in enumerate(steps):
        stroke = BRASS if fill == SOFT else (NAVY if fill == NAVY else LINE)
        out.append(f'<rect x="{x}" y="4" width="{w}" height="92" rx="10" fill="{fill}" stroke="{stroke}"/>')
        out.append(t(x + 10, 24, title, 10.5, color, 600))
        for j, ln in enumerate(lines):
            out.append(t(x + 10, 44 + j * 14, ln, 8.6, MUTED if fill != NAVY else "#C3CAD3"))
        if i < len(steps) - 1:
            out.append(arrow(x + w + 3, 50, x + w + gap - 2))
        x += w + gap
    return svg(x - gap + 4, 100, "".join(out), "One agent run: facts, tools, AI, guardrails, answer")


# ---------------------------------------------------------------- 2. sales: units vs revenue (D-2026-003)
def sales_chart():
    rows = [("Units sold", 100, 141.9, "+42%"), ("Revenue", 100, 102.2, "+2%")]
    out, y = [], 22
    scale = 1.2
    out.append(t(0, 10, "D-2026-003 over 4 weeks (normal price = 100)", 8.6, MUTED))
    for label, base, promo, delta in rows:
        out.append(t(0, y + 13, label, 9.5, INK, 600))
        out.append(f'<rect x="74" y="{y}" width="{base * scale}" height="11" rx="2" fill="{LINE}"/>')
        out.append(t(74 + base * scale + 5, y + 9, "normal price", 8, MUTED))
        out.append(f'<rect x="74" y="{y + 14}" width="{promo * scale}" height="11" rx="2" fill="{AGENT["Sales"]}"/>')
        out.append(t(74 + promo * scale + 5, y + 23, f"28% off: {delta}", 8.4, AGENT["Sales"], 600))
        y += 40
    return svg(330, y - 6, "".join(out), "Units up 42 percent, revenue up only 2 percent")


# ---------------------------------------------------------------- 3. finance waterfall (D-2026-003)
def finance_chart():
    items = [
        ("Lost margin on", "promoted items", -1.268),
        ("Extra profit,", "rest of basket", +0.132),
        ("Running the", "promotion", -0.011),
        ("Extra labor,", "delivery, stock", -0.132),
    ]
    top, scale, bw, gap, x0 = 24, 92, 46, 12, 8  # scale: px per $1M
    out = [t(0, 10, "D-2026-003: where the $1.28M loss comes from", 8.6, MUTED)]
    out.append(f'<line x1="0" y1="{top}" x2="330" y2="{top}" stroke="{INK}" stroke-width="0.8"/>')
    out.append(t(328, top - 3, "$0", 8, MUTED, anchor="end"))
    run, x = 0.0, x0
    for a, b, v in items:
        y1, y2 = top - run * scale, top - (run + v) * scale
        color = OK if v > 0 else BAD
        h = max(1.5, abs(y2 - y1))
        out.append(f'<rect x="{x}" y="{min(y1, y2)}" width="{bw}" height="{h}" rx="2" fill="{color}" opacity="{0.85 if v < 0 else 0.9}"/>')
        out.append(t(x + bw / 2, max(y1, y2) + 11, f"{'+' if v > 0 else '−'}${abs(v):.2f}M", 8.2, color, 600, "middle"))
        out.append(t(x + bw / 2, 178, a, 7.8, INK2, anchor="middle"))
        out.append(t(x + bw / 2, 188, b, 7.8, INK2, anchor="middle"))
        nxt = x + bw + gap
        out.append(f'<line x1="{x + bw}" y1="{y2}" x2="{nxt}" y2="{y2}" stroke="{FAINT}" stroke-dasharray="2 2"/>')
        run += v
        x = nxt
    y = top - run * scale
    out.append(f'<rect x="{x}" y="{top}" width="{bw + 8}" height="{y - top}" rx="2" fill="{NAVY}"/>')
    out.append(t(x + (bw + 8) / 2, y + 11, "−$1.28M", 8.6, NAVY, 600, "middle"))
    out.append(t(x + (bw + 8) / 2, 178, "Net result", 7.8, INK, 600, "middle"))
    out.append(t(x + (bw + 8) / 2, 188, "(Reject)", 7.8, BAD, 600, "middle"))
    return svg(330, 192, "".join(out), "Finance waterfall: lost margin minus small gains equals a 1.28 million dollar loss")


# ---------------------------------------------------------------- 4. operations gauges (D-2026-003)
def ops_chart():
    rows = [("DC, busiest week", 94.5, 95, 112), ("Online fulfillment", 86.6, 98, 115), ("Store labor", 80.9, 95, None)]
    sx = lambda v: 108 + v * 1.7  # 0..120%
    out = [t(0, 10, "D-2026-003: projected load with the promotion", 8.6, MUTED)]
    y = 22
    for label, v, warn, stop in rows:
        out.append(t(0, y + 9, label, 8.8, INK))
        out.append(f'<rect x="{sx(0)}" y="{y}" width="{sx(120) - sx(0)}" height="11" rx="2" fill="{CANVAS}" stroke="{LINE}"/>')
        out.append(f'<rect x="{sx(0)}" y="{y}" width="{sx(v) - sx(0)}" height="11" rx="2" fill="{AGENT["Operations"]}"/>')
        out.append(f'<line x1="{sx(warn)}" y1="{y - 3}" x2="{sx(warn)}" y2="{y + 14}" stroke="{WARN}" stroke-width="1.6"/>')
        if stop:
            out.append(f'<line x1="{sx(stop)}" y1="{y - 3}" x2="{sx(stop)}" y2="{y + 14}" stroke="{BAD}" stroke-width="1.6"/>')
        out.append(t(sx(v) - 4, y + 9, f"{v:.0f}%", 8, "#fff", 600, "end"))
        y += 24
    out.append(f'<line x1="{sx(0)}" y1="{y}" x2="{sx(0) + 10}" y2="{y}" stroke="{WARN}" stroke-width="2"/>')
    out.append(t(sx(0) + 14, y + 3, "warning: add a condition", 8, MUTED))
    out.append(f'<line x1="{sx(0) + 128}" y1="{y}" x2="{sx(0) + 138}" y2="{y}" stroke="{BAD}" stroke-width="2"/>')
    out.append(t(sx(0) + 142, y + 3, "hard stop: Hold", 8, MUTED))
    return svg(330, y + 8, "".join(out), "Operations load bars against warning and hard-stop lines")


# ---------------------------------------------------------------- 5. formula
def formula():
    boxes = [
        ("Agents’ confidence", "weighted by department", "91%"),
        ("Evidence complete", "share of data present", "100%"),
        ("Evidence fresh", "−12 points per stale source", "100%"),
        ("Agreement", "1 − disagreement penalty", "85%"),
    ]
    out, x, w = [], 0, 128
    for i, (a, b, ex) in enumerate(boxes):
        out.append(f'<rect x="{x}" y="6" width="{w}" height="70" rx="10" fill="#fff" stroke="{LINE}"/>')
        out.append(t(x + w / 2, 27, a, 10, INK, 600, "middle"))
        out.append(t(x + w / 2, 42, b, 8.2, MUTED, anchor="middle"))
        out.append(t(x + w / 2, 64, ex, 12, BRASS, 600, "middle"))
        x += w
        out.append(t(x + 10, 47, "×" if i < 3 else "=", 16, FAINT, 600, "middle"))
        x += 20
    out.append(f'<rect x="{x}" y="6" width="104" height="70" rx="10" fill="{NAVY}"/>')
    out.append(t(x + 52, 27, "Lighthouse", 10, "#F4F1EA", 600, "middle"))
    out.append(t(x + 52, 42, "confidence", 8.6, "#C3CAD3", anchor="middle"))
    out.append(t(x + 52, 64, "77%", 13, BRASS2, 600, "middle"))
    out.append(t(0, 94, "Brass figures: D-2026-003 before sign-off. Result kept between 15% and 95%.", 8.4, MUTED, italic=True))
    return svg(x + 106, 100, "".join(out), "Confidence formula: four factors multiplied")


# ---------------------------------------------------------------- 6. weights bar
def weights():
    parts = [("Finance", 30), ("Sales", 25), ("Operations", 25), ("Legal", 20)]
    out, x, W = [], 0, 700
    for name, p in parts:
        w = W * p / 100
        out.append(f'<rect x="{x}" y="4" width="{w - 2}" height="24" rx="4" fill="{AGENT[name]}"/>')
        out.append(t(x + 8, 20, f"{name} · {p}%", 10, "#fff", 600))
        x += w
    return svg(W, 32, "".join(out), "Department weights: Finance 30, Sales 25, Operations 25, Legal 20 percent")


# ---------------------------------------------------------------- 7. worked example stacked bars
def stacked():
    rows = [
        ("Before sign-off", [("Finance", 28.5), ("Sales", 22.5), ("Operations", 23.0), ("Legal", 17.0)], 91.0, 77, "Hold", "×0.85 for material disagreement"),
        ("After David signs", [("Finance", 24.2), ("Sales", 22.5), ("Operations", 23.0), ("Legal", 17.0)], 86.7, 82, "Proceed with conditions", "×0.95 for minor disagreement"),
    ]
    sx = lambda v: 112 + v * 4.5
    out = []
    y = 6
    for label, parts, total, final, rec, note in rows:
        out.append(t(0, y + 15, label, 9.6, INK, 600))
        x = sx(0)
        for name, v in parts:
            w = v * 4.5
            out.append(f'<rect x="{x}" y="{y}" width="{w - 1.5}" height="22" fill="{AGENT[name]}"/>')
            out.append(t(x + w / 2, y + 15, f"{v:g}", 8.6, "#fff", 600, "middle"))
            x += w
        # lost to disagreement: hatched from final to total
        out.append(f'<rect x="{sx(final)}" y="{y - 3}" width="{sx(total) - sx(final)}" height="28" fill="url(#hatch)" stroke="{BAD}" stroke-width="0.8"/>')
        out.append(t(sx(total) + 6, y + 9, f"{total:g}% weighted", 8.4, MUTED))
        out.append(t(sx(total) + 6, y + 21, note, 8.4, BAD))
        out.append(f'<line x1="{sx(final)}" y1="{y - 6}" x2="{sx(final)}" y2="{y + 30}" stroke="{NAVY}" stroke-width="2"/>')
        out.append(t(sx(final), y + 42, f"= {final}%  ·  {rec}", 9.4, NAVY, 600, "middle"))
        y += 62
    defs = (f'<defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
            f'<rect width="5" height="5" fill="#fff" fill-opacity="0.55"/><line x1="0" y1="0" x2="0" y2="5" stroke="{BAD}" stroke-width="1.2"/></pattern></defs>')
    out.append(t(0, y + 2, "Each block is that department’s confidence × its weight (points out of 100). Hatched = taken off for disagreement.", 8.2, MUTED, italic=True))
    return svg(700, y + 8, defs + "".join(out), "D-2026-003 confidence before and after sign-off")


# ---------------------------------------------------------------- 8. five cases: where confidence is lost
def cases_chart():
    # start = weighted agent confidence; then losses in order: completeness, freshness, disagreement (incl. hard stop)
    rows = [
        ("D-2026-002", "all agree, data complete", 0.89, 0, 0, 0),
        ("D-2026-003", "after David’s sign-off", 0.867, 0, 0, 0.0434),
        ("D-2026-005", "legal rule prohibits it", 0.901, 0, 0, 0.1135),
        ("D-2026-003", "before sign-off", 0.91, 0, 0, 0.1365),
        ("D-2026-007", "two stale data sources", 0.64, 0, 0.1536, 0),
        ("D-2026-006", "9 stores not reporting", 0.565, 0.3249, 0.0288, 0.0317),
    ]
    col = {"kept": NAVY, "comp": "#D98B7C", "fresh": "#E2B866", "dis": "#C9B48C"}
    sx = lambda v: 190 + v * 440
    out, y = [], 4
    for case, why, start, lc, lf, ld in rows:
        final = start - lc - lf - ld
        out.append(t(0, y + 12, case, 9.4, INK, 600))
        out.append(t(66, y + 12, why, 8.6, MUTED))
        out.append(f'<rect x="{sx(0)}" y="{y + 2}" width="{sx(final) - sx(0)}" height="14" rx="2" fill="{col["kept"]}"/>')
        x = final
        for loss, key in ((ld, "dis"), (lf, "fresh"), (lc, "comp")):
            if loss > 0:
                out.append(f'<rect x="{sx(x)}" y="{y + 2}" width="{sx(x + loss) - sx(x)}" height="14" fill="{col[key]}"/>')
                x += loss
        out.append(t(sx(final) - 4, y + 13, f"{round(final * 100)}%", 8.6, "#fff", 600, "end") if final > 0.12 else t(sx(final) + 4, y + 13, f"{round(final * 100)}%", 8.6, NAVY, 600))
        y += 24
    for v in (0, 0.25, 0.5, 0.75, 1.0):
        out.append(f'<line x1="{sx(v)}" y1="2" x2="{sx(v)}" y2="{y}" stroke="{LINE}" stroke-width="0.8"/>')
        out.append(t(sx(v), y + 11, f"{int(v * 100)}%", 8, FAINT, anchor="middle"))
    lx, ly = 0, y + 30
    for key, name in (("kept", "Lighthouse confidence"), ("dis", "lost to disagreement"), ("fresh", "lost to stale data"), ("comp", "lost to missing data")):
        out.append(f'<rect x="{lx}" y="{ly - 8}" width="10" height="10" rx="2" fill="{col[key]}"/>')
        out.append(t(lx + 14, ly, name, 8.6, INK2))
        lx += 150
    body = "".join(out)
    # the grid lines must sit behind the bars
    grid = "".join(s for s in out if s.startswith("<line"))
    rest = "".join(s for s in out if not s.startswith("<line"))
    return svg(700, ly + 6, grid + rest, "How much confidence each demo case loses and why")


# ---------------------------------------------------------------- agent confidence per demo case (Replay answers after a reset)
DOTS = [
    ("D-2026-002", {"Sales": (0.85, "P"), "Finance": (0.95, "P"), "Operations": (0.93, "C"), "Legal": (0.80, "C")}),
    ("D-2026-003", {"Sales": (0.90, "P"), "Finance": (0.95, "X"), "Operations": (0.92, "P"), "Legal": (0.85, "C")}),
    ("D-2026-004", {"Sales": (0.85, "P"), "Finance": (0.90, "C"), "Operations": (0.95, "H"), "Legal": (0.68, "R")}),
    ("D-2026-005", {"Sales": (0.90, "P"), "Finance": (0.92, "X"), "Operations": (0.88, "C"), "Legal": (0.90, "X")}),
    ("D-2026-006", {"Sales": (0.71, "P"), "Finance": (0.60, "C"), "Operations": (0.35, "R"), "Legal": (0.60, "C")}),
    ("D-2026-007", {"Sales": (0.62, "C"), "Finance": (0.70, "P"), "Operations": (0.62, "C"), "Legal": (0.60, "C")}),
    ("D-2026-008", {"Sales": (0.90, "P"), "Finance": (0.78, "H"), "Operations": (0.93, "C"), "Legal": (0.85, "R")}),
    ("D-2026-009", {"Sales": (0.78, "P"), "Finance": (0.95, "X"), "Operations": (0.88, "C"), "Legal": (0.72, "R")}),
    ("D-2026-010", {"Sales": (0.85, "P"), "Finance": (0.85, "X"), "Operations": (0.90, "C"), "Legal": (0.82, "R")}),
    ("D-2026-011", {"Sales": (0.85, "P"), "Finance": (0.85, "C"), "Operations": (0.95, "C"), "Legal": (0.85, "R")}),
    ("D-2026-012", {"Sales": (0.85, "C"), "Finance": (0.90, "P"), "Operations": (0.95, "C"), "Legal": (0.95, "C")}),
]


def dots():
    """Filled dot = the lead must sign (concern or under 65%); ring = cleared automatically."""
    sx = lambda v: 96 + (v - 0.3) * 840  # 30%..100%
    out, y = [], 14
    for case, agents in DOTS:
        out.append(t(0, y + 4, case, 9, INK, 600))
        out.append(f'<line x1="{sx(0.3)}" y1="{y}" x2="{sx(1.0)}" y2="{y}" stroke="{LINE}" stroke-width="0.8"/>')
        for i, (name, (v, r)) in enumerate(agents.items()):
            must = r in ("H", "X", "R") or v < 0.65 or (case == "D-2026-006" and name == "Operations")
            off = (i - 1.5) * 2.2  # tiny vertical offset so equal values stay visible
            cx, cy = sx(v), y + off
            if must:
                out.append(f'<circle cx="{cx}" cy="{cy}" r="5" fill="{AGENT[name]}"/>')
            else:
                out.append(f'<circle cx="{cx}" cy="{cy}" r="4.2" fill="#fff" stroke="{AGENT[name]}" stroke-width="1.8"/>')
        y += 22
    out.insert(0, f'<rect x="{sx(0.3)}" y="2" width="{sx(0.65) - sx(0.3)}" height="{y - 10}" fill="{SOFT}" opacity="0.7"/>')
    out.append(f'<line x1="{sx(0.65)}" y1="2" x2="{sx(0.65)}" y2="{y - 6}" stroke="{BRASS}" stroke-width="1.4" stroke-dasharray="4 3"/>')
    out.append(t(sx(0.65) - 4, y + 2, "65%: under this line a person must sign", 8.4, BRASS, 600, "end"))
    for v in (0.3, 0.5, 0.7, 0.9, 1.0):
        out.append(t(sx(v), y + 16, f"{int(v * 100)}%", 8, FAINT, anchor="end" if v == 1.0 else "middle"))
    lx, ly = 0, y + 36
    for name, col in AGENT.items():
        out.append(f'<circle cx="{lx + 5}" cy="{ly - 3}" r="4.5" fill="{col}"/>')
        out.append(t(lx + 14, ly, name, 8.8, INK2))
        lx += 92
    out.append(f'<circle cx="{lx + 20}" cy="{ly - 3}" r="5" fill="{MUTED}"/>')
    out.append(t(lx + 30, ly, "must sign", 8.8, INK2))
    out.append(f'<circle cx="{lx + 110}" cy="{ly - 3}" r="4.2" fill="#fff" stroke="{MUTED}" stroke-width="1.8"/>')
    out.append(t(lx + 120, ly, "cleared automatically", 8.8, INK2))
    return svg(700, ly + 6, "".join(out), "Each agent's confidence on the demo cases, with the 65 percent sign-off line")


# ---------------------------------------------------------------- 9. recommendation ladder
LADDER = [
    ("A legal rule prohibits it", "Reject", "p-bad", "Nobody can approve it."),
    ("Any agent is missing required evidence", "Review required", "p-warn", "Missing data is never guessed."),
    ("Operations can’t execute it (hard stop)", "Hold", "p-warn", "e.g. the warehouse would pass 112%."),
    ("Finance says reject", "Hold or Reject", "p-bad", "Hold if Sales says proceed, else Reject."),
    ("Finance says hold", "Hold", "p-warn", "The case waits until the economics work."),
    ("Two or more agents say hold or reject", "Hold", "p-warn", ""),
    ("Exactly one agent says hold or reject", "Proceed with conditions", "p-info", "Its concern becomes a condition."),
    ("Legal needs a lawyer to review it", "Proceed with conditions", "p-info", "Legal’s sign-off is required before launch."),
    ("Any agent attaches conditions", "Proceed with conditions", "p-info", ""),
    ("None of the above", "Proceed", "p-ok", "All four support it."),
]


def ladder():
    rows = "".join(
        f'<tr><td class="mono" style="color:{MUTED};width:18pt">{i}</td><td>{q}</td><td style="white-space:nowrap"><span class="pill {cls}">{a}</span></td><td class="muted">{n}</td></tr>'
        for i, (q, a, cls, n) in enumerate(LADDER, 1)
    )
    return f'<table class="tight"><tr><th></th><th style="width:38%">If this is true…</th><th style="width:22%">Lighthouse recommends</th><th>Note</th></tr>{rows}</table>'


# ---------------------------------------------------------------- chapter
def chapter():
    return f"""
<!-- ============================================================ 8. how it works (generated by scripts/guide-howitworks.py) -->
<section class="page" style="margin-top:0" id="how-it-works">
  <div class="eyebrow">8 · How it works</div>
  <h2>What happens when a case is submitted</h2>
  <p class="lede">Submitting a case starts four agents at the same time: Sales, Finance, Operations and Legal. Each one goes through the same five steps. The key idea: <b>the computer does the maths, the AI does the judging, and the rules have the last word.</b></p>
  <figure style="margin:10pt 0 4pt">{pipeline()}</figure>
  <div class="grid2" style="margin-top:6pt">
    <div>
      <h3>Why split the work this way</h3>
      <p>AI models are good at weighing evidence and explaining it, but they can get arithmetic wrong or invent facts. So in Lighthouse the AI never calculates anything. Every number (demand, profit, warehouse load, which rules apply) is worked out first by fixed formulas called <b>tools</b>, and each result gets an <b>evidence ID</b> such as <span class="mono">EV-…-F3</span>. The AI reads that list and must cite the IDs it relied on.</p>
      <h3>What every agent hands back</h3>
      <table class="tight">
        <tr><td style="width:34%"><b>Recommendation</b></td><td>Proceed, Proceed with conditions, Hold, Reject or Review required</td></tr>
        <tr><td><b>Confidence</b></td><td>0–100%: how sure it is, given how good its evidence is</td></tr>
        <tr><td><b>Risk</b></td><td>Low, Medium, High or Critical</td></tr>
        <tr><td><b>Conditions</b></td><td>What must be true to go ahead (for example “cap spend at $52K”)</td></tr>
        <tr><td><b>Evidence</b></td><td>The IDs of the facts it used</td></tr>
        <tr><td><b>Rationale</b></td><td>Two to four plain sentences for a busy executive</td></tr>
      </table>
    </div>
    <div>
      <h3>The guardrails, in plain words</h3>
      <ul>
        <li><b>No made-up sources.</b> A citation to evidence that doesn’t exist is deleted. If nothing valid is left, the answer isn’t counted.</li>
        <li><b>Hard limits win.</b> If a legal rule prohibits the case, the Legal agent must say Reject. If the warehouse would overflow, Operations must say Hold. The AI can’t talk its way around them.</li>
        <li><b>Risk can’t be played down.</b> It is raised to at least what the evidence shows (for example, the most serious legal rule triggered).</li>
        <li><b>Confidence is capped when data is weak.</b> Old or missing data puts a ceiling on how sure an agent may be (see the next pages).</li>
        <li><b>Case text is treated as data.</b> Anything typed into a proposal is quoted, never followed as an instruction.</li>
      </ul>
      <h3>If the AI is unavailable</h3>
      <p>Lighthouse asks Gemini first, then Groq. If neither answers, a <b>rules engine</b> makes the call with the same tools and fixed rules, and the card says so. <b>Replay</b> reuses saved AI answers so a demo gives identical results every time.</p>
    </div>
  </div>
</section>

<section class="page" style="margin-top:0">
  <div class="eyebrow">8 · How it works</div>
  <h2>The four agents</h2>
  <p class="lede">Each agent answers one question for its department and nothing else. The examples use <b>D-2026-003</b>: a 28% price cut on Home &amp; Kitchen in 11 stores for 4 weeks.</p>

  <div class="grid2" style="margin-top:8pt">
    <div class="card">
      <h3 style="margin-top:0;color:{AGENT['Sales']}">Sales · “Will customers buy more?”</h3>
      <p><b>Looks at:</b> the last 56 days of sales in those stores, the season for the exact dates, how strongly the category reacts to price (its <i>elasticity</i>), and real past promotion days in the same stores.</p>
      <p><b>How it forecasts:</b> a price cut sells more units, and the mechanic itself adds a little (an endcap display adds 12%). That estimate is blended 75/25 with what real past promotions did, and trimmed for promotions longer than 4 weeks, when shoppers tire of the deal.</p>
      <p><b>Decides:</b> under 3% more units → Hold · 3–8% → Proceed with conditions · 8% or more → Proceed. Too little sales data → Review required.</p>
      <figure style="margin:6pt 0 2pt">{sales_chart()}</figure>
      <p class="muted" style="font-size:8.6pt">The cut sells 42% more units, but each sells for 28% less, so revenue rises only 2%. Sales says Proceed; it only judges demand.</p>
    </div>
    <div class="card">
      <h3 style="margin-top:0;color:{AGENT['Finance']}">Finance · “Do we make money?”</h3>
      <p><b>Looks at:</b> the Sales forecast, the category’s margin (35% here: $35 profit on every $100 sold at full price), supplier funding, and the cost of running the promotion.</p>
      <p><b>How it works it out:</b> extra profit from the extra units, plus profit on other items shoppers add to the basket, plus supplier funding, minus the discount given away, labor, delivery and the cost of holding stock. It also tests a bad case (40% fewer extra sales) and finds the largest discount that still breaks even.</p>
      <p><b>Decides:</b> a loss bigger than $25K or 2% of revenue (whichever is larger) → Reject · a smaller loss → Hold · profit, but a loss in the bad case → Proceed with conditions · profit in both → Proceed.</p>
      <figure style="margin:6pt 0 2pt">{finance_chart()}</figure>
      <p class="muted" style="font-size:8.6pt">At 28% off, the profit on every $100 of goods (at full price) falls from $35 to $7, so 42% more units can’t make up for it. Only a 1% discount breaks even. Finance says Reject.</p>
    </div>
  </div>
</section>

<section class="page" style="margin-top:0">
  <div class="grid2">
    <div class="card">
      <h3 style="margin-top:0;color:{AGENT['Operations']}">Operations · “Can we actually do it?”</h3>
      <p><b>Looks at:</b> stock on hand and on the way, safety stock, how busy the distribution center (DC) usually is on those dates, store labor, online order capacity and how long restocking takes.</p>
      <p><b>How it works it out:</b> adds the forecast extra units to the normal load, with launch week weighted heavier because demand is front-loaded. It checks whether there is enough stock to open, whether a restock can arrive in time, and what share of orders would be filled (the <i>fill rate</i>).</p>
      <p><b>Decides:</b> Hold (a hard stop) if the DC passes 112%, online orders pass 115%, the fill rate falls under 92%, or restocking can’t arrive before launch. Past a warning line (DC 95%, online 98%, labor 95%) → Proceed with conditions, with a fix such as “stage deliveries by week”. Fewer than 80% of stores reporting inventory → Review required.</p>
      <figure style="margin:6pt 0 2pt">{ops_chart()}</figure>
      <p class="muted" style="font-size:8.6pt">Everything sits under the warning lines and 99% of orders would be filled. Operations says Proceed.</p>
    </div>
    <div class="card">
      <h3 style="margin-top:0;color:{AGENT['Legal']}">Legal · “Are we allowed to?”</h3>
      <p><b>Looks at:</b> a catalog of 180 active rules (federal and state), each with a trigger: category, promotion type, channel, state, minimum discount, length, flags such as “alcohol” or “children’s data”, and words in the marketing claim such as “clinically proven”.</p>
      <p><b>How it works it out:</b> a rule applies only when <i>every</i> trigger it lists matches the case. This is exact matching, not AI guessing, so Legal is rarely unsure. The AI then explains the matches and their conditions in plain words.</p>
      <p><b>Decides:</b></p>
      <table class="tight">
        <tr><td>A matched rule <b>prohibits</b> it</td><td><span class="pill p-bad">Reject</span>, risk Critical</td></tr>
        <tr><td>A matched rule needs a <b>lawyer’s review</b></td><td><span class="pill p-warn">Review required</span></td></tr>
        <tr><td>Only informational rules match</td><td><span class="pill p-info">With conditions</span></td></tr>
        <tr><td>No rule matches</td><td><span class="pill p-ok">Proceed</span></td></tr>
      </table>
      <p>Risk is at least as high as the most serious rule matched. Because matching is exact, the rules engine gives Legal 90–97% confidence. Outputs are compliance-risk flags, not legal advice.</p>
      <p class="muted" style="font-size:8.6pt">One low-severity Texas rule matches (accessible web content for the online offer). Legal says Proceed with conditions.</p>
    </div>
  </div>

</section>

<section class="page" style="margin-top:0">
  <div class="eyebrow">8 · How it works</div>
  <h2>How sure is each agent?</h2>
  <p>Each agent’s confidence answers: <i>“How sure am I, given how good my evidence is?”</i> The AI sets it from 0% to 100% and is told that stale or incomplete evidence must lower it. Then guardrails put a ceiling on it:</p>
  <table class="tight">
    <tr><th>When this happens…</th><th>…the ceiling is</th></tr>
    <tr><td>Sales data is more than 7 days old</td><td>Sales and Finance at most 72%</td></tr>
    <tr><td>Store inventory data is more than 5 days old</td><td>Operations at most 70%</td></tr>
    <tr><td>Under 60% of the expected sales records exist, or there is no sales baseline</td><td>Sales or Finance at most 50%, and the answer isn’t counted</td></tr>
    <tr><td>Under 80% of stores report current inventory</td><td>Operations at most 45%, and the answer isn’t counted</td></tr>
  </table>
  <p><b>Without AI</b>, the rules engine starts each agent at a fixed level and takes points off for weak evidence. Sales starts at 88%, minus 12 for fewer than 30 past promotion days to learn from, 10 for a test in under 5 stores, and 12 for stale data. Finance and Operations start at 86%, losing points for stale data, and when the result sits right at break-even or near a capacity limit. Every agent stays between 30% and 95%.</p>
  <h3 style="margin-top:12pt">Why it matters: confidence decides who has to sign</h3>
  <p>A department lead only signs when their agent raises a concern: it says Hold, Reject or Review required, it is <b>under 65% confident</b>, or its evidence is missing. Everything else clears automatically. The chart shows every agent’s confidence on the demo cases.</p>
  <figure style="margin:6pt 0 2pt">{dots()}</figure>
  <p class="muted" style="font-size:8.8pt">D-2026-007: all four agents say proceed, but its data is 18 days old, so three of them sit under 65% and three leads must sign. D-2026-012: everyone is sure and nobody objects, so nobody has to sign at all.</p>
</section>


<section class="page" style="margin-top:0">
  <div class="eyebrow">8 · How it works</div>
  <h2>From four answers to one confidence score</h2>
  <p class="lede">Lighthouse confidence says how much to trust the combined recommendation. It is <b>not an average</b>. It is four factors multiplied together, so one weak link pulls the whole score down. If only half the data exists, the score halves, however sure the four agents sound. An average would hide that.</p>
  <figure style="margin:10pt 0 6pt">{formula()}</figure>

  <h3>Factor 1 · The agents’ confidence, weighted by department</h3>
  <p>Each agent’s confidence is multiplied by its department’s weight, and the four results are added up.</p>
  <figure style="margin:4pt 0 4pt">{weights()}</figure>
  <p class="muted" style="font-size:8.8pt">Finance weighs most because money is the most common deciding factor. Legal weighs least because it doesn’t need weight: a legal prohibition is a veto, whatever the other three say.</p>

  <div class="grid2" style="margin-top:4pt">
    <div>
      <h3>Factor 2 · Is the evidence complete?</h3>
      <p>The average of two shares: how many expected sales records exist, and how many stores report current inventory. Then 15 points come off for every agent whose answer isn’t counted. It never goes below 30%.</p>
      <p class="muted" style="font-size:8.8pt">D-2026-006: sales records 100%, stores reporting 0 of 9 → (100% + 0%) ÷ 2 = 50%, minus 15 for Operations = <b>42.5%</b>.</p>
      <h3>Factor 3 · Is the evidence fresh?</h3>
      <p>Starts at 100% and loses 12 points for each source past its age limit: sales data (7 days) and store inventory (5 days). So 100%, 88% or 76%.</p>
    </div>
    <div>
      <h3>Factor 4 · Do the agents agree?</h3>
      <table class="tight">
        <tr><th>Disagreement</th><th>When</th><th>Taken off</th></tr>
        <tr><td>None</td><td>All point the same way</td><td>0%</td></tr>
        <tr><td>Minor</td><td>Same direction, but Legal needs a review, or risk levels are far apart (e.g. Low vs High)</td><td>5%</td></tr>
        <tr><td>Material</td><td>Some support and some oppose, or an answer is missing evidence</td><td>15%</td></tr>
        <tr><td>Hard stop</td><td>Legal prohibits or Operations can’t execute</td><td>8%, then 5% more</td></tr>
      </table>
      <p class="muted" style="font-size:8.8pt">A hard stop costs less than a real split because the answer is clear: the case can’t go ahead as proposed. The final score always stays between 15% and 95%; Lighthouse never claims certainty.</p>
    </div>
  </div>
</section>

<section class="page" style="margin-top:0">
  <div class="eyebrow">8 · How it works</div>
  <h2>A worked example, and what a person’s sign-off changes</h2>
  <p class="lede">D-2026-003 before and after David (Finance) changes his agent’s Reject to Proceed with conditions. These are the exact figures the app shows.</p>
  <figure style="margin:10pt 0 6pt">{stacked()}</figure>
  <div class="grid2">
    <div>
      <h3>Before sign-off: 77%, Hold</h3>
      <ol style="padding-left:14pt;margin-top:2pt">
        <li>Weighted confidence: Finance 95% × 0.30 = 28.5, Sales 90% × 0.25 = 22.5, Operations 92% × 0.25 = 23.0, Legal 85% × 0.20 = 17.0. Total <b>91%</b>.</li>
        <li>Evidence complete (100%) and fresh (100%): nothing comes off.</li>
        <li>Finance opposes while three support: material disagreement, × 0.85 → <b>77%</b>.</li>
        <li>Finance says Reject and Sales says Proceed, so the recommendation is <b>Hold</b>.</li>
      </ol>
    </div>
    <div>
      <h3>After David signs: 82%, Proceed with conditions</h3>
      <ol style="padding-left:14pt;margin-top:2pt">
        <li>David’s position replaces the agent’s: Proceed with conditions, with his reason on record.</li>
        <li>A changed answer costs confidence: Finance’s 95% × 0.85 = 81%, so its share drops from 28.5 to 24.2. Total <b>86.7%</b>.</li>
        <li>Nobody opposes now, but risk levels still differ (Finance High, the rest Low): minor disagreement, × 0.95 → <b>82%</b>.</li>
      </ol>
      <p class="muted" style="font-size:8.8pt">Confidence goes up because an accountable person resolved the disagreement. The 15% cost means a human change is never free, and the report still says “the agents alone said hold”.</p>
    </div>
  </div>

  <h3 style="margin-top:12pt">Five demo cases: where confidence is lost</h3>
  <p>Each bar starts at the weighted agents’ confidence. The coloured parts show what the other three factors took away.</p>
  <figure style="margin:6pt 0 4pt">{cases_chart()}</figure>
</section>

<section class="page" style="margin-top:0">
  <div class="eyebrow">8 · How it works</div>
  <h2>How the recommendation is chosen</h2>
  <p class="lede">The recommendation is <b>not</b> a vote and <b>not</b> an average. Lighthouse checks these questions in order, and the first one that is true decides. Safety and legality come first, then money, then agreement.</p>
  {ladder()}
  <div class="grid2" style="margin-top:8pt">
    <div>
      <h3>Everything else in the report</h3>
      <ul>
        <li><b>Risk</b> is the highest risk any of the four agents reported. A legal prohibition makes it Critical.</li>
        <li><b>Conditions</b> from all four agents are merged, with duplicates removed (up to 8).</li>
        <li><b>Checks</b> flag what needs attention, such as over $250K at stake, which needs the named executive.</li>
      </ul>
    </div>
    <div>
      <h3>After the departments sign, it all runs again</h3>
      <ul>
        <li>Each signed department’s position <b>replaces</b> its agent’s answer.</li>
        <li><b>Confirmed</b>: nothing changes. <b>Changed</b>: that agent’s confidence × 0.85. <b>Blocked</b>: the department now opposes it.</li>
        <li>A lead who signs a positive position takes ownership of the risk, so it is capped (Legal at Medium, others at High). A Legal rejection makes it Critical.</li>
        <li>The same questions and the same formula run on the signed positions, and the report keeps both results: <i>“The agents alone said hold. After the departments signed off, Lighthouse recommends proceed with conditions.”</i></li>
      </ul>
    </div>
  </div>
  <div class="call ok"><b>In one sentence:</b> tools work out the numbers, each AI agent judges its own department’s evidence, guardrails keep it honest, Lighthouse combines the four with fixed rules and a confidence score that punishes weak links, the department leads own their agents’ answers, and the executive makes the call.</div>
</section>
"""


def main():
    html = GUIDE.read_text()
    # drop the old chapter (generated or the original short "Under the hood" section)
    html = re.sub(r"\n<!-- =+ 8\. how it works \(generated.*?(?=\n<section class=\"page\" style=\"margin-top:0\">\n  <section style=\"margin-top:0\">\n    <div class=\"eyebrow\">9 · Questions)", "\n", html, flags=re.S)
    old = re.search(r"  <section>\n  <div class=\"eyebrow\">8 · Under the hood</div>.*?\n  </section>\n</section>\n", html, flags=re.S)
    if old:
        html = html[: old.start()] + "</section>\n" + html[old.end():]
    anchor = '\n<section class="page" style="margin-top:0">\n  <section style="margin-top:0">\n    <div class="eyebrow">9 · Questions</div>'
    assert anchor in html, "Questions section not found"
    html = html.replace(anchor, chapter() + anchor, 1)
    GUIDE.write_text(html)
    print("chapter written")


if __name__ == "__main__":
    main()
