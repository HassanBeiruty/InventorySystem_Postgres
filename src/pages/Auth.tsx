import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { auth } from "@/integrations/api/repo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Receipt } from "lucide-react";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";

const loginSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Password must contain at least one uppercase letter, one lowercase letter, and one number"),
});

const signUpSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Password must contain at least one uppercase letter, one lowercase letter, and one number"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const Auth = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChange((_event, session) => {
      if (session) navigate("/");
    });
    (async () => {
      const session = await auth.getSession();
      if (session) navigate("/");
    })();
    return () => { unsub(); };
  }, [navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (isLogin) {
        const validation = loginSchema.safeParse({ email, password });
        if (!validation.success) {
          toast.error(validation.error.errors[0].message);
          return;
        }
      } else {
        const validation = signUpSchema.safeParse({ email, password, confirmPassword });
        if (!validation.success) {
          toast.error(validation.error.errors[0].message);
          return;
        }
      }

      setLoading(true);

      if (isLogin) {
        await auth.signIn(email, password);
        toast.success("Logged in successfully!");
      } else {
        await auth.signUp(email, password);
        toast.success("Account created and signed in!");
      }
    } catch (error: any) {
      toast.error(error.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-primary/10 to-accent/10 p-4 relative overflow-hidden">
      {/* Theme and Language switchers */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <ThemeToggle />
        <LanguageSwitcher />
      </div>

      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-primary/20 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-secondary/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '4s' }} />
      </div>

      <Card className="w-full max-w-md shadow-elegant border-2 border-border/50 backdrop-blur-sm bg-card/95 animate-fade-in relative z-10">
        <CardHeader className="space-y-4 text-center pb-8">
          <div className="mx-auto w-20 h-20 gradient-primary rounded-3xl flex items-center justify-center shadow-glow animate-pulse-glow relative">
            <Receipt className="w-10 h-10 text-primary-foreground relative z-10" />
            <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent rounded-3xl" />
          </div>
          <CardTitle className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
            {t('auth.welcomeBack')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base font-medium">
            {isLogin ? t('auth.signInToContinue') : t('auth.createAccount')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleAuth} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold">{t('auth.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="h-11 border-2 focus:border-primary/50 transition-all"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold">{t('auth.password')}</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                minLength={8}
                className="h-11 border-2 focus:border-primary/50 transition-all"
              />
              {!isLogin && (
                <p className="text-xs text-muted-foreground">
                  Must be at least 8 characters with uppercase, lowercase, and a number
                </p>
              )}
            </div>
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-semibold">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength={8}
                  className="h-11 border-2 focus:border-primary/50 transition-all"
                />
              </div>
            )}
            {isLogin && (
              <div className="text-right">
                <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
            )}
            <Button 
              type="submit" 
              className="w-full h-11 gradient-primary hover:shadow-glow transition-all duration-300 hover:scale-[1.02] font-semibold text-base" 
              disabled={loading}
            >
              {loading ? t('common.loading') : isLogin ? t('auth.signIn') : t('auth.signUp')}
            </Button>
          </form>
          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setConfirmPassword(""); // Clear confirm password when switching modes
              }}
              className="text-primary hover:underline font-medium transition-colors"
              disabled={loading}
            >
              {isLogin ? t('auth.dontHaveAccount') + ' ' + t('auth.signUp') : t('auth.alreadyHaveAccount') + ' ' + t('auth.signIn')}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
