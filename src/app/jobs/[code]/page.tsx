import { JobView } from "@/components/job-view";

export default async function JobPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JobView code={code} />;
}
