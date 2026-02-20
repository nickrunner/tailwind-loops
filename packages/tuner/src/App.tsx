import { TwlProvider } from "@tailwind-loops/clients-react";
import { TunerPage } from "./pages/TunerPage.js";

export function App() {
  return (
    <TwlProvider config={{ baseUrl: "" }}>
      <TunerPage />
    </TwlProvider>
  );
}
