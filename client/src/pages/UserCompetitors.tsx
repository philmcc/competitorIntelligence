import { useParams } from "wouter";
import useSWR from "swr";
import Layout from "../components/Layout";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface Competitor {
  id: number;
  name: string;
  website: string;
  isActive: boolean;
  isSelected: boolean;
  createdAt: string;
}

interface ApiResponse {
  status: string;
  data: Competitor[];
}

export default function UserCompetitors() {
  const { userId } = useParams();
  const [, setLocation] = useLocation();

  const { data, error, isLoading } = useSWR<ApiResponse>(
    `/api/admin/users/${userId}/competitors`
  );

  if (isLoading) {
    return (
      <Layout>
        <div className="container py-6">
          <div>Loading...</div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="container py-6">
          <div className="text-red-500">Error loading competitors: {error.message}</div>
        </div>
      </Layout>
    );
  }

  const competitors = data?.data || [];

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
                      <TableRow 
                        key={competitor.id}
                        className={cn(
                          !competitor.isSelected && "opacity-60 bg-muted/50",
                          competitor.isSelected && "bg-blue-50/50"
                        )}
                      >
                        <TableCell className="font-medium">
                          {competitor.name}
                        </TableCell>
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
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
                            competitor.isActive 
                              ? "bg-green-100 text-green-700" 
                              : "bg-gray-100 text-gray-700"
                          )}>
                            {competitor.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
                            competitor.isSelected 
                              ? "bg-blue-100 text-blue-700" 
                              : "bg-gray-100 text-gray-700"
                          )}>
                            {competitor.isSelected ? 'Yes' : 'No'}
                          </span>
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
