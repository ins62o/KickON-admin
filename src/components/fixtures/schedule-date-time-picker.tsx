"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

type ScheduleDateTimePickerProps = {
  id: string;
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
};

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const hours = Array.from({ length: 24 }, (_, index) => index);
const minutes = Array.from({ length: 60 }, (_, index) => index);

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDateValue(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function parseDate(value: string) {
  const [year = 2026, month = 1, day = 1] = value.split("-").map(Number);
  return { year, month: month - 1, day };
}

function todayInKorea() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function formatSelectedDate(value: string) {
  const { year, month, day } = parseDate(value);
  const weekday = weekdays[new Date(year, month, day).getDay()];
  return `${year}. ${pad(month + 1)}. ${pad(day)}. (${weekday})`;
}

function formatSelectedTime(value: string) {
  const [hour = 0, minute = 0] = value.split(":").map(Number);
  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour % 12 || 12;
  return `${period} ${pad(displayHour)}:${pad(minute)}`;
}

export function ScheduleDateTimePicker({ id, date, time, onDateChange, onTimeChange }: ScheduleDateTimePickerProps) {
  const initialDate = parseDate(date);
  const [visibleMonth, setVisibleMonth] = useState({ year: initialDate.year, month: initialDate.month });
  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [selectedHour, selectedMinute] = time.split(":").map(Number);
  const selectedHourRef = useRef<HTMLButtonElement>(null);
  const selectedMinuteRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!timeOpen) return;

    const frame = requestAnimationFrame(() => {
      selectedHourRef.current?.scrollIntoView({ block: "center" });
      selectedMinuteRef.current?.scrollIntoView({ block: "center" });
    });

    return () => cancelAnimationFrame(frame);
  }, [timeOpen]);

  const moveMonth = (offset: number) => {
    const next = new Date(visibleMonth.year, visibleMonth.month + offset, 1);
    setVisibleMonth({ year: next.getFullYear(), month: next.getMonth() });
  };

  const selectToday = () => {
    const today = todayInKorea();
    const next = parseDate(today);
    onDateChange(today);
    setVisibleMonth({ year: next.year, month: next.month });
    setDateOpen(false);
  };

  const leadingDays = new Date(visibleMonth.year, visibleMonth.month, 1).getDay();
  const daysInMonth = new Date(visibleMonth.year, visibleMonth.month + 1, 0).getDate();
  const calendarDays = Array.from({ length: leadingDays + daysInMonth }, (_, index) => index < leadingDays ? null : index - leadingDays + 1);
  while (calendarDays.length % 7 !== 0) calendarDays.push(null);
  const today = todayInKorea();

  const updateTime = (hour: number, minute: number) => onTimeChange(`${pad(hour)}:${pad(minute)}`);

  return <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-3 rounded-xl border border-border/80 bg-muted/20 p-3">
    <div className="space-y-2">
      <span id={`${id}-date-label`} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><CalendarDays className="size-3.5 text-primary" />경기 날짜</span>
      <PopoverPrimitive.Root open={dateOpen} onOpenChange={setDateOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button type="button" aria-labelledby={`${id}-date-label`} className="flex h-12 w-full items-center justify-between rounded-lg border border-border/70 bg-background/80 px-3 text-left text-sm font-semibold transition-colors hover:border-primary/40 hover:bg-muted/35 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/15">
            <span className="truncate tabular-nums">{formatSelectedDate(date)}</span>
            <CalendarDays className="size-4 shrink-0 text-primary" />
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content align="start" sideOffset={8} collisionPadding={12} className="z-[80] w-[320px] rounded-2xl border border-border/80 bg-popover p-4 text-popover-foreground shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => moveMonth(-1)} aria-label="이전 달" className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><ChevronLeft className="size-4" /></button>
              <strong className="text-sm tabular-nums">{visibleMonth.year}년 {visibleMonth.month + 1}월</strong>
              <button type="button" onClick={() => moveMonth(1)} aria-label="다음 달" className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><ChevronRight className="size-4" /></button>
            </div>
            <div className="mt-3 grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
              {weekdays.map((weekday, index) => <span key={weekday} className={cn("py-1.5", index === 0 && "text-rose-300", index === 6 && "text-sky-300")}>{weekday}</span>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {calendarDays.map((day, index) => {
                if (day === null) return <span key={`empty-${index}`} className="size-9" aria-hidden="true" />;
                const value = toDateValue(visibleMonth.year, visibleMonth.month, day);
                const selected = value === date;
                return <button
                  key={value}
                  type="button"
                  aria-label={`${visibleMonth.year}년 ${visibleMonth.month + 1}월 ${day}일`}
                  aria-pressed={selected}
                  onClick={() => { onDateChange(value); setDateOpen(false); }}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-lg text-xs font-medium tabular-nums transition-colors hover:bg-primary/12 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    selected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                    value === today && !selected && "ring-1 ring-primary/50 text-primary",
                    index % 7 === 0 && !selected && "text-rose-300",
                    index % 7 === 6 && !selected && "text-sky-300",
                  )}
                >{day}</button>;
              })}
            </div>
            <div className="mt-3 flex justify-end border-t border-border/70 pt-3"><button type="button" onClick={selectToday} className="rounded-lg px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">오늘</button></div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>

    <div className="space-y-2">
      <span id={`${id}-time-label`} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Clock3 className="size-3.5 text-primary" />시작 시간</span>
      <PopoverPrimitive.Root open={timeOpen} onOpenChange={setTimeOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button type="button" aria-labelledby={`${id}-time-label`} className="flex h-12 w-full items-center justify-between rounded-lg border border-border/70 bg-background/80 px-3 text-left text-sm font-semibold transition-colors hover:border-primary/40 hover:bg-muted/35 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/15">
            <span className="tabular-nums">{formatSelectedTime(time)}</span>
            <Clock3 className="size-4 shrink-0 text-primary" />
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Content align="end" sideOffset={8} collisionPadding={12} className="z-[80] w-64 rounded-2xl border border-border/80 bg-popover p-3 text-popover-foreground shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
            <div className="grid grid-cols-2 gap-2 px-1 pb-2 text-center text-xs font-semibold text-muted-foreground"><span>시</span><span>분</span></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid max-h-60 touch-pan-y gap-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="listbox" aria-label="시 선택">
                {hours.map((hour) => <button ref={hour === selectedHour ? selectedHourRef : undefined} key={hour} type="button" role="option" aria-selected={hour === selectedHour} onClick={() => updateTime(hour, selectedMinute)} className={cn("min-h-10 rounded-lg text-sm font-medium tabular-nums transition-colors hover:bg-primary/12 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", hour === selectedHour && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground")}>{pad(hour)}시</button>)}
              </div>
              <div className="grid max-h-60 touch-pan-y gap-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="listbox" aria-label="분 선택">
                {minutes.map((minute) => <button ref={minute === selectedMinute ? selectedMinuteRef : undefined} key={minute} type="button" role="option" aria-selected={minute === selectedMinute} onClick={() => { updateTime(selectedHour, minute); setTimeOpen(false); }} className={cn("min-h-10 rounded-lg text-sm font-medium tabular-nums transition-colors hover:bg-primary/12 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", minute === selectedMinute && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground")}>{pad(minute)}분</button>)}
              </div>
            </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Root>
    </div>
  </div>;
}
