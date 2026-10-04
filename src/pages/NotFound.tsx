import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { FileQuestion } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    // Track 404 errors silently
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-xl border-2 border-border bg-card p-6 text-center">
        <span className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-lg bg-primary-light text-primary">
          <FileQuestion className="h-5 w-5" aria-hidden="true" />
        </span>
        <h1 className="mb-1 text-2xl font-bold tabular-nums">404</h1>
        <p className="mb-4 text-[13px] text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="text-[13px] font-medium text-primary hover:underline">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
