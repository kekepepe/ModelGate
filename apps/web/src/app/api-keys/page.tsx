import { Suspense } from "react";

import { ApiKeysClient } from "@/components/api-keys/api-keys-client";

export default function ApiKeysPage() {
  return (
    <Suspense fallback={null}>
      <ApiKeysClient />
    </Suspense>
  );
}
