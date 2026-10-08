import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SpecialCollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  if (slug === "geants-xxl") redirect("/themes/geants-xxl");
  notFound();
}
