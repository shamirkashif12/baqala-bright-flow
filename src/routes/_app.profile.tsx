import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { api, type User } from "@/lib/api";
import { useAuth, ROLE_LABELS } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_app/profile")({
  component: Profile,
});

function Profile() {
  const { user, updateLocalUser } = useAuth();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<User | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    api.getUser(user.id)
      .then((u) => {
        setProfile(u);
        setFullName(u.fullName);
        setEmail(u.email);
        setPhone(u.phone ?? "");
      })
      .catch(() => toast.error("Failed to load profile."))
      .finally(() => setLoading(false));
  }, [user?.id]);

  async function handleSave() {
    if (!user?.id) return;
    if (!fullName.trim() || !email.trim()) {
      toast.error("Name and email are required.");
      return;
    }
    setSaving(true);
    try {
      const updated = await api.updateUserProfile(user.id, {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
      });
      setProfile((p) => (p ? { ...p, ...updated } : p));
      updateLocalUser({ name: updated.fullName, email: updated.email });
      toast.success("Profile updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell title="My Profile" subtitle="View and update your account details">
      <Card className="max-w-xl p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl gradient-primary flex items-center justify-center text-primary-foreground font-bold shrink-0">
            {user?.initials ?? "U"}
          </div>
          <div>
            <p className="font-semibold">{user?.name ?? "User"}</p>
            <p className="text-xs text-muted-foreground">
              {user?.role ? t(ROLE_LABELS[user.role]) : "User"}
              {profile?.branchName ? ` · ${profile.branchName}` : ""}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Full Name</Label>
              <Input id="profile-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-email">Email</Label>
              <Input id="profile-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-phone">Phone</Label>
              <Input id="profile-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+966 5xx xxx xxx" />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border/60 bg-muted/30 text-sm text-muted-foreground">
                <UserIcon className="h-3.5 w-3.5" />
                {user?.role ? t(ROLE_LABELS[user.role]) : "—"}
                <span className="text-xs">(contact an admin to change your role)</span>
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        )}
      </Card>
    </PageShell>
  );
}
