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
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/50 bg-background/50 text-sm font-medium">
      <Clock className="h-4 w-4 text-muted-foreground" />
      <span className="text-muted-foreground">
        {formatDateTimeLebanon(currentTime, "HH:mm:ss")}
      </span>
    </div>
  );
}

