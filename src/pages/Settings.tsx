import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon, RefreshCw } from "lucide-react";
import { RecomputePositionsDialog } from "@/components/RecomputePositionsDialog";

const Settings = () => {
  const [recomputeDialogOpen, setRecomputeDialogOpen] = useState(false);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <SettingsIcon className="w-8 h-8" />
            Settings
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <Button 
            onClick={() => setRecomputeDialogOpen(true)}
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Recompute Positions
          </Button>
        </div>

        <RecomputePositionsDialog 
          open={recomputeDialogOpen}
          onOpenChange={setRecomputeDialogOpen}
        />
      </div>
    </DashboardLayout>
  );
};

export default Settings;

