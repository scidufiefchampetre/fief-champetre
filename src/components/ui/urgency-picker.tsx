import type { ReportUrgency } from "@/lib/chantier-reports.functions";
import { REPORT_URGENCY_LABEL, REPORT_URGENCY_SUBLABEL } from "@/lib/chantier-reports.functions";

const URGENCY_VALUES: ReportUrgency[] = ["tres_urgent", "urgent", "important", "must_have"];

export function UrgencyPicker({
  value,
  onChange,
}: {
  value: ReportUrgency | "";
  onChange: (v: ReportUrgency) => void;
}) {
  return (
    <div>
      <div className="flex gap-1.5">
        {URGENCY_VALUES.map((u) => {
          const active = value === u;
          return (
            <button
              key={u}
              type="button"
              onClick={() => onChange(u)}
              className={`tap flex flex-1 items-center justify-center rounded-xl px-1 py-3 text-center transition min-h-[44px] ${
                active ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"
              }`}
            >
              <span className="text-[11px] font-semibold leading-tight">
                {REPORT_URGENCY_LABEL[u]}
              </span>
            </button>
          );
        })}
      </div>
      {value && (
        <p className="mt-2 text-[11px] text-muted-foreground">{REPORT_URGENCY_SUBLABEL[value]}</p>
      )}
    </div>
  );
}
