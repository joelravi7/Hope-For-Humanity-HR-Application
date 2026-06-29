import { Redirect } from "expo-router";
import { useApp } from "@/context/AppContext";

export default function Index() {
  const { currentUser } = useApp();
  if (currentUser) {
    return <Redirect href="/(tabs)" />;
  }
  return <Redirect href="/login" />;
}
