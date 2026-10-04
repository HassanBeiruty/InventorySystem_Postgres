import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Receipt, Lock, ArrowLeft } from "lucide-react";
import { z } from "zod";

const resetPasswordSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Password must contain at least one uppercase letter, one lowercase letter, and one number"),
  confirmPassword: z.string(),
  token: z.string().min(1, "Reset token is required"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Get token and email from URL parameters
    const urlToken = searchParams.get("token");
    const urlEmail = searchParams.get("email");
    
    if (urlToken) {
      setToken(urlToken);
    }
    if (urlEmail) {
      setEmail(decodeURIComponent(urlEmail));
    }

    // If no token in URL, show error
    if (!urlToken) {
      toast.error("Invalid reset link. Please request a new password reset.");
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const validation = resetPasswordSchema.safeParse({ 
        email, 
        password, 
        confirmPassword, 
        token 
      });
      
      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        return;
      }

      setLoading(true);

      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, token }),
      });

      // Check content type before parsing
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Non-JSON response:", text);
        throw new Error("Server returned an invalid response. Please try again.");
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to reset password");
      }

      toast.success(data.message || "Password reset successfully! Redirecting to login...");
      
      // Navigate to login page after success
      setTimeout(() => {
        navigate("/auth");
      }, 2000);
    } catch (error: any) {
      toast.error(error.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-primary/10 to-accent/10 p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-small-black/[0.2] dark:bg-grid-small-white/[0.2]"></div>
      
      <Card className="w-full max-w-md relative z-10 border-2 border-border shadow-elegant">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary-light">
              <Receipt className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
          </div>
          <CardTitle className="text-xl font-bold tracking-tight">Reset Password</CardTitle>
          <CardDescription className="text-[13px]">
            Enter your new password below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[11px] font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9 text-[13px]"
                required
                disabled={loading || !!searchParams.get("email")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-[11px] font-medium">New Password</Label>
              <div className="relative">
                <Lock className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="ps-10 h-9 text-[13px]"
                  required
                  disabled={loading}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Must be at least 8 characters with uppercase, lowercase, and a number
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-[11px] font-medium">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="ps-10 h-9 text-[13px]"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full h-9 text-[13px]" 
              disabled={loading || !token}
            >
              {loading ? "Resetting..." : "Reset Password"}
            </Button>

            <div className="text-center mt-4">
              <Link 
                to="/auth" 
                className="text-[13px] text-primary hover:underline inline-flex items-center gap-1"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;

