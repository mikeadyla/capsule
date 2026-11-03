import { Suspense } from "react";
import Capsule from "./_components/Capsule";

export default function Page() {
  return (
    <Suspense>
      <Capsule />
    </Suspense>
  );
}
