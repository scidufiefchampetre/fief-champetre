import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

interface ListCardBase {
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  title: React.ReactNode;
  meta1?: React.ReactNode;
  meta2?: React.ReactNode;
  chevron?: boolean;
  muted?: boolean;
  className?: string;
  children?: React.ReactNode;
}

type ListCardProps =
  | (ListCardBase & { as?: "div"; onClick?: never; to?: never })
  | (ListCardBase & { as: "button"; onClick: () => void; to?: never })
  | (ListCardBase & {
      as: "link";
      to: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      params?: Record<string, string>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      search?: Record<string, unknown>;
      onClick?: never;
    });

const SHELL =
  "group block overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-colors";
const SHELL_INTERACTIVE =
  "hover-device:hover:border-brand-secondary/35 active:scale-[0.995]";
const ROW = "flex items-center gap-3 p-3.5";

function CardRow({
  icon,
  badge,
  title,
  meta1,
  meta2,
  chevron = true,
  muted = false,
}: Pick<ListCardBase, "icon" | "badge" | "title" | "meta1" | "meta2" | "chevron" | "muted">) {
  return (
    <div className={ROW}>
      {icon && (
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${muted ? "bg-secondary text-muted-foreground" : "bg-brand-accent/15 text-brand-accent"}`}
        >
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[15px] font-black tracking-[-0.01em]">{title}</span>
          {badge && <span className="shrink-0">{badge}</span>}
        </div>
        {meta1 && (
          <div className="mt-1 flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap text-[8px] font-medium text-muted-foreground sm:text-[9px]">
            {meta1}
          </div>
        )}
        {meta2 && (
          <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[8px] font-medium text-muted-foreground">
            {meta2}
          </div>
        )}
      </div>
      {chevron && (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      )}
    </div>
  );
}

export function ListCard(props: ListCardProps) {
  const { icon, badge, title, meta1, meta2, chevron, muted, className, children } = props;
  const rowProps = { icon, badge, title, meta1, meta2, chevron, muted };

  if (props.as === "button") {
    return (
      <button
        type="button"
        onClick={props.onClick}
        className={`w-full text-left ${SHELL} ${SHELL_INTERACTIVE} ${className ?? ""}`}
      >
        <CardRow {...rowProps} />
        {children}
      </button>
    );
  }

  if (props.as === "link") {
    return (
      <Link
        to={props.to as never}
        params={props.params as never}
        search={props.search as never}
        className={`${SHELL} ${SHELL_INTERACTIVE} ${className ?? ""}`}
      >
        <CardRow {...rowProps} />
        {children}
      </Link>
    );
  }

  return (
    <div className={`${SHELL} ${className ?? ""}`}>
      <CardRow {...rowProps} />
      {children}
    </div>
  );
}
