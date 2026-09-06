import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { formatDateTimeLebanon } from "@/utils/dateUtils";

export function LiveClock() {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Update every second
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex shrink-0 items-center gap-1.5 h-9 sm:h-7 px-2 rounded-lg border border-border/50 bg-background/50 text-xs font-medium">
      <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground tabular-nums">
        {formatDateTimeLebanon(currentTime, "HH:mm:ss")}
      </span>
    </div>
  );
}

