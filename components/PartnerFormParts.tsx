"use client";
import { useState } from "react";

export type SportRow = {
  sport: string; priceRegular: string; priceGroup: string; durationMin: string;
  pricing: string; minGirls: string; maxGirls: string; units: string;
};
export type Slot = { day: string; from: string; to: string };

const empty = (sport: string): SportRow => ({ sport, priceRegular: "", priceGroup: "", durationMin: "", pricing: "", minGirls: "", maxGirls: "", units: "" });

/** Pick sports; each chosen sport gets its own prices, duration and group size. Sent as JSON in "sportRows". */
export function SportsPricing({ sports }: { sports: string[] }) {
  const [rows, setRows] = useState<SportRow[]>([]);
  const [other, setOther] = useState("");
  const toggle = (s: string) => setRows((r) => (r.some((x) => x.sport === s) ? r.filter((x) => x.sport !== s) : [...r, empty(s)]));
  const set = (i: number, k: keyof SportRow, v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const addOther = () => {
    const name = other.trim();
    if (name && !rows.some((x) => x.sport.toLowerCase() === name.toLowerCase())) setRows((r) => [...r, empty(name)]);
    setOther("");
  };
  const num = (i: number, k: keyof SportRow, label: string, ph: string, step = 1) => (
    <div>
      <label htmlFor={`${k}-${i}`}>{label}</label>
      <input id={`${k}-${i}`} type="number" min={0} step={step} inputMode="numeric" placeholder={ph} value={rows[i][k]} onChange={(e) => set(i, k, e.target.value)} />
    </div>
  );
  return (
    <div className="stack">
      <input type="hidden" name="sportRows" value={JSON.stringify(rows)} />
      <div>
        <label>Кои спортови / часови нудите? <span className="meta">(изберете еден или повеќе)</span></label>
        <div className="row">
          {sports.map((s) => (
            <label key={s} className="chipbox">
              <input type="checkbox" checked={rows.some((x) => x.sport === s)} onChange={() => toggle(s)} />
              <span>{s}</span>
            </label>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input aria-label="Друг спорт" placeholder="Друг спорт или час…" value={other} onChange={(e) => setOther(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOther(); } }} style={{ maxWidth: 260 }} />
          <button type="button" className="btn sm ghost" onClick={addOther}>+ Додај</button>
        </div>
      </div>
      {rows.map((r, i) => (
        <fieldset key={r.sport} className="sport-row">
          <legend>{r.sport}</legend>
          <button type="button" className="btn sm ghost sport-remove" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label={`Отстрани ${r.sport}`}>✕</button>
          <div className="three">
            {num(i, "priceRegular", "Редовна цена (ден.)", "пр. 1600", 50)}
            {num(i, "priceGroup", "Цена за Скопјанки (ден.)", "пр. 1300", 50)}
            {num(i, "durationMin", "Траење (мин.)", "пр. 90", 15)}
          </div>
          <div className="three">
            <div>
              <label htmlFor={`pricing-${i}`}>Цената е</label>
              <select id={`pricing-${i}`} value={r.pricing} onChange={(e) => set(i, "pricing", e.target.value)}>
                <option value="">Изберете…</option>
                <option>по терен</option>
                <option>по девојка</option>
                <option>за цела група</option>
              </select>
            </div>
            {num(i, "minGirls", "Минимум девојки", "пр. 4")}
            {num(i, "maxGirls", "Максимум девојки", "пр. 8")}
          </div>
          <div className="three">{num(i, "units", "Колку терени / сали одеднаш", "пр. 2")}</div>
        </fieldset>
      ))}
      {rows.length === 0 && <p className="meta">Изберете спорт за да ги внесете цените и бројот на девојки за него.</p>}
    </div>
  );
}

const DAYS = ["Понеделник", "Вторник", "Среда", "Четврток", "Петок", "Сабота", "Недела"];

/** Days and hours the partner offers to Skopjanki at a discount; as many as they like. Sent as JSON in "slots". */
export function SlotPicker() {
  const [slots, setSlots] = useState<Slot[]>([{ day: "", from: "", to: "" }]);
  const set = (i: number, k: keyof Slot, v: string) => setSlots((s) => s.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <div className="stack">
      <input type="hidden" name="slots" value={JSON.stringify(slots.filter((s) => s.day))} />
      {slots.map((s, i) => (
        <div key={i} className="slot-row">
          <select aria-label="Ден" value={s.day} onChange={(e) => set(i, "day", e.target.value)}>
            <option value="">Ден…</option>
            {DAYS.map((d) => <option key={d}>{d}</option>)}
          </select>
          <input type="time" aria-label="Од" value={s.from} onChange={(e) => set(i, "from", e.target.value)} />
          <span className="meta">до</span>
          <input type="time" aria-label="До" value={s.to} onChange={(e) => set(i, "to", e.target.value)} />
          {slots.length > 1 && <button type="button" className="btn sm ghost" onClick={() => setSlots((x) => x.filter((_, j) => j !== i))} aria-label="Отстрани термин">✕</button>}
        </div>
      ))}
      <p><button type="button" className="btn sm ghost" onClick={() => setSlots((x) => [...x, { day: "", from: "", to: "" }])}>+ Додај уште ден / термин</button></p>
    </div>
  );
}
