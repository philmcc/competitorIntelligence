import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import Layout from "../components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Competitor } from "db/schema";

export default function UserCompetitors() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Extract user ID from URL
  const userId = window.location.pathname.split('/').pop();

  useEffect(() => {
    async function fetchCompetitors() {
      try {
        const response = await fetch(`/api/admin/users/${userId}/competitors`, {
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error('Failed to fetch competitors');
        }

        const data = await response.json();
        setCompetitors(data.data);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to load competitors');
        toast({
          title: "Error",
          description: "Failed to load competitors",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    }

    if (userId) {
      fetchCompetitors();
    }
  }, [userId, toast]);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setLocation('/admin')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold">User Competitors</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Competitor List</CardTitle>
          </CardHeader>
          <CardContent>
            {competitors.length === 0 ? (
              <p className="text-center py-4 text-muted-foreground">
                No competitors found for this user.
              </p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Website</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Selected</TableHead>
                      <TableHead>Added On</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {competitors.map((competitor) => (
                      <TableRow key={competitor.id}>
                        <TableCell>{competitor.name}</TableCell>
                        <TableCell>
                          <a
                            href={competitor.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {competitor.website}
                          </a>
                        </TableCell>
                        <TableCell>
                          {competitor.isActive ? 'Active' : 'Inactive'}
                        </TableCell>
                        <TableCell>
                          {competitor.isSelected ? 'Yes' : 'No'}
                        </TableCell>
                        <TableCell>
                          {new Date(competitor.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
