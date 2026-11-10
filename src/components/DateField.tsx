import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { displayDate, fromLocalDate, toLocalDate } from "@/lib/date-display";
import { cn } from "@/lib/utils";

/**
 * Date entry that is never ambiguous: the field always shows "09 Nov 2026" (whatever the browser's locale) and opens
 * a calendar; the stored value stays ISO YYYY-MM-DD and changes only when the owner picks a day. The trigger is a
 * real button (Enter/Space open it, the calendar takes arrow keys, Escape closes and returns focus) labelled by the
 * field's <Label htmlFor>, and its accessible name includes the date it shows.
 */
export function DateField({ id, label, value, onChange, className }: { id: string; label: string; value: string; onChange: (iso: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  // On a phone the calendar needs the room below the field: bring the field up first, and the calendar never grows
  // past the space the screen has (it scrolls instead of being cut off).
  const toggle = (next: boolean) => { if (next) trigger.current?.scrollIntoView?.({ block: "start", behavior: "instant" }); setOpen(next); };
  const selected = toLocalDate(value);
  const shown = displayDate(value);
  const thisYear = new Date().getFullYear();
  return (
    <Popover open={open} onOpenChange={toggle}>
      <PopoverTrigger asChild>
        <button
          ref={trigger}
          type="button"
          id={id}
          data-value={value}
          aria-label={`${label}: ${shown || "not set"}. Change date`}
          className={cn("uix-input flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 py-1 text-left text-base text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50", className)}
        >
          <span id={`${id}-shown`} className="min-w-0 truncate" data-date-display>{shown || "Choose date"}</span>
          <CalendarDays aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={8} className="max-h-(--radix-popover-content-available-height) w-auto overflow-y-auto p-0" aria-label={`Choose ${label.toLowerCase()}`}>
        <Calendar
          mode="single"
          selected={selected}
          {...(selected ? { defaultMonth: selected } : {})}
          captionLayout="dropdown"
          startMonth={new Date(2000, 0)}
          endMonth={new Date(thisYear + 1, 11)}
          autoFocus
          className="[--cell-size:2.75rem]"
          onSelect={(day: Date | undefined) => { if (day) { onChange(fromLocalDate(day)); setOpen(false); } }}
        />
      </PopoverContent>
    </Popover>
  );
}
