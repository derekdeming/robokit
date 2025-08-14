import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function DatasetVisualizePage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/visualization?datasetId=${id}`);
}