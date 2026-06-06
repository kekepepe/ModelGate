import { Suspense } from "react";

import { ActivityPage } from "@/components/activity/activity-page";

export default function ActivityRoute() {
  return (
    <Suspense fallback={null}>
      <ActivityPage />
    </Suspense>
  );
}
