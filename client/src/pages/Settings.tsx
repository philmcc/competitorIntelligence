import Layout from "../components/Layout";
import SubscriptionManagement from "../components/SubscriptionManagement";
import { useUser } from "../hooks/use-user";
import { useLocation } from "wouter";
import { useEffect } from "react";

export default function Settings() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useUser();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/auth");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <Layout>
      <div className="container py-6 space-y-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        <div className="space-y-6">
          <section>
            <h2 className="text-2xl font-semibold mb-4">Subscription</h2>
            <SubscriptionManagement />
          </section>
        </div>
      </div>
    </Layout>
  );
}
